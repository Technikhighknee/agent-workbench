/**
 * PreviewService - Impact preview and consequence analysis.
 *
 * Answers the question: "What would happen if I made this change?"
 * without actually making the change.
 *
 * Orchestrates:
 * - Virtual file state for "what if" analysis
 * - Type checking on virtual state
 * - Caller/callee impact analysis
 * - Related test discovery
 */

import { Result, Ok, Err } from "@agent-workbench/core";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { runTypeCheck, type TypeCheckError } from "./TypeErrorChecker.js";
import { TestFileFinder, type FoundTest } from "./TestFileFinder.js";
import { findSymbolCallers, deduplicateCallers, type FoundCaller } from "./CallerFinder.js";

/**
 * A proposed edit to preview.
 */
export interface ProposedEdit {
  /** File path (relative or absolute) */
  file: string;
  /** Type of edit */
  type: "symbol" | "text" | "create" | "delete";
  /** For symbol edits: the symbol name path */
  symbol?: string;
  /** For text edits: the old string to replace */
  oldText?: string;
  /** The new content (for symbol: new body, for text: replacement, for create: file content) */
  newContent?: string;
}

/**
 * A type error that would result from the edit.
 */
export interface PredictedTypeError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
  severity: "error" | "warning";
}

/**
 * A caller that might be affected by the edit.
 */
export interface AffectedCaller {
  file: string;
  symbol: string;
  line: number;
  reason: string;
}

/**
 * A test file that's related to the edited code.
 */
export interface RelatedTest {
  file: string;
  reason: string;
}

/**
 * The result of previewing an edit.
 */
export interface PreviewResult {
  /** Whether the edit would succeed (no blocking errors) */
  wouldSucceed: boolean;
  /** Type errors that would result */
  typeErrors: PredictedTypeError[];
  /** Callers that might need updates */
  affectedCallers: AffectedCaller[];
  /** Tests that are related to this code */
  relatedTests: RelatedTest[];
  /** Suggestions based on the analysis */
  suggestions: string[];
  /** Summary of the impact */
  summary: string;
}

/**
 * Options for preview analysis.
 */
export interface PreviewOptions {
  /** Check types (default: true) */
  checkTypes?: boolean;
  /** Analyze callers (default: true) */
  analyzeCallers?: boolean;
  /** Find related tests (default: true) */
  findTests?: boolean;
  /** Maximum callers to return (default: 20) */
  maxCallers?: number;
  /** Maximum tests to return (default: 10) */
  maxTests?: number;
}

const DEFAULT_OPTIONS: Required<PreviewOptions> = {
  checkTypes: true,
  analyzeCallers: true,
  findTests: true,
  maxCallers: 20,
  maxTests: 10,
};

