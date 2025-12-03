import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";

import type { Result } from "@agent-workbench/core";
import { Ok, Err } from "@agent-workbench/core";
import type {
  TestRun,
  TestConfig,
  RunTestsOptions,
} from "../core/model.js";
import type {
  TestFrameworkAdapter,
  TestRunnerService,
} from "../core/ports/TestFrameworkAdapter.js";
import { NpmTestAdapter } from "./adapters/NpmTestAdapter.js";

/**
 * Information about tests related to a source file.
 */
export interface RelatedTestInfo {
  sourceFile: string;
  testFiles: Array<{
    path: string;
    matchReason: "naming_convention" | "imports_source" | "same_directory";
    confidence: "high" | "medium" | "low";
  }>;
}

/**
 * Implementation of the TestRunnerService.
 * Manages test framework detection and execution.
 */
export class TestRunnerServiceImpl implements TestRunnerService {
  private adapters: TestFrameworkAdapter[] = [];
  private activeAdapter: TestFrameworkAdapter | null = null;
  private config: TestConfig | null = null;
  private projectPath: string = "";
  private lastRun: TestRun | null = null;

  constructor() {
    // Register available adapters
    this.adapters = [
      new NpmTestAdapter(),
      // Future: PytestAdapter, GoTestAdapter, CargoTestAdapter
    ];
  }

  async initialize(projectPath: string): Promise<Result<TestConfig, Error>> {
    this.projectPath = projectPath;

    // Try each adapter until one detects a framework
    for (const adapter of this.adapters) {
      const detected = await adapter.detect(projectPath);
      if (detected) {
        this.activeAdapter = adapter;
        const configResult = await adapter.getConfig(projectPath);
        if (configResult.ok) {
          this.config = configResult.value;
          return Ok(this.config);
        }
        return configResult;
      }
    }

    return Err(new Error("No supported test framework detected"));
  }

  isInitialized(): boolean {
    return this.activeAdapter !== null && this.config !== null;
  }

  getConfig(): Result<TestConfig, Error> {
    if (!this.config) {
      return Err(new Error("Service not initialized. Call initialize() first."));
    }
    return Ok(this.config);
  }

  async runTests(options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    if (!this.activeAdapter || !this.config) {
      return Err(new Error("Service not initialized. Call initialize() first."));
    }

    const result = await this.activeAdapter.run(this.projectPath, options);
    if (result.ok) {
      this.lastRun = result.value;
    }
    return result;
  }

  async runFiles(files: string[], options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    return this.runTests({ ...options, files });
  }

  getLastRun(): Result<TestRun, Error> {
    if (!this.lastRun) {
      return Err(new Error("No test run available"));
    }
    return Ok(this.lastRun);
  }

