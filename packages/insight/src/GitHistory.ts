/**
 * Git history utilities for insight gathering.
 */

import { execSync } from "node:child_process";
import { relative } from "node:path";

import type { RecentChange } from "./model.js";

/**
 * Get recent changes for a file from git history.
 */
export function getRecentChangesForFile(
  rootPath: string,
  filePath: string,
  maxChanges: number
): RecentChange[] {
  try {
    const relativePath = relative(rootPath, filePath);
    const output = execSync(
      `git log -${maxChanges} --format="%h|||%an|||%s|||%cr" -- "${relativePath}"`,
      { cwd: rootPath, encoding: "utf-8" }
    );

    return parseGitLogOutput(output);
  } catch {
    return [];
  }
}

/**
 * Get recent changes for a directory from git history.
 */
export function getRecentChangesForDirectory(
  rootPath: string,
  dirPath: string,
  maxChanges: number
): RecentChange[] {
  try {
    const relativePath = relative(rootPath, dirPath);
    const output = execSync(
      `git log -${maxChanges} --format="%h|||%an|||%s|||%cr" -- "${relativePath}"`,
      { cwd: rootPath, encoding: "utf-8" }
    );

    return parseGitLogOutput(output);
  } catch {
    return [];
  }
}

/**
 * Get recent changes for a symbol (currently uses file history).
 */
export function getRecentChangesForSymbol(
  rootPath: string,
  filePath: string,
  _line: number, // TODO: Could filter by line range in future
  maxChanges: number
): RecentChange[] {
  return getRecentChangesForFile(rootPath, filePath, maxChanges);
}

/**
 * Parse git log output into RecentChange array.
 */
function parseGitLogOutput(output: string): RecentChange[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, author, message, date] = line.split("|||");
      return { hash, author, message, date };
    });
}