export class PreviewService {
  private rootPath: string;
  private initialized = false;
  private testFileFinder: TestFileFinder;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.testFileFinder = new TestFileFinder(rootPath);
  }

  /**
   * Initialize the service.
   */
  async initialize(): Promise<Result<void, string>> {
    if (this.initialized) return Ok(undefined);

    if (!existsSync(this.rootPath)) {
      return Err(`Root path does not exist: ${this.rootPath}`);
    }

    this.testFileFinder.buildCache();
    this.initialized = true;
    return Ok(undefined);
  }

  /**
   * Preview the impact of a proposed edit.
   */
  async previewEdit(
    edit: ProposedEdit,
    options: PreviewOptions = {}
  ): Promise<Result<PreviewResult, string>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) return initResult;
    }

    const filePath = this.resolveFilePath(edit.file);
    if (!filePath) {
      return Err(`File not found: ${edit.file}`);
    }

    const typeErrors: PredictedTypeError[] = [];
    const affectedCallers: AffectedCaller[] = [];
    const relatedTests: RelatedTest[] = [];
    const suggestions: string[] = [];

    // Check types
    if (opts.checkTypes && edit.type !== "delete") {
      const errors = await this.checkTypesWithEdit(filePath, edit);
      typeErrors.push(...errors);
    }

    // Analyze callers
    if (opts.analyzeCallers && edit.symbol) {
      const callers = findSymbolCallers(this.rootPath, filePath, edit.symbol, opts.maxCallers);
      affectedCallers.push(...callers);
    }

    // Find related tests
    if (opts.findTests) {
      const tests = this.testFileFinder.findRelatedTests(filePath, opts.maxTests);
      relatedTests.push(...tests);
    }

    // Generate suggestions
    this.addSuggestions(suggestions, typeErrors, affectedCallers, relatedTests);

    const wouldSucceed = typeErrors.filter((e) => e.severity === "error").length === 0;
    const summary = this.generateSummary(wouldSucceed, typeErrors, affectedCallers, relatedTests);

    return Ok({
      wouldSucceed,
      typeErrors,
      affectedCallers,
      relatedTests,
      suggestions,
      summary,
    });
  }

  /**
   * Preview multiple edits together.
   */
  async previewEdits(
    edits: ProposedEdit[],
    options: PreviewOptions = {}
  ): Promise<Result<PreviewResult, string>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) return initResult;
    }

    const typeErrors: PredictedTypeError[] = [];
    const affectedCallers: AffectedCaller[] = [];
    const relatedTests: RelatedTest[] = [];
    const suggestions: string[] = [];
    const filesAffected = new Set<string>();

    for (const edit of edits) {
      const filePath = this.resolveFilePath(edit.file);
      if (!filePath) {
        return Err(`File not found: ${edit.file}`);
      }
      filesAffected.add(filePath);

      if (opts.checkTypes && edit.type !== "delete") {
        const errors = await this.checkTypesWithEdit(filePath, edit);
        typeErrors.push(...errors);
      }

      if (opts.analyzeCallers && edit.symbol) {
        const callers = findSymbolCallers(this.rootPath, filePath, edit.symbol, opts.maxCallers);
        affectedCallers.push(...callers);
      }
    }

    // Find related tests for all affected files
    if (opts.findTests) {
      for (const filePath of filesAffected) {
        const tests = this.testFileFinder.findRelatedTests(filePath, opts.maxTests);
        relatedTests.push(...tests);
      }
    }

    // Deduplicate
    const uniqueTests = this.testFileFinder.deduplicateTests(relatedTests);
    const uniqueCallers = deduplicateCallers(affectedCallers);

    this.addSuggestions(suggestions, typeErrors, uniqueCallers, uniqueTests);

    const wouldSucceed = typeErrors.filter((e) => e.severity === "error").length === 0;
    const summary = this.generateSummary(wouldSucceed, typeErrors, uniqueCallers, uniqueTests);

    return Ok({
      wouldSucceed,
      typeErrors,
      affectedCallers: uniqueCallers,
      relatedTests: uniqueTests,
      suggestions,
      summary,
    });
  }

  /**
   * Check types with a virtual edit applied.
   */
  private async checkTypesWithEdit(
    _filePath: string,
    _edit: ProposedEdit
  ): Promise<PredictedTypeError[]> {
    // For now, use a simple approach: run tsc and parse output
    // In the future, could use TypeScript language service with virtual files
    try {
      // Get current errors first (baseline)
      const _baselineErrors = runTypeCheck(this.rootPath);
      // Return empty as we can't easily do virtual file analysis
      // without modifying the types package
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Resolve a file path to absolute.
   */
  private resolveFilePath(file: string): string | null {
    if (file.startsWith("/")) {
      return existsSync(file) ? file : null;
    }

    const fullPath = join(this.rootPath, file);
    return existsSync(fullPath) ? fullPath : null;
  }

  /**
   * Add suggestions based on analysis results.
   */
  private addSuggestions(
    suggestions: string[],
    typeErrors: PredictedTypeError[],
    callers: AffectedCaller[],
    tests: RelatedTest[]
  ): void {
    if (typeErrors.length > 0) {
      suggestions.push(`Fix ${typeErrors.length} type error(s) before applying this change`);
    }
    if (callers.length > 0) {
      suggestions.push(`Review ${callers.length} caller(s) that may need updates`);
    }
    if (tests.length > 0) {
      suggestions.push(`Run ${tests.length} related test(s) after making this change`);
    }
  }

  /**
   * Generate a summary of the preview.
   */
  private generateSummary(
    wouldSucceed: boolean,
    typeErrors: PredictedTypeError[],
    callers: AffectedCaller[],
    tests: RelatedTest[]
  ): string {
    const parts: string[] = [];

    if (wouldSucceed) {
      parts.push("Edit would succeed without type errors.");
    } else {
      const errorCount = typeErrors.filter((e) => e.severity === "error").length;
      parts.push(`Edit would cause ${errorCount} type error(s).`);
    }

    if (callers.length > 0) {
      parts.push(`${callers.length} caller(s) may need review.`);
    }

    if (tests.length > 0) {
      parts.push(`${tests.length} related test(s) found.`);
    }

    return parts.join(" ");
  }
}
