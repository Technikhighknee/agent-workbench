/**
 * Git operations service.
 * Wraps git CLI commands with structured output.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";

import { AddResult, BlameLine, BlameResult, ChangedFile, ChangedSymbol, ChangedSymbolsResult, Commit, CommitResult, GitStatus, RecentChanges, Result, StatusFile, err, ok } from "./model.js";
import { analyzeChangedSymbols, parseDiffOutput } from "./SymbolDiffAnalyzer.js";

export class GitService {
  constructor(private readonly rootPath: string) {}

  /**
   * Execute a git command and return stdout.
   */
  private async exec(args: string[], timeoutMs: number = 30000): Promise<Result<string, string>> {
    return new Promise((resolve) => {
      const proc = spawn("git", args, {
        cwd: this.rootPath,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve(err(`git command timed out after ${timeoutMs}ms: git ${args.join(" ")}`));
        }
      }, timeoutMs);

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(ok(stdout));
        } else {
          resolve(err(stderr.trim() || `git exited with code ${code}`));
        }
      });

      proc.on("error", (error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
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
  async blame(filePath: string): Promise<Result<BlameResult, string>> {
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
  ): Promise<Result<Commit[], string>> {
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
  async recentChanges(count: number = 10): Promise<Result<RecentChanges, string>> {
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
  async commitInfo(ref: string): Promise<Result<Commit, string>> {
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
  ): Promise<Result<Commit[], string>> {
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
  ): Promise<Result<string, string>> {
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
  ): Promise<Result<import("./model.js").BranchDiff, string>> {
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

  // ============== WRITE OPERATIONS ==============

  /**
   * Get the current git status.
   */
  async status(): Promise<Result<GitStatus, string>> {
    // Use porcelain=v2 for machine-readable output
    const result = await this.exec([
      "status",
      "--porcelain=v2",
      "--branch",
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    const status: GitStatus = {
      branch: "",
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      untracked: [],
      conflicted: [],
    };

    const lines = result.value.split("\n");
    for (const line of lines) {
      if (!line) continue;

      // Branch header: # branch.head <name>
      if (line.startsWith("# branch.head ")) {
        status.branch = line.slice(14);
      }
      // Upstream: # branch.upstream <name>
      else if (line.startsWith("# branch.upstream ")) {
        status.upstream = line.slice(18);
      }
      // Ahead/behind: # branch.ab +<ahead> -<behind>
      else if (line.startsWith("# branch.ab ")) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          status.ahead = parseInt(match[1], 10);
          status.behind = parseInt(match[2], 10);
        }
      }
      // Changed entry: 1 <XY> ... <path>
      else if (line.startsWith("1 ")) {
        const parts = line.split(" ");
        const xy = parts[1]; // XY status
        const filePath = parts.slice(8).join(" ");

        const stagedStatus = xy[0];
        const unstagedStatus = xy[1];

        if (stagedStatus !== ".") {
          status.staged.push({
            path: filePath,
            status: stagedStatus as StatusFile["status"],
          });
        }
        if (unstagedStatus !== ".") {
          status.unstaged.push({
            path: filePath,
            status: unstagedStatus as StatusFile["status"],
          });
        }
      }
      // Renamed: 2 <XY> ... <path><tab><origPath>
      else if (line.startsWith("2 ")) {
        const parts = line.split("\t");
        const mainPart = parts[0].split(" ");
        const xy = mainPart[1];
        const filePath = mainPart.slice(9).join(" ");
        const oldPath = parts[1];

        if (xy[0] !== ".") {
          status.staged.push({
            path: filePath,
            status: "R",
            oldPath,
          });
        }
      }
      // Unmerged: u <XY> ... <path>
      else if (line.startsWith("u ")) {
        const parts = line.split(" ");
        const filePath = parts.slice(10).join(" ");
        status.conflicted.push(filePath);
      }
      // Untracked: ? <path>
      else if (line.startsWith("? ")) {
        status.untracked.push(line.slice(2));
      }
    }

    return ok(status);
  }

  /**
   * Stage files for commit.
   */
  async add(paths: string[]): Promise<Result<AddResult, string>> {
    if (paths.length === 0) {
      return err("No files specified to add");
    }

    // Resolve paths
    const resolvedPaths = paths.map((p) =>
      path.isAbsolute(p) ? path.relative(this.rootPath, p) : p
    );

    const result = await this.exec(["add", "--verbose", ...resolvedPaths]);

    if (!result.ok) {
      return err(result.error);
    }

    // Parse verbose output to get added files
    const added: string[] = [];
    const lines = result.value.split("\n").filter(Boolean);
    for (const line of lines) {
      // Verbose output: "add 'filename'"
      const match = line.match(/^add '(.+)'$/);
      if (match) {
        added.push(match[1]);
      }
    }

    // If verbose didn't give us output, assume all specified files were added
    if (added.length === 0 && result.value.trim() === "") {
      added.push(...resolvedPaths);
    }

    return ok({
      added,
      count: added.length,
    });
  }

  /**
   * Create a commit with staged changes.
   */
  async commit(message: string): Promise<Result<CommitResult, string>> {
    if (!message.trim()) {
      return err("Commit message cannot be empty");
    }

    // Check if there are staged changes
    const statusResult = await this.status();
    if (!statusResult.ok) {
      return err(statusResult.error);
    }
    if (statusResult.value.staged.length === 0) {
      return err("No staged changes to commit");
    }

    // Create the commit
    const result = await this.exec(["commit", "-m", message]);

    if (!result.ok) {
      return err(result.error);
    }

    // Get commit details
    const commitResult = await this.exec([
      "log",
      "-1",
      "--format=%H%x00%h%x00%s",
    ]);

    if (!commitResult.ok) {
      return err(`Commit created but failed to get details: ${commitResult.error}`);
    }

    const parts = commitResult.value.trim().split("\x00");
    const hash = parts[0];
    const shortHash = parts[1];
    const subject = parts[2];

    // Get stats from the commit output
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    // Parse commit output for stats: "X files changed, Y insertions(+), Z deletions(-)"
    const statsMatch = result.value.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
    );
    if (statsMatch) {
      filesChanged = parseInt(statsMatch[1], 10) || 0;
      insertions = parseInt(statsMatch[2], 10) || 0;
      deletions = parseInt(statsMatch[3], 10) || 0;
    }

    return ok({
      hash,
      shortHash,
      subject,
      filesChanged,
      insertions,
      deletions,
    });
  }

  /**
   * Get current branch name.
   */
  async getCurrentBranch(): Promise<Result<string, string>> {
    const result = await this.exec(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!result.ok) {
      return err(result.error);
    }
    return ok(result.value.trim());
  }

  /**
   * Get file content at a specific git ref.
   */
  async getFileAtRef(ref: string, filePath: string): Promise<Result<string, string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    const result = await this.exec(["show", `${ref}:${relPath}`]);
    if (!result.ok) {
      // File might not exist at this ref
      if (result.error.includes("does not exist") || result.error.includes("fatal: path")) {
        return ok(""); // Return empty string for non-existent files
      }
      return err(result.error);
    }

    return ok(result.value);
  }

  /**
   * Get symbols that changed between two git refs.
   * Useful for understanding what functions/classes were added, modified, or deleted.
   */
  /**
   * Get symbols that changed between two git refs.
   * Useful for understanding what functions/classes were added, modified, or deleted.
   */
  async changedSymbols(
    fromRef: string = "HEAD~1",
    toRef: string = "HEAD",
    filePattern?: string
  ): Promise<Result<ChangedSymbolsResult, string>> {
    // Get the list of changed files
    const diffResult = await this.exec([
      "diff",
      "--name-status",
      fromRef,
      toRef,
      "--",
      ...(filePattern ? [filePattern] : []),
    ]);

    if (!diffResult.ok) {
      return err(diffResult.error);
    }

    const changedFiles = parseDiffOutput(diffResult.value);
    const result = await analyzeChangedSymbols(changedFiles, fromRef, toRef, {
      getFileAtRef: (ref, path) => this.getFileAtRef(ref, path),
    });

    return ok(result);
  }
}
