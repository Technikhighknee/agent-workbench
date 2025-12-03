/**
 * Git operations service.
 * Wraps git CLI commands with structured output.
 */

import * as path from "node:path";

import {
  AddResult,
  BlameResult,
  BranchDiff,
  ChangedFile,
  ChangedSymbolsResult,
  Commit,
  CommitResult,
  GitStatus,
  RecentChanges,
  Result,
  err,
  ok,
} from "./model.js";
import { analyzeChangedSymbols, parseDiffOutput } from "./SymbolDiffAnalyzer.js";
import { GitExecutor } from "./GitExecutor.js";
import { parseBlameOutput } from "./BlameParser.js";
import { parseLogOutput, parseLogWithStats, parseStatLines } from "./LogParser.js";
import { parseStatusOutput } from "./StatusParser.js";

export class GitService {
  private readonly executor: GitExecutor;

  constructor(private readonly rootPath: string) {
    this.executor = new GitExecutor(rootPath);
  }

  private exec(args: string[], timeoutMs?: number): Promise<Result<string, string>> {
    return this.executor.exec(args, timeoutMs);
  }

  async isGitRepo(): Promise<boolean> {
    const result = await this.exec(["rev-parse", "--git-dir"]);
    return result.ok;
  }

  async blame(filePath: string): Promise<Result<BlameResult, string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    const result = await this.exec(["blame", "--porcelain", "-w", relPath]);
    if (!result.ok) {
      return err(result.error);
    }

    const lines = parseBlameOutput(result.value);
    return ok({ filePath: relPath, lines });
  }

  async fileHistory(
    filePath: string,
    limit: number = 20
  ): Promise<Result<Commit[], string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

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

    return ok(parseLogOutput(result.value, "\x00"));
  }

  async recentChanges(count: number = 10): Promise<Result<RecentChanges, string>> {
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

    return ok(parseLogWithStats(logResult.value));
  }

  async commitInfo(ref: string): Promise<Result<Commit, string>> {
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
      message: parts[5],
      parents: parts[6] ? parts[6].split(" ").filter(Boolean) : [],
      files: [],
    };

    const bodyResult = await this.exec(["log", "-1", ref, "--format=%B"]);
    if (bodyResult.ok) {
      commit.message = bodyResult.value.trim();
    }

    const statsResult = await this.exec([
      "show",
      ref,
      "--stat",
      "--stat-width=1000",
      "--format=",
    ]);

    if (statsResult.ok) {
      commit.files = parseStatLines(statsResult.value);
    }

    return ok(commit);
  }

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
      "-i",
    ]);

    if (!result.ok) {
      return err(result.error);
    }

    return ok(parseLogOutput(result.value, "\x00"));
  }

  async diffFile(
    filePath: string,
    fromRef: string = "HEAD~1",
    toRef: string = "HEAD"
  ): Promise<Result<string, string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    return this.exec(["diff", fromRef, toRef, "--", relPath]);
  }

  async branchDiff(
    base: string = "main",
    head: string = "HEAD"
  ): Promise<Result<BranchDiff, string>> {
    const mergeBaseResult = await this.exec(["merge-base", base, head]);
    if (!mergeBaseResult.ok) {
      return err(`Failed to find merge base: ${mergeBaseResult.error}`);
    }
    const mergeBase = mergeBaseResult.value.trim();

    const aheadResult = await this.exec([
      "rev-list",
      "--count",
      `${mergeBase}..${head}`,
    ]);
    const commitsAhead = aheadResult.ok ? parseInt(aheadResult.value.trim(), 10) : 0;

    const behindResult = await this.exec([
      "rev-list",
      "--count",
      `${mergeBase}..${base}`,
    ]);
    const commitsBehind = behindResult.ok ? parseInt(behindResult.value.trim(), 10) : 0;

    const files: ChangedFile[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

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
          totalAdditions += additions;
          totalDeletions += deletions;
          files.push({
            path: match[3],
            status: "M",
            additions,
            deletions,
          });
        }
      }
    }

    const statusResult = await this.exec([
      "diff",
      "--name-status",
      `${mergeBase}...${head}`,
    ]);

    if (statusResult.ok) {
      const statusMap = new Map<string, ChangedFile["status"]>();
      const lines = statusResult.value.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const match = line.match(/^([AMDRTCUX])\t(.+)$/);
        if (match) {
          statusMap.set(match[2], match[1] as ChangedFile["status"]);
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

  async status(): Promise<Result<GitStatus, string>> {
    const result = await this.exec(["status", "--porcelain=v2", "--branch"]);
    if (!result.ok) {
      return err(result.error);
    }
    return ok(parseStatusOutput(result.value));
  }

  async add(paths: string[]): Promise<Result<AddResult, string>> {
    if (paths.length === 0) {
      return err("No files specified to add");
    }

    const resolvedPaths = paths.map((p) =>
      path.isAbsolute(p) ? path.relative(this.rootPath, p) : p
    );

    const result = await this.exec(["add", "--verbose", ...resolvedPaths]);
    if (!result.ok) {
      return err(result.error);
    }

    const added: string[] = [];
    const lines = result.value.split("\n").filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^add '(.+)'$/);
      if (match) {
        added.push(match[1]);
      }
    }

    if (added.length === 0 && result.value.trim() === "") {
      added.push(...resolvedPaths);
    }

    return ok({ added, count: added.length });
  }

  async commit(message: string): Promise<Result<CommitResult, string>> {
    if (!message.trim()) {
      return err("Commit message cannot be empty");
    }

    const statusResult = await this.status();
    if (!statusResult.ok) {
      return err(statusResult.error);
    }
    if (statusResult.value.staged.length === 0) {
      return err("No staged changes to commit");
    }

    const result = await this.exec(["commit", "-m", message]);
    if (!result.ok) {
      return err(result.error);
    }

    const commitResult = await this.exec([
      "log",
      "-1",
      "--format=%H%x00%h%x00%s",
    ]);

    if (!commitResult.ok) {
      return err(`Commit created but failed to get details: ${commitResult.error}`);
    }

    const parts = commitResult.value.trim().split("\x00");
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    const statsMatch = result.value.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
    );
    if (statsMatch) {
      filesChanged = parseInt(statsMatch[1], 10) || 0;
      insertions = parseInt(statsMatch[2], 10) || 0;
      deletions = parseInt(statsMatch[3], 10) || 0;
    }

    return ok({
      hash: parts[0],
      shortHash: parts[1],
      subject: parts[2],
      filesChanged,
      insertions,
      deletions,
    });
  }

  async getCurrentBranch(): Promise<Result<string, string>> {
    const result = await this.exec(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!result.ok) {
      return err(result.error);
    }
    return ok(result.value.trim());
  }

  async getFileAtRef(ref: string, filePath: string): Promise<Result<string, string>> {
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootPath, filePath);
    const relPath = path.relative(this.rootPath, absPath);

    const result = await this.exec(["show", `${ref}:${relPath}`]);
    if (!result.ok) {
      if (result.error.includes("does not exist") || result.error.includes("fatal: path")) {
        return ok("");
      }
      return err(result.error);
    }

    return ok(result.value);
  }

  async changedSymbols(
    fromRef: string = "HEAD~1",
    toRef: string = "HEAD",
    filePattern?: string
  ): Promise<Result<ChangedSymbolsResult, string>> {
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
      getFileAtRef: (ref, p) => this.getFileAtRef(ref, p),
    });

    return ok(result);
  }
}
