/**
 * Formatting utilities for refactoring suggestions.
 */

import type { RefactoringSuggestion, RefactoringAnalysis } from "./suggestRefactoring.js";

/**
 * Generate a summary of the refactoring suggestions.
 */
export function generateSummary(suggestions: RefactoringSuggestion[]): string {
  if (suggestions.length === 0) {
    return "No significant refactoring opportunities found. Code looks good!";
  }

  const high = suggestions.filter((s) => s.priority === "high").length;
  const medium = suggestions.filter((s) => s.priority === "medium").length;
  const low = suggestions.filter((s) => s.priority === "low").length;

  const parts: string[] = [];
  if (high > 0) parts.push(`${high} high priority`);
  if (medium > 0) parts.push(`${medium} medium priority`);
  if (low > 0) parts.push(`${low} low priority`);

  return `Found ${suggestions.length} refactoring opportunities: ${parts.join(", ")}.`;
}

/**
 * Format the full refactoring analysis as markdown.
 */
export function formatAnalysis(analysis: RefactoringAnalysis): string {
  let output = `## Refactoring Analysis: ${analysis.target}\n\n`;

  // Metrics overview
  output += `### Code Health\n`;
  output += `- **Complexity:** ${analysis.metrics.complexity}\n`;
  output += `- **Maintainability:** ${analysis.metrics.maintainability}\n`;
  output += `- **Test Coverage:** ${analysis.metrics.testCoverage}\n\n`;

  // Summary
  output += `### Summary\n${analysis.summary}\n\n`;

  if (analysis.suggestions.length === 0) {
    output += "No refactoring suggestions at this time.\n";
    return output;
  }

  // Suggestions by priority
  output += `### Suggestions\n\n`;

  const highPriority = analysis.suggestions.filter((s) => s.priority === "high");
  const mediumPriority = analysis.suggestions.filter((s) => s.priority === "medium");
  const lowPriority = analysis.suggestions.filter((s) => s.priority === "low");

  if (highPriority.length > 0) {
    output += `#### 🔴 High Priority\n\n`;
    for (const s of highPriority) {
      output += formatSuggestion(s);
    }
  }

  if (mediumPriority.length > 0) {
    output += `#### 🟡 Medium Priority\n\n`;
    for (const s of mediumPriority) {
      output += formatSuggestion(s);
    }
  }

  if (lowPriority.length > 0) {
    output += `#### 🟢 Low Priority\n\n`;
    for (const s of lowPriority) {
      output += formatSuggestion(s);
    }
  }

  return output;
}

/**
 * Format a single suggestion.
 */
function formatSuggestion(s: RefactoringSuggestion): string {
  let output = `**${formatType(s.type)}:** ${s.description}\n`;
  output += `> ${s.rationale}\n`;
  if (s.suggestedAction) {
    output += `> 💡 *${s.suggestedAction}*\n`;
  }
  output += `\n`;
  return output;
}

/**
 * Format suggestion type as readable label.
 */
function formatType(type: RefactoringSuggestion["type"]): string {
  const typeNames: Record<RefactoringSuggestion["type"], string> = {
    extract_function: "Extract Function",
    split_file: "Split Module",
    reduce_coupling: "Reduce Coupling",
    remove_unused: "Remove Unused",
    add_tests: "Add Tests",
    simplify: "Simplify",
    rename: "Rename",
  };
  return typeNames[type];
}
