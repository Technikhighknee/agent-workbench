/**
 * File utilities for TaskRunner log management.
 */
import { readFileSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";
import { cleanOutput } from "./cleanOutput.js";

/**
 * Read the last N lines of a file.
 */
export function tailFile(filePath: string, lines: number): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    // Remove trailing empty string if file ends with newline
    if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
      allLines.pop();
    }
    return cleanOutput(allLines.slice(-lines).join("\n"));
  } catch {
    return "";
  }
}

/**
 * Read the last N bytes of a file.
 */
export function tailBytes(filePath: string, bytes: number): string {
  try {
    const stats = statSync(filePath);
    if (stats.size <= bytes) {
      return readFileSync(filePath, "utf-8");
    }

    const fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(bytes);
    const startPos = stats.size - bytes;

    readSync(fd, buffer, 0, bytes, startPos);
    closeSync(fd);

    return cleanOutput(buffer.toString("utf-8"));
  } catch {
    return "";
  }
}

/**
 * Truncate a log file to a maximum size, keeping the end.
 */
export function truncateLogFile(filePath: string, maxSize: number): void {
  try {
    const content = tailBytes(filePath, maxSize - 50);
    const truncatedContent = "[Log truncated due to size limit]\n\n" + content;
    writeFileSync(filePath, truncatedContent);
  } catch {
    // Ignore truncation errors
  }
}
