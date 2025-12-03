/**
 * Refactoring analyzers for file, directory, and symbol insights.
 */

import type { RefactoringSuggestion } from "./suggestRefactoring.js";

/**
 * Analyze a file insight for refactoring opportunities.
 */
export function analyzeFile(
  insight: {
    path: string;
    metrics?: {
      lines: number;
      symbols: number;
      imports: number;
      exports: number;
      complexity: string;
    };
    structure?: {
      symbols: Array<{ name: string; kind: string; line: number }>;
      imports: Array<{ source: string; names: string[] }>;
      exports: string[];
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { metrics, structure, notes, path } = insight;

  // Check for large files
  if ((focus === "all" || focus === "complexity") && metrics && metrics.lines > 500) {
    suggestions.push({
      type: "split_file",
      priority: metrics.lines > 1000 ? "high" : "medium",
      target: path,
      description: `File has ${metrics.lines} lines - consider splitting`,
      rationale:
        "Large files are harder to understand and maintain. They often contain multiple responsibilities.",
      suggestedAction:
        "Identify distinct responsibilities and extract them into separate modules.",
    });
  }

  // Check for too many symbols
  if ((focus === "all" || focus === "complexity") && metrics && metrics.symbols > 30) {
    suggestions.push({
      type: "split_file",
      priority: "medium",
      target: path,
      description: `File defines ${metrics.symbols} symbols - may have too many responsibilities`,
      rationale: "Files with many symbols often violate single responsibility principle.",
      suggestedAction: "Group related symbols and move each group to its own module.",
    });
  }

  // Check for high import count (coupling)
  if ((focus === "all" || focus === "coupling") && metrics && metrics.imports > 15) {
    suggestions.push({
      type: "reduce_coupling",
      priority: metrics.imports > 25 ? "high" : "medium",
      target: path,
      description: `File imports from ${metrics.imports} sources - high coupling`,
      rationale:
        "High import count indicates the module depends on many others, making it fragile to changes.",
      suggestedAction: "Consider introducing a facade or aggregating common imports.",
    });
  }

  // Check for unused exports
  if ((focus === "all" || focus === "unused") && notes) {
    if (notes.some((n) => n.includes("No exports"))) {
      suggestions.push({
        type: "remove_unused",
        priority: "low",
        target: path,
        description: "File has no exports - may be unused",
        rationale: "Files without exports are either entry points or potentially dead code.",
        suggestedAction:
          "Verify if this file is needed, or add exports if functionality should be reusable.",
      });
    }
  }

  // Check for many functions
  if ((focus === "all" || focus === "complexity") && structure) {
    const functions = structure.symbols.filter(
      (s) => s.kind === "function" || s.kind === "method"
    );
    if (functions.length > 20) {
      suggestions.push({
        type: "extract_function",
        priority: "medium",
        target: path,
        description: `File has ${functions.length} functions - consider grouping`,
        rationale:
          "Files with many functions can be hard to navigate. Related functions should be together.",
        suggestedAction:
          "Group related functions into separate modules or use a class to encapsulate related behavior.",
      });
    }
  }
}

/**
 * Analyze a directory insight for refactoring opportunities.
 */
export function analyzeDirectory(
  insight: {
    path: string;
    metrics?: {
      lines: number;
      symbols: number;
      complexity: string;
    };
    structure?: {
      files: string[];
      subdirectories: string[];
      entryPoints: string[];
      keySymbols: Array<{ name: string; kind: string }>;
    };
    relationships?: {
      externalDeps: string[];
      internalDeps: string[];
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { structure, relationships, notes, path } = insight;

  // Check for missing entry point
  if ((focus === "all" || focus === "complexity") && structure) {
    if (structure.entryPoints.length === 0 && structure.files.length > 3) {
      suggestions.push({
        type: "simplify",
        priority: "medium",
        target: path,
        description: "Directory has no index/entry point file",
        rationale:
          "Entry points make it clear what a module exports and provide a clean public API.",
        suggestedAction:
          "Create an index.ts file that re-exports the public API of this module.",
      });
    }
  }

  // Check for too many files
  if ((focus === "all" || focus === "complexity") && structure && structure.files.length > 20) {
    suggestions.push({
      type: "split_file",
      priority: "medium",
      target: path,
      description: `Directory has ${structure.files.length} files - consider reorganizing`,
      rationale:
        "Flat directories with many files are hard to navigate. Subdirectories add structure.",
      suggestedAction: "Group related files into subdirectories based on feature or responsibility.",
    });
  }

  // Check for high external dependencies
  if (
    (focus === "all" || focus === "coupling") &&
    relationships &&
    relationships.externalDeps.length > 20
  ) {
    suggestions.push({
      type: "reduce_coupling",
      priority: "medium",
      target: path,
      description: `Module depends on ${relationships.externalDeps.length} external packages`,
      rationale: "High external dependencies increase risk and maintenance burden.",
      suggestedAction: "Review if all dependencies are necessary. Consider alternatives or abstractions.",
    });
  }

  // Check high complexity from notes
  if ((focus === "all" || focus === "complexity") && notes) {
    if (notes.some((n) => n.includes("High complexity"))) {
      suggestions.push({
        type: "split_file",
        priority: "high",
        target: path,
        description: "Module has high complexity",
        rationale: "High complexity modules are harder to understand and modify safely.",
        suggestedAction: "Break down into smaller, focused modules with clear responsibilities.",
      });
    }
  }
}

/**
 * Analyze a symbol insight for refactoring opportunities.
 */
export function analyzeSymbol(
  insight: {
    name: string;
    kind: string;
    file: string;
    code?: string;
    relationships?: {
      calls: Array<{ symbol: { name: string }; line: number }>;
      calledBy: Array<{ symbol: { name: string }; line: number }>;
    };
    notes?: string[];
  },
  suggestions: RefactoringSuggestion[],
  focus: string
): void {
  const { name, kind, file, code, relationships, notes } = insight;

  // Check for long functions
  if ((focus === "all" || focus === "complexity") && code) {
    const lines = code.split("\n").length;
    if (lines > 50) {
      suggestions.push({
        type: "extract_function",
        priority: lines > 100 ? "high" : "medium",
        target: `${name} in ${file}`,
        description: `${kind} has ${lines} lines - consider extracting smaller functions`,
        rationale: "Long functions are hard to understand and test. They often do multiple things.",
        suggestedAction: "Identify logical sections and extract them as separate helper functions.",
      });
    }
  }

  // Check for unused functions
  if ((focus === "all" || focus === "unused") && notes && kind === "function") {
    if (notes.some((n) => n.includes("Not called"))) {
      suggestions.push({
        type: "remove_unused",
        priority: "low",
        target: `${name} in ${file}`,
        description: `Function "${name}" is not called from indexed code`,
        rationale: "Unused code adds maintenance burden and can confuse developers.",
        suggestedAction:
          "Verify if this function is needed (may be an entry point or test utility). Remove if unused.",
      });
    }
  }

  // Check for high coupling (calls many functions)
  if ((focus === "all" || focus === "coupling") && relationships && relationships.calls.length > 10) {
    suggestions.push({
      type: "reduce_coupling",
      priority: relationships.calls.length > 20 ? "high" : "medium",
      target: `${name} in ${file}`,
      description: `${kind} calls ${relationships.calls.length} other functions`,
      rationale:
        "Functions that call many others are often doing too much and are fragile to changes.",
      suggestedAction: "Break down the function or introduce intermediate abstractions.",
    });
  }

  // Check if heavily used
  if (
    (focus === "all" || focus === "coupling") &&
    notes &&
    relationships &&
    relationships.calledBy.length > 20
  ) {
    suggestions.push({
      type: "simplify",
      priority: "medium",
      target: `${name} in ${file}`,
      description: `${kind} is called from ${relationships.calledBy.length} places - heavily used`,
      rationale: "Heavily used code should be stable. Changes here have wide impact.",
      suggestedAction: "Ensure thorough test coverage. Consider if API could be simplified.",
    });
  }

  // Naming suggestions
  if (focus === "all" || focus === "naming") {
    if (name.length <= 2 && kind === "function") {
      suggestions.push({
        type: "rename",
        priority: "low",
        target: `${name} in ${file}`,
        description: `Function name "${name}" is very short`,
        rationale: "Short names can be unclear. Function names should describe what they do.",
        suggestedAction: "Consider a more descriptive name.",
      });
    }
  }
}
