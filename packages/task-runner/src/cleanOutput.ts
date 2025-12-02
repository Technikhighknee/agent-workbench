/**
 * Output cleaning utilities.
 * Strips ANSI codes, removes noise, compacts output for AI consumption.
 */

import stripAnsi from "strip-ansi";

/**
 * Patterns that indicate "noise" lines to remove.
 * These are typically progress indicators, spinners, or transient output.
 */
const NOISE_PATTERNS = [
  // Progress bars - match [====>    ] 50% style and similar
  /^\s*\[[\s#=\->░▓█]+\]\s*\d*%?\s*$/,

  // Spinner characters
  /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏◐◓◑◒|\\\/\-]+$/,

  // "Downloading..." with changing numbers
  /^(Downloading|Uploading|Installing|Compiling|Building).*\d+(\.\d+)?\s*(KB|MB|GB|%).*$/i,

  // npm/yarn progress
  /^\s*[\[\(]?\d+\/\d+[\]\)]?\s*$/,

  // Lines that are just dots or dashes (progress indicators)
  /^[\s.\-_]+$/,

  // Cursor movement artifacts (lines starting with carriage return or containing \r)
  /\r/,

  // Empty brackets or parens that are progress artifacts
  /^\s*[\[\(\{\}\)\]]+\s*$/,
];

/**
 * Patterns for lines that should be kept even if short.
 */
const KEEP_PATTERNS = [
  // Error indicators
  /error/i,
  /fail/i,
  /exception/i,
  /warning/i,

  // Success indicators
  /success/i,
  /complete/i,
  /done/i,
  /passed/i,

  // Important status
  /ready/i,
  /listening/i,
  /started/i,
  /running/i,
];

/**
 * Clean a single line of output.
 *
 * @param line The line to clean
 * @returns Cleaned line, or null if it should be removed
 */
function cleanLine(line: string): string | null {
  // Strip ANSI codes first
  let cleaned = stripAnsi(line);

  // Trim whitespace
  cleaned = cleaned.trim();

  // Empty lines are kept (for readability) but normalized
  if (cleaned === "") {
    return "";
  }

  // Check if it's noise
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(cleaned)) {
      return null;
    }
  }

  // Very short lines (< 3 chars) are usually artifacts unless they match keep patterns
  if (cleaned.length < 3) {
    for (const pattern of KEEP_PATTERNS) {
      if (pattern.test(cleaned)) {
        return cleaned;
      }
    }
    // Likely noise
    return null;
  }

  return cleaned;
}

/**
 * Clean output by removing ANSI codes and noise.
 *
 * @param output Raw output string
 * @returns Cleaned output
 */
export function cleanOutput(output: string): string {
  const lines = output.split("\n");
  const cleaned: string[] = [];

  let consecutiveEmpty = 0;
  const MAX_CONSECUTIVE_EMPTY = 1;

  for (const line of lines) {
    const cleanedLine = cleanLine(line);

    if (cleanedLine === null) {
      // Skip noise lines
      continue;
    }

    if (cleanedLine === "") {
      consecutiveEmpty++;
      // Allow some empty lines for readability, but not too many
      if (consecutiveEmpty <= MAX_CONSECUTIVE_EMPTY) {
        cleaned.push("");
      }
    } else {
      consecutiveEmpty = 0;
      cleaned.push(cleanedLine);
    }
  }

  // Trim leading/trailing empty lines
  while (cleaned.length > 0 && cleaned[0] === "") {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1] === "") {
    cleaned.pop();
  }

  return cleaned.join("\n");
}

/**
 * Compact output by keeping only the most relevant parts.
 * Useful when output is very large.
 *
 * Strategy:
 * - Keep first N lines (initial output, often has command info)
 * - Keep last M lines (final result, errors usually at end)
 * - Keep lines matching important patterns
 * - Add truncation marker in middle
 *
 * @param output The output to compact
 * @param maxLines Maximum total lines to keep
 * @returns Compacted output
 */
export function compactOutput(output: string, maxLines: number = 100): string {
  const lines = output.split("\n");

  if (lines.length <= maxLines) {
    return output;
  }

  const headLines = Math.floor(maxLines * 0.3); // 30% from start
  const tailLines = Math.floor(maxLines * 0.5); // 50% from end
  const importantLines = maxLines - headLines - tailLines - 1; // Rest for important lines

  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const middle = lines.slice(headLines, -tailLines);

  // Find important lines in the middle
  const important: string[] = [];
  for (const line of middle) {
    if (important.length >= importantLines) break;

    for (const pattern of KEEP_PATTERNS) {
      if (pattern.test(line)) {
        important.push(line);
        break;
      }
    }
  }

  const omitted = lines.length - head.length - tail.length - important.length;
  const truncationMarker = `\n... (${omitted} lines omitted) ...\n`;

  return [...head, truncationMarker, ...important, ...tail].join("\n");
}

/**
 * Truncate output to a maximum size in bytes.
 *
 * @param output The output to truncate
 * @param maxBytes Maximum size in bytes
 * @returns Object with truncated output and whether truncation occurred
 */
export function truncateOutput(
  output: string,
  maxBytes: number
): { output: string; truncated: boolean } {
  const bytes = Buffer.byteLength(output, "utf8");

  if (bytes <= maxBytes) {
    return { output, truncated: false };
  }

  // Binary search for the right cut point
  let low = 0;
  let high = output.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (Buffer.byteLength(output.slice(0, mid), "utf8") <= maxBytes - 50) {
      // -50 for truncation marker
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const truncated = output.slice(0, low);
  const marker = "\n\n... (output truncated) ...";

  return {
    output: truncated + marker,
    truncated: true,
  };
}

/**
 * Process raw output: clean, compact if needed, truncate if needed.
 *
 * @param output Raw output
 * @param maxBytes Maximum size in bytes
 * @param maxLines Maximum lines (for compaction)
 * @returns Processed output with metadata
 */
export function processOutput(
  output: string,
  maxBytes: number = 512 * 1024,
  maxLines: number = 1000
): { output: string; truncated: boolean } {
  // Step 1: Clean
  let cleaned = cleanOutput(output);

  // Step 2: Compact if too many lines
  const lines = cleaned.split("\n");
  if (lines.length > maxLines) {
    cleaned = compactOutput(cleaned, maxLines);
  }

  // Step 3: Truncate if too large
  return truncateOutput(cleaned, maxBytes);
}
