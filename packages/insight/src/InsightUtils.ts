/**
 * Utility functions for insight generation.
 * Extracted from InsightService for better separation of concerns.
 */

import { basename } from "node:path";
import type { SymbolRef, CallRelation, ComplexityMetrics } from "./model.js";

/**
 * Generate a summary for a source file based on its symbols.
 */
export function generateFileSummary(
  language: string,
  symbols: Array<{ symbol: { name: string; kind: string } }>,
  exports: string[]
): string {
  const classes = symbols.filter((s) => s.symbol.kind === "class");
  const functions = symbols.filter((s) => s.symbol.kind === "function");
  const interfaces = symbols.filter((s) => s.symbol.kind === "interface");
  const typeAliases = symbols.filter((s) => s.symbol.kind === "type_alias");
  const variables = symbols.filter((s) => s.symbol.kind === "variable" || s.symbol.kind === "constant");

  const parts: string[] = [];

  if (classes.length > 0) {
    parts.push(
      `Defines ${classes.length} class${classes.length > 1 ? "es" : ""}: ${classes
        .slice(0, 3)
        .map((c) => c.symbol.name)
        .join(", ")}${classes.length > 3 ? "..." : ""}`
    );
  }

  if (functions.length > 0 && classes.length === 0) {
    parts.push(
      `Contains ${functions.length} function${functions.length > 1 ? "s" : ""}`
    );
  }

  if (interfaces.length > 0) {
    parts.push(
      `Defines ${interfaces.length} interface${interfaces.length > 1 ? "s" : ""}`
    );
  }

  if (typeAliases.length > 0) {
    parts.push(
      `Defines ${typeAliases.length} type${typeAliases.length > 1 ? "s" : ""}`
    );
  }

  if (variables.length > 0 && classes.length === 0 && functions.length === 0) {
    parts.push(
      `Exports ${variables.length} variable${variables.length > 1 ? "s" : ""}`
    );
  }

  if (exports.length > 0) {
    parts.push(`Exports: ${exports.slice(0, 5).join(", ")}${exports.length > 5 ? "..." : ""}`);
  }

  return parts.join(". ") || `${language} source file`;
}

/**
 * Generate a summary for a directory.
 */
export function generateDirectorySummary(
  relativePath: string,
  fileCount: number,
  keySymbols: SymbolRef[]
): string {
  const moduleName = basename(relativePath);
  const mainClasses = keySymbols.filter((s) => s.kind === "class").slice(0, 3);

  if (mainClasses.length > 0) {
    return `${moduleName} module with ${fileCount} files. Main classes: ${mainClasses
      .map((c) => c.name)
      .join(", ")}`;
  }

  return `${moduleName} module containing ${fileCount} source files and ${keySymbols.length} exported symbols`;
}

/**
 * Generate a summary for a symbol.
 */
export function generateSymbolSummary(
  symbol: { name: string; kind: string },
  code: string
): string {
  const lines = code.split("\n").length;

  switch (symbol.kind) {
    case "class":
      return `Class ${symbol.name} (${lines} lines)`;
    case "function":
      return `Function ${symbol.name} (${lines} lines)`;
    case "method":
      return `Method ${symbol.name} (${lines} lines)`;
    case "interface":
      return `Interface ${symbol.name}`;
    case "type_alias":
      return `Type alias ${symbol.name}`;
    default:
      return `${symbol.kind} ${symbol.name}`;
  }
}

/**
 * Extract the signature from code based on symbol kind.
 */
export function extractSignature(code: string, kind: string): string | undefined {
  // For type aliases and interfaces, the whole thing is the "signature"
  if (kind === "type_alias" || kind === "interface") {
    // For short definitions, return the whole thing
    const lines = code.split("\n");
    if (lines.length <= 5) {
      return code.trim();
    }
    // For longer ones, just return the first line with ...
    return lines[0].trim() + " ...";
  }

  // For classes, return the class declaration line
  if (kind === "class") {
    const firstLine = code.split("\n")[0];
    return firstLine.trim();
  }

  // For functions/methods, extract everything before the body
  if (kind !== "function" && kind !== "method") return undefined;

  // Find the signature - everything before the function body
  const lines = code.split("\n");
  let signature = "";
  let braceDepth = 0;
  let parenDepth = 0;

  for (const line of lines) {
    for (const char of line) {
      if (char === "(") parenDepth++;
      if (char === ")") parenDepth--;
      if (char === "{") {
        braceDepth++;
        if (braceDepth === 1 && parenDepth === 0) {
          // Found the opening brace of the function body
          return signature.trim();
        }
      }
    }
    signature += (signature ? "\n" : "") + line;
  }

  // Fallback: return first line
  return lines[0].trim();
}

/**
 * Collect notes about a file based on its metrics.
 */
export function collectFileNotes(metrics: ComplexityMetrics): string[] {
  const notes: string[] = [];

  if (metrics.complexity === "high") {
    notes.push("High complexity - consider splitting into smaller modules");
  }

  if (metrics.exports === 0) {
    notes.push("No exports - file may be an entry point or unused");
  }

  return notes;
}

/**
 * Collect notes about a symbol based on its call relations.
 */
export function collectSymbolNotes(
  symbol: { name: string; kind: string },
  calls: CallRelation[],
  calledBy: CallRelation[]
): string[] {
  const notes: string[] = [];

  if (calledBy.length === 0 && symbol.kind === "function") {
    notes.push("Not called from indexed code - may be unused or an entry point");
  }

  if (calls.length > 10) {
    notes.push("High coupling - calls many other functions");
  }

  if (calledBy.length > 20) {
    notes.push("Heavily used - changes may have wide impact");
  }

  return notes;
}
