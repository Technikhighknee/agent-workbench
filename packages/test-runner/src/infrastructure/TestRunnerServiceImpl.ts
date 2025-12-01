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
}
