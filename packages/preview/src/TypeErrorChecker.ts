/**
 * Type error checker using tsc.
 * Runs TypeScript compiler and parses output for errors.
 */

import { execSync } from "node:child_process";

/**
 * A type error from tsc.
 */
export interface TypeCheckError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
  severity: "error" | "warning";
}

/**
 * Run tsc and return any type errors.
 */
export function runTypeCheck(rootPath: string): TypeCheckError[] {
  try {
    execSync("npx tsc --noEmit 2>&1", {
      cwd: rootPath,
      encoding: "utf-8",
      timeout: 30000,
    });
    return [];
  } catch (error: unknown) {
    const output = (error as { stdout?: string }).stdout || "";
    return parseTscOutput(output);
  }
}

/**
 * Parse tsc output into structured errors.
 */
export function parseTscOutput(output: string): TypeCheckError[] {
  const errors: TypeCheckError[] = [];
  const lines = output.split("\n");

  // Pattern: file(line,col): error TS1234: message
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(errorPattern);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        severity: match[4] as "error" | "warning",
        code: match[5],
        message: match[6],
      });
    }
  }

  return errors;
}
