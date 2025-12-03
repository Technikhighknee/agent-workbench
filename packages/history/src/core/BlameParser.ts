/**
 * Git blame output parser.
 * Parses git blame porcelain format.
 */

import type { BlameLine } from "./model.js";

/**
 * Parse git blame porcelain output.
 */
export function parseBlameOutput(output: string): BlameLine[] {
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
