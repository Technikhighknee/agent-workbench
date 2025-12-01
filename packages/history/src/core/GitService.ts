/**
 * Git operations service.
 * Wraps git CLI commands with structured output.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import {
  type Result,
  ok,
  err,
  type BlameResult,
  type BlameLine,
  type Commit,
  type ChangedFile,
  type RecentChanges,
} from "./model.js";

export class GitService {
  constructor(private readonly rootPath: string) {}

  /**
   * Execute a git command and return stdout.
   */
  private async exec(args: string[]): Promise<Result<string>> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, {
        cwd: this.rootPath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(ok(stdout));
        } else {
          resolve(err(stderr.trim() || `git exited with code ${code}`));
        }
      });

      proc.on("error", (error) => {
        resolve(err(`Failed to spawn git: ${error.message}`));
      });
    });
  }

  /**
   * Check if path is inside a git repository.
   */
  async isGitRepo(): Promise<boolean> {
    const result = await this.exec(["rev-parse", "--git-dir"]);
    return result.ok;
  }

  /**
   * Get blame for a file.
   */
  async blame(filePath: string): Promise<Result<BlameResult>> {
    // Use porcelain format for machine parsing
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    const result = await this.exec([
      "blame",
      "--porcelain",
      "-w", // ignore whitespace
      relPath,
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    const lines = this.parseBlameOutput(result.value);
    return ok({ filePath: relPath, lines });
  }

  /**
   * Parse git blame porcelain output.
   */
  private parseBlameOutput(output: string): BlameLine[] {
    const lines: BlameLine[] = [];
    const rawLines = output.split("\n");

    let i = 0;
    let lineNum = 0;
    const commitCache = new Map<
      string,
      { author: string; email: string; date: string; message: string }
    >();

    while (i < rawLines.length) {
      const headerLine = rawLines[i];
      if (!headerLine) {
        i++;
        continue;
      }

      // Header: <sha> <orig-line> <final-line> [<group-count>]
      const headerMatch = headerLine.match(/^([a-f0-9]{40})\s+(\d+)\s+(\d+)/);
      if (!headerMatch) {
        i++;
        continue;
      }

      const commit = headerMatch[1].substring(0, 7);
      const fullHash = headerMatch[1];
      lineNum = parseInt(headerMatch[3], 10);
      i++;

      // Read commit info lines until we hit the content line
      let author = "";
      let email = "";
      let date = "";
      let message = "";

      // Check cache first
      const cached = commitCache.get(fullHash);
      if (cached) {
        author = cached.author;
        email = cached.email;
        date = cached.date;
        message = cached.message;
      }

      while (i < rawLines.length && !rawLines[i].startsWith("\t")) {
        const line = rawLines[i];
        if (line.startsWith("author ")) {
          author = line.substring(7);
        } else if (line.startsWith("author-mail ")) {
          email = line.substring(12).replace(/[<>]/g, "");
        } else if (line.startsWith("author-time ")) {
          const timestamp = parseInt(line.substring(12), 10);
          date = new Date(timestamp * 1000).toISOString();
        } else if (line.startsWith("summary ")) {
          message = line.substring(8);
        }
        i++;
      }

      // Cache commit info
      if (!cached && author) {
        commitCache.set(fullHash, { author, email, date, message });
      }

      // Content line starts with tab
      const content = i < rawLines.length ? rawLines[i].substring(1) : "";
      i++;

      lines.push({
        line: lineNum,
        commit,
        author,
        email,
        date,
        message,
        content,
      });
    }

    return lines;
  }

  /**
   * Get commit history for a file.
   */
  async fileHistory(
    filePath: string,
    limit: number = 20
  ): Promise<Result<Commit[]>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    // Use %x00 (null byte) as delimiter to handle | in commit messages
    const result = await this.exec([
      "log",
      `--max-count=${limit}`,
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P",
      "--follow",
      "--",
      relPath,
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    const commits = this.parseLogOutput(result.value, "\x00");
    return ok(commits);
  }

  /**
   * Get recent changes across the repository.
   */
  async recentChanges(count: number = 10): Promise<Result<RecentChanges>> {
    // Use %x00 as delimiter for commit fields, but keep commits separated by newlines
    const logResult = await this.exec([
      "log",
      `--max-count=${count}`,
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P",
      "--stat",
      "--stat-width=1000",
    ]);

    if (!logResult.ok) {
      return err(logResult.error);
    }

    const commits: Commit[] = [];
    const filesChanged = new Set<string>();
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Parse log with stats - commits start with a 40-char hash followed by null byte
    const sections = logResult.value.split(/\n(?=[a-f0-9]{40}\x00)/);
    for (const section of sections) {
      if (!section.trim()) continue;

      const lines = section.split("\n");
      const firstLine = lines[0];
      const parts = firstLine.split("\x00");
      if (parts.length < 6) continue;

      const commit: Commit = {
        hash: parts[0],
        shortHash: parts[1],
        author: parts[2],
        email: parts[3],
        date: parts[4],
        subject: parts[5],
        message: parts[5],
        parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
        files: [],
      };

      // Parse stat lines
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Match file stat lines: " file.ts | 10 ++++----"
        const statMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
        if (statMatch) {
          const filePath = statMatch[1].trim();
          filesChanged.add(filePath);

          const changes = statMatch[3] || "";
          const adds = (changes.match(/\+/g) || []).length;
          const dels = (changes.match(/-/g) || []).length;
          totalAdditions += adds;
          totalDeletions += dels;

          commit.files!.push({
            path: filePath,
            status: "M",
            additions: adds,
            deletions: dels,
          });
        }
      }

      commits.push(commit);
    }

    return ok({
      commits,
      filesChanged: Array.from(filesChanged).sort(),
      totalAdditions,
      totalDeletions,
    });
  }

  /**
   * Get details of a specific commit.
   */
  async commitInfo(ref: string): Promise<Result<Commit>> {
    // Get commit metadata using null byte delimiter
    const metaResult = await this.exec([
      "log",
      "-1",
      ref,
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P",
    ]);

    if (!metaResult.ok) {
      return err(metaResult.error);
    }

    const metaLine = metaResult.value.trim();
    const parts = metaLine.split("\x00");

    if (parts.length < 6) {
      return err("Failed to parse commit info");
    }

    const commit: Commit = {
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      subject: parts[5],
      message: parts[5], // Will be overwritten with full body if available
      parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
      files: [],
    };

    // Get full commit body
    const bodyResult = await this.exec(["log", "-1", ref, "--format=%B"]);
    if (bodyResult.ok) {
      commit.message = bodyResult.value.trim();
    }

    // Get file stats
    const statsResult = await this.exec([
      "show",
      ref,
      "--stat",
      "--stat-width=1000",
      "--format=",
    ]);

    if (statsResult.ok) {
      const statLines = statsResult.value.split("\n");
      for (const line of statLines) {
        const statMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
        if (statMatch) {
          const changes = statMatch[3] || "";
          commit.files!.push({
            path: statMatch[1].trim(),
            status: "M",
            additions: (changes.match(/\+/g) || []).length,
            deletions: (changes.match(/-/g) || []).length,
          });
        }
      }
    }

    return ok(commit);
  }

  /**
   * Search commits by message content.
   */
  async searchCommits(
    query: string,
    limit: number = 20
  ): Promise<Result<Commit[]>> {
    const result = await this.exec([
      "log",
      `--max-count=${limit}`,
      "--format=%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%P",
      "--grep",
      query,
      "-i", // case insensitive
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    const commits = this.parseLogOutput(result.value, "\x00");
    return ok(commits);
  }

  /**
   * Get diff of a file between commits.
   */
  async diffFile(
    filePath: string,
    fromRef: string = "HEAD~1",
    toRef: string = "HEAD"
  ): Promise<Result<string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    const result = await this.exec(["diff", fromRef, toRef, "--", relPath]);

    if (!result.ok) {
      return err(result.error);
    }

    return ok(result.value);
  }

  /**
   * Get a summary of changes between two branches.
   * Useful for understanding PR scope.
   */
  async branchDiff(
    base: string = "main",
    head: string = "HEAD"
  ): Promise<Result<import("./model.js").BranchDiff>> {
    // Get the merge base
    const mergeBaseResult = await this.exec(["merge-base", base, head]);
    if (!mergeBaseResult.ok) {
      return err(`Failed to find merge base: ${mergeBaseResult.error}`);
    }
    const mergeBase = mergeBaseResult.value.trim();

    // Get commits ahead (on head but not on base)
    const aheadResult = await this.exec([
      "rev-list",
      "--count",
      `${mergeBase}..${head}`,
    ]);
    const commitsAhead = aheadResult.ok ? parseInt(aheadResult.value.trim(), 10) : 0;

    // Get commits behind (on base but not on head)
    const behindResult = await this.exec([
      "rev-list",
      "--count",
      `${mergeBase}..${base}`,
    ]);
    const commitsBehind = behindResult.ok ? parseInt(behindResult.value.trim(), 10) : 0;

    // Get changed files with stats
    const diffResult = await this.exec([
      "diff",
      "--numstat",
      "--name-status",
      `${mergeBase}...${head}`,
    ]);

    if (!diffResult.ok) {
      return err(`Failed to get diff: ${diffResult.error}`);
    }

    // Parse the diff output
    const files: ChangedFile[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Get detailed file changes
    const detailedResult = await this.exec([
      "diff",
      "--numstat",
      `${mergeBase}...${head}`,
    ]);

    if (detailedResult.ok) {
      const lines = detailedResult.value.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
        if (match) {
          const additions = match[1] === "-" ? 0 : parseInt(match[1], 10);
          const deletions = match[2] === "-" ? 0 : parseInt(match[2], 10);
          const filePath = match[3];

          totalAdditions += additions;
          totalDeletions += deletions;

          files.push({
            path: filePath,
            status: "M", // Will be updated below
            additions,
            deletions,
          });
        }
      }
    }

    // Get status for each file
    const statusResult = await this.exec([
      "diff",
      "--name-status",
      `${mergeBase}...${head}`,
    ]);

    if (statusResult.ok) {
      const statusMap = new Map<string, "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X">();
      const lines = statusResult.value.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^([AMDRTCUX])\t(.+)$/);
        if (match) {
          statusMap.set(match[2], match[1] as "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X");
        }
      }
      for (const file of files) {
        const status = statusMap.get(file.path);
        if (status) {
          file.status = status;
        }
      }
    }

    return ok({
      base,
      head,
      commitsAhead,
      commitsBehind,
      files,
      totalAdditions,
      totalDeletions,
      mergeBase,
    });
  }

  /**
   * Parse standard log format output.
   */
  private parseLogOutput(output: string, delimiter: string = "|"): Commit[] {
    const commits: Commit[] = [];
    const lines = output.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const parts = line.split(delimiter);
      if (parts.length < 6) continue;

      commits.push({
        hash: parts[0],
        shortHash: parts[1],
        author: parts[2],
        email: parts[3],
        date: parts[4],
        subject: parts[5],
        message: parts[5],
        parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
      });
    }

    return commits;
  }
}
