/**
 * Caller finder for impact analysis.
 * Finds code that references a given symbol.
 */

import { execSync } from "node:child_process";
import { relative } from "node:path";

/**
 * A caller that might be affected by an edit.
 */
export interface FoundCaller {
  file: string;
  symbol: string;
  line: number;
  reason: string;
}

/**
 * Find callers of a symbol using grep.
 */
export function findSymbolCallers(
  rootPath: string,
  filePath: string,
  symbolName: string,
  maxCallers: number
): FoundCaller[] {
  const callers: FoundCaller[] = [];

  try {
    const output = execSync(
      `grep -rn "\\b${symbolName}\\b" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . 2>/dev/null || true`,
      {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 10000,
      }
    );

    const lines = output.trim().split("\n").filter(Boolean);
    const relativeSrcPath = relative(rootPath, filePath);

    for (const line of lines.slice(0, maxCallers)) {
      const match = line.match(/^\.\/(.+?):(\d+):/);
      if (match && match[1] !== relativeSrcPath) {
        callers.push({
          file: match[1],
          symbol: "unknown",
          line: parseInt(match[2], 10),
          reason: `Uses ${symbolName}`,
        });
      }
    }
  } catch {
    // Ignore grep errors
  }

  return callers;
}

/**
 * Deduplicate callers by file+line.
 */
export function deduplicateCallers(callers: FoundCaller[]): FoundCaller[] {
  const seen = new Set<string>();
  return callers.filter((c) => {
    const key = `${c.file}:${c.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