  async listTestFiles(): Promise<Result<string[], Error>> {
    if (!this.config) {
      return Err(new Error("Service not initialized. Call initialize() first."));
    }

    try {
      // Default patterns include common conventions + monorepo patterns
      const patterns = this.config.testPatterns || [
        // Standard test file patterns
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.test.js",
        "**/*.spec.js",
        "**/*.test.tsx",
        "**/*.spec.tsx",
        // Monorepo: test directories
        "**/test/**/*.ts",
        "**/test/**/*.js",
        "**/tests/**/*.ts",
        "**/tests/**/*.js",
        "**/__tests__/**/*.ts",
        "**/__tests__/**/*.js",
      ];

      const allFiles: string[] = [];

      for (const pattern of patterns) {
        const files = await glob(pattern, {
          cwd: this.projectPath,
          ignore: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/.git/**",
          ],
          absolute: true,
        });
        allFiles.push(...files);
      }

      // Deduplicate and sort
      const uniqueFiles = [...new Set(allFiles)].sort();
      return Ok(uniqueFiles);
    } catch (e) {
      return Err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /**
   * Get only the failed tests from the last run.
   */
  getFailedTests(): Result<TestRun["tests"], Error> {
    if (!this.lastRun) {
      return Err(new Error("No test run available"));
    }
    const failed = this.lastRun.tests.filter((t) => t.status === "failed");
    return Ok(failed);
  }

  /**
   * Rerun only the failed tests from the last run.
   */
  async rerunFailed(options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    const failedResult = this.getFailedTests();
    if (!failedResult.ok) return failedResult;

    const failed = failedResult.value;
    if (failed.length === 0) {
      return Err(new Error("No failed tests to rerun"));
    }

    // Get unique file paths from failed tests
    const files = [...new Set(failed.map((t) => t.file).filter(Boolean))] as string[];

    // Get test name patterns
    const testNames = failed.map((t) => t.name);

    return this.runTests({
      ...options,
      files: files.length > 0 ? files : undefined,
      testNamePattern: testNames.length === 1 ? testNames[0] : undefined,
    });
  }

  /**
   * Find test files related to a given source file.
   * Uses multiple heuristics:
   * 1. Naming conventions (foo.ts -> foo.test.ts, foo.spec.ts)
   * 2. Import analysis (test files that import the source)
   * 3. Co-location (tests in __tests__ directory)
   */
  async findTestsFor(sourceFile: string): Promise<Result<RelatedTestInfo, Error>> {
    if (!this.config) {
      return Err(new Error("Service not initialized. Call initialize() first."));
    }

    const absoluteSource = path.isAbsolute(sourceFile)
      ? sourceFile
      : path.join(this.projectPath, sourceFile);

    const relativeSource = path.relative(this.projectPath, absoluteSource);
    const parsedPath = path.parse(absoluteSource);
    const baseName = parsedPath.name;
    const dirName = parsedPath.dir;

    const testFiles: RelatedTestInfo["testFiles"] = [];
    const seenPaths = new Set<string>();

    // Strategy 1: Naming convention matches
    const namingPatterns = [
      // Same directory patterns
      path.join(dirName, `${baseName}.test.ts`),
      path.join(dirName, `${baseName}.spec.ts`),
      path.join(dirName, `${baseName}.test.tsx`),
      path.join(dirName, `${baseName}.spec.tsx`),
      path.join(dirName, `${baseName}.test.js`),
      path.join(dirName, `${baseName}.spec.js`),
      // __tests__ directory
      path.join(dirName, "__tests__", `${baseName}.test.ts`),
      path.join(dirName, "__tests__", `${baseName}.spec.ts`),
      path.join(dirName, "__tests__", `${baseName}.ts`),
      // test/ directory sibling
      path.join(dirName.replace(/\/src(\/|$)/, "/test$1"), `${baseName}.test.ts`),
      path.join(dirName.replace(/\/src(\/|$)/, "/tests$1"), `${baseName}.test.ts`),
    ];

    for (const testPath of namingPatterns) {
      try {
        await fs.access(testPath);
        if (!seenPaths.has(testPath)) {
          seenPaths.add(testPath);
          testFiles.push({
            path: testPath,
            matchReason: "naming_convention",
            confidence: "high",
          });
        }
      } catch {
        // File doesn't exist
      }
    }

    // Strategy 2: Glob for test files that might import this source
    const allTestFilesResult = await this.listTestFiles();
    if (allTestFilesResult.ok) {
      const allTestFiles = allTestFilesResult.value;

      for (const testFile of allTestFiles) {
        if (seenPaths.has(testFile)) continue;

        try {
          const content = await fs.readFile(testFile, "utf-8");

          // Check if test file imports the source file
          const sourceImportPatterns = [
            // Relative imports
            `./${baseName}`,
            `../${baseName}`,
            `/${baseName}`,
            // Check for the full relative path
            relativeSource.replace(/\.[^.]+$/, ""),
          ];

          const hasImport = sourceImportPatterns.some((pattern) =>
            content.includes(`from "${pattern}`) ||
            content.includes(`from '${pattern}`) ||
            content.includes(`import("${pattern}`) ||
            content.includes(`import('${pattern}`) ||
            content.includes(`require("${pattern}`) ||
            content.includes(`require('${pattern}`)
          );

          if (hasImport) {
            seenPaths.add(testFile);
            testFiles.push({
              path: testFile,
              matchReason: "imports_source",
              confidence: "high",
            });
          }
        } catch {
          // Skip files we can't read
        }
      }
    }

    // Strategy 3: Same directory test files (lower confidence)
    const sameDirPattern = path.join(dirName, "*.test.ts");
    try {
      const sameDirTests = await glob(sameDirPattern, { absolute: true });
      for (const testFile of sameDirTests) {
        if (!seenPaths.has(testFile)) {
          seenPaths.add(testFile);
          testFiles.push({
            path: testFile,
            matchReason: "same_directory",
            confidence: "low",
          });
        }
      }
    } catch {
      // Ignore glob errors
    }

    return Ok({
      sourceFile: absoluteSource,
      testFiles,
    });
  }

  /**
   * Run tests related to a source file.
   */
  async runTestsFor(
    sourceFile: string,
    options?: RunTestsOptions
  ): Promise<Result<TestRun, Error>> {
    const relatedResult = await this.findTestsFor(sourceFile);
    if (!relatedResult.ok) return relatedResult;

    const related = relatedResult.value;
    if (related.testFiles.length === 0) {
      return Err(new Error(`No test files found for ${sourceFile}`));
    }

    // Run high and medium confidence tests first
    const highConfidenceTests = related.testFiles
      .filter((t) => t.confidence === "high" || t.confidence === "medium")
      .map((t) => t.path);

    const testsToRun = highConfidenceTests.length > 0
      ? highConfidenceTests
      : related.testFiles.map((t) => t.path);

    return this.runFiles(testsToRun, options);
  }
}
