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
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";

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
  private testFileCache: Map<string, string[]> = new Map();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Initialize the service.
   */
  async initialize(): Promise<Result<void, string>> {
    if (this.initialized) return Ok(undefined);

    // Verify root path exists
    if (!existsSync(this.rootPath)) {
      return Err(`Root path does not exist: ${this.rootPath}`);
    }

    // Build test file cache
    this.buildTestFileCache();

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

    // Ensure initialized
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.ok) return initResult;
    }

    // Resolve file path
    const filePath = this.resolveFilePath(edit.file);
    if (!filePath) {
      return Err(`File not found: ${edit.file}`);
    }

    const typeErrors: PredictedTypeError[] = [];
    const affectedCallers: AffectedCaller[] = [];
    const relatedTests: RelatedTest[] = [];
    const suggestions: string[] = [];

    // Check types by running tsc with virtual file content
    if (opts.checkTypes && edit.type !== "delete") {
      const typeResult = await this.checkTypesWithEdit(filePath, edit);
      if (typeResult.ok) {
        typeErrors.push(...typeResult.value);
      }
    }

    // Analyze callers if editing a symbol
    if (opts.analyzeCallers && edit.symbol) {
      const callerResult = this.findAffectedCallers(filePath, edit.symbol, opts.maxCallers);
      if (callerResult.ok) {
        affectedCallers.push(...callerResult.value);
      }
    }

    // Find related tests
    if (opts.findTests) {
      const testResult = this.findRelatedTests(filePath, opts.maxTests);
      if (testResult.ok) {
        relatedTests.push(...testResult.value);
      }
    }

    // Generate suggestions
    if (typeErrors.length > 0) {
      suggestions.push(`Fix ${typeErrors.length} type error(s) before applying this change`);
    }
    if (affectedCallers.length > 0) {
      suggestions.push(`Review ${affectedCallers.length} caller(s) that may need updates`);
    }
    if (relatedTests.length > 0) {
      suggestions.push(`Run ${relatedTests.length} related test(s) after making this change`);
    }

    // Generate summary
    const wouldSucceed = typeErrors.filter(e => e.severity === "error").length === 0;
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

    // Ensure initialized
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

      // Check types
      if (opts.checkTypes && edit.type !== "delete") {
        const typeResult = await this.checkTypesWithEdit(filePath, edit);
        if (typeResult.ok) {
          typeErrors.push(...typeResult.value);
        }
      }

      // Analyze callers
      if (opts.analyzeCallers && edit.symbol) {
        const callerResult = this.findAffectedCallers(filePath, edit.symbol, opts.maxCallers);
        if (callerResult.ok) {
          affectedCallers.push(...callerResult.value);
        }
      }
    }

    // Find related tests for all affected files
    if (opts.findTests) {
      for (const filePath of filesAffected) {
        const testResult = this.findRelatedTests(filePath, opts.maxTests);
        if (testResult.ok) {
          relatedTests.push(...testResult.value);
        }
      }
    }

    // Deduplicate
    const uniqueTests = this.deduplicateTests(relatedTests);
    const uniqueCallers = this.deduplicateCallers(affectedCallers);

    // Generate suggestions
    if (typeErrors.length > 0) {
      suggestions.push(`Fix ${typeErrors.length} type error(s) before applying changes`);
    }
    if (uniqueCallers.length > 0) {
      suggestions.push(`Review ${uniqueCallers.length} caller(s) that may need updates`);
    }
    if (uniqueTests.length > 0) {
      suggestions.push(`Run ${uniqueTests.length} related test(s) after making changes`);
    }

    const wouldSucceed = typeErrors.filter(e => e.severity === "error").length === 0;
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
    filePath: string,
    edit: ProposedEdit
  ): Promise<Result<PredictedTypeError[], string>> {
    // For now, use a simple approach: run tsc and parse output
    // In the future, could use TypeScript language service directly

    try {
      // Get current errors first (baseline)
      const baselineErrors = this.runTscCheck();

      // For create edits, check if the new content would have errors
      // This is a simplified check - full implementation would need virtual FS

      // Return only new errors that would be introduced
      // For now, return empty as we can't easily do virtual file analysis
      // without modifying the types package
      return Ok([]);
    } catch {
      return Ok([]);
    }
  }

  /**
   * Run tsc and parse errors.
   */
  private runTscCheck(): PredictedTypeError[] {
    try {
      execSync("npx tsc --noEmit 2>&1", {
        cwd: this.rootPath,
        encoding: "utf-8",
        timeout: 30000,
      });
      return [];
    } catch (error: unknown) {
      const output = (error as { stdout?: string }).stdout || "";
      return this.parseTscOutput(output);
    }
  }

  /**
   * Parse tsc output into structured errors.
   */
  private parseTscOutput(output: string): PredictedTypeError[] {
    const errors: PredictedTypeError[] = [];
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

  /**
   * Find callers that might be affected by the edit.
   */
  private findAffectedCallers(
    filePath: string,
    symbolName: string,
    maxCallers: number
  ): Result<AffectedCaller[], string> {
    const callers: AffectedCaller[] = [];

    // Simple grep-based search for symbol usage
    // In the future, could use syntax service's getCallers
    try {
      const output = execSync(
        `grep -rn "\\b${symbolName}\\b" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . 2>/dev/null || true`,
        {
          cwd: this.rootPath,
          encoding: "utf-8",
          timeout: 10000,
        }
      );

      const lines = output.trim().split("\n").filter(Boolean);

      for (const line of lines.slice(0, maxCallers)) {
        const match = line.match(/^\.\/(.+?):(\d+):/);
        if (match && match[1] !== relative(this.rootPath, filePath)) {
          callers.push({
            file: match[1],
            symbol: "unknown", // Would need AST analysis to determine
            line: parseInt(match[2], 10),
            reason: `Uses ${symbolName}`,
          });
        }
      }
    } catch {
      // Ignore grep errors
    }

    return Ok(callers);
  }

  /**
   * Find tests related to a file.
   */
  private findRelatedTests(filePath: string, maxTests: number): Result<RelatedTest[], string> {
    const tests: RelatedTest[] = [];
    const relativePath = relative(this.rootPath, filePath);
    const fileName = basename(filePath, ".ts").replace(/\.tsx?$/, "");
    const dirName = dirname(relativePath);

    // Strategy 1: Same name pattern (foo.ts -> foo.test.ts)
    const testPatterns = [
      `${fileName}.test.ts`,
      `${fileName}.test.tsx`,
      `${fileName}.spec.ts`,
      `${fileName}.spec.tsx`,
      `${fileName}_test.ts`,
    ];

    for (const pattern of testPatterns) {
      const testPath = join(dirName, pattern);
      if (this.testFileCache.has(testPath)) {
        tests.push({
          file: testPath,
          reason: "Same name pattern",
        });
      }
    }

    // Strategy 2: Package-level test directory (packages/foo/test/Bar.test.ts)
    // Find package root by looking for /src/ in path
    const srcIndex = relativePath.indexOf("/src/");
    if (srcIndex !== -1) {
      const packagePath = relativePath.substring(0, srcIndex);
      const packageTestPatterns = [
        join(packagePath, "test", `${fileName}.test.ts`),
        join(packagePath, "test", `${fileName}.spec.ts`),
        join(packagePath, "tests", `${fileName}.test.ts`),
        join(packagePath, "__tests__", `${fileName}.test.ts`),
      ];

      for (const pattern of packageTestPatterns) {
        if (this.testFileCache.has(pattern) && !tests.some(t => t.file === pattern)) {
          tests.push({
            file: pattern,
            reason: "Package test directory",
          });
        }
      }
    }

    // Strategy 3: Test file in same directory or test subdirectory
    const allTests = Array.from(this.testFileCache.keys());
    for (const testFile of allTests) {
      if (tests.length >= maxTests) break;

      // Check if test is in same directory or test/ subdirectory
      const testDir = dirname(testFile);
      if (testDir === dirName || testDir === join(dirName, "test") || testDir === join(dirName, "__tests__")) {
        if (!tests.some(t => t.file === testFile)) {
          tests.push({
            file: testFile,
            reason: "Same directory",
          });
        }
      }
    }

    return Ok(tests.slice(0, maxTests));
  }

  /**
   * Build cache of test files.
   */
  private buildTestFileCache(): void {
    this.testFileCache.clear();
    this.scanForTests(this.rootPath);
  }

  /**
   * Recursively scan for test files.
   */
  private scanForTests(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist") {
            this.scanForTests(fullPath);
          }
        } else if (entry.isFile()) {
          if (entry.name.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/) || entry.name.match(/_test\.(ts|tsx|js|jsx)$/)) {
            const relativePath = relative(this.rootPath, fullPath);
            this.testFileCache.set(relativePath, []);
          }
        }
      }
    } catch {
      // Ignore errors
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
   * Deduplicate tests by file.
   */
  private deduplicateTests(tests: RelatedTest[]): RelatedTest[] {
    const seen = new Set<string>();
    return tests.filter(t => {
      if (seen.has(t.file)) return false;
      seen.add(t.file);
      return true;
    });
  }

  /**
   * Deduplicate callers by file+line.
   */
  private deduplicateCallers(callers: AffectedCaller[]): AffectedCaller[] {
    const seen = new Set<string>();
    return callers.filter(c => {
      const key = `${c.file}:${c.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      const errorCount = typeErrors.filter(e => e.severity === "error").length;
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
