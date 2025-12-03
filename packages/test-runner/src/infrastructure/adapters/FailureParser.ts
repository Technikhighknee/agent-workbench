/**
 * Failure message and stack trace parser.
 * Extracts structured failure information from test output.
 */

import type { TestFailure, StackFrame, SourceLocation } from "../../core/model.js";

/**
 * Parse a failure message into structured failure info.
 */
export function parseTestFailure(message: string): TestFailure {
  const stack = parseStackTrace(message);
  const location = findUserCodeFrame(stack);

  // Try to extract expected/actual from assertion messages
  const expectedMatch = message.match(/Expected[:\s]+(.+?)(?:\n|Received|$)/i);
  const actualMatch = message.match(/Received[:\s]+(.+?)(?:\n|$)/i);

  return {
    message: message.split("\n")[0] || message,
    expected: expectedMatch?.[1]?.trim(),
    actual: actualMatch?.[1]?.trim(),
    stack,
    rawStack: message,
    location,
  };
}

/**
 * Parse a stack trace string into structured frames.
 */
export function parseStackTrace(text: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (!line.includes(" at ")) continue;

    const match = line.match(/at\s+(?:(.+?)\s+)?\(?(.+):(\d+):(\d+)\)?/);
    if (match) {
      frames.push({
        functionName: match[1],
        location: {
          file: match[2],
          line: parseInt(match[3], 10),
          column: parseInt(match[4], 10),
        },
        raw: line.trim(),
      });
    }
  }

  return frames;
}

/**
 * Find the first stack frame in user code (not node_modules).
 */
export function findUserCodeFrame(frames: StackFrame[]): SourceLocation | undefined {
  for (const frame of frames) {
    if (!frame.location) continue;
    const file = frame.location.file;
    if (file.includes("node_modules")) continue;
    if (file.startsWith("node:")) continue;
    return frame.location;
  }
  return undefined;
}
