import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import type { Result } from "../../core/result.js";
import { Ok, Err } from "../../core/result.js";
import type {
  TestRun,
  TestResult,
  TestSuite,
  TestConfig,
  TestSummary,
  TestFailure,
  RunTestsOptions,
  TestFramework,
  StackFrame,
  SourceLocation,
  TestStatus,
} from "../../core/model.js";
import type { TestFrameworkAdapter } from "../../core/ports/TestFrameworkAdapter.js";

/**
 * Adapter for npm-based test runners (Jest, Vitest, Node test runner).
 * Uses JSON reporters when available for structured output.
 */
export class NpmTestAdapter implements TestFrameworkAdapter {
  readonly framework: TestFramework;
  private detectedFramework: TestFramework = "unknown";

  constructor() {
    this.framework = "unknown"; // Will be detected
  }

  async detect(projectPath: string): Promise<boolean> {
    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) return false;

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps.vitest) {
        this.detectedFramework = "vitest";
        return true;
      }
      if (deps.jest) {
        this.detectedFramework = "jest";
        return true;
      }
      if (pkg.scripts?.test) {
        this.detectedFramework = "node";
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  async getConfig(projectPath: string): Promise<Result<TestConfig, Error>> {
    await this.detect(projectPath);

    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) {
      return Err(new Error("No package.json found"));
    }

    let pkg: { scripts?: Record<string, string> };
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch (e) {
      return Err(new Error(`Failed to parse package.json: ${e}`));
    }

    const testScript = pkg.scripts?.test;
    if (!testScript) {
      return Err(new Error("No test script found in package.json"));
    }

    return Ok({
      framework: this.detectedFramework,
      command: "npm",
      args: ["test", "--"],
      cwd: projectPath,
      configFile: pkgPath,
      testPatterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js", "**/*.spec.js"],
    });
  }

  async run(projectPath: string, options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    const configResult = await this.getConfig(projectPath);
    if (!configResult.ok) return configResult;

    const config = configResult.value;
    const { command, args } = this.buildCommand(config, options);

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const runResult = await this.executeCommand(command, args, config.cwd);

    const completedAt = new Date().toISOString();
    const duration = Date.now() - startTime;

    if (!runResult.ok) {
      return Err(runResult.error);
    }

    const { output, exitCode } = runResult.value;
    const parseResult = this.parseOutput(output, exitCode);

    if (!parseResult.ok) return parseResult;

    const testRun = parseResult.value;
    testRun.startedAt = startedAt;
    testRun.completedAt = completedAt;
    testRun.duration = duration;
    testRun.rawOutput = output;
    testRun.framework = this.detectedFramework;

    return Ok(testRun);
  }

  buildCommand(config: TestConfig, options?: RunTestsOptions): { command: string; args: string[] } {
    const args = [...config.args];

    // Add file filters
    if (options?.files?.length) {
      args.push(...options.files);
    }

    // Add test name pattern
    if (options?.testNamePattern) {
      if (this.detectedFramework === "vitest") {
        args.push("-t", options.testNamePattern);
      } else if (this.detectedFramework === "jest") {
        args.push("-t", options.testNamePattern);
      }
    }

    // Add grep pattern
    if (options?.grep) {
      args.push("--grep", options.grep);
    }

    // Framework-specific JSON output
    if (this.detectedFramework === "vitest") {
      args.push("--reporter=json");
    } else if (this.detectedFramework === "jest") {
      args.push("--json");
    }

    // Pass through additional args
    if (options?.args?.length) {
      args.push(...options.args);
    }

    return { command: config.command, args };
  }

  parseOutput(output: string, exitCode: number): Result<TestRun, Error> {
    // Try to parse as JSON first (Vitest/Jest JSON output)
    const jsonResult = this.tryParseJson(output);
    if (jsonResult) {
      return Ok(jsonResult);
    }

    // Fall back to regex parsing of text output
    return Ok(this.parseTextOutput(output, exitCode));
  }

  private tryParseJson(output: string): TestRun | null {
    // Find JSON in output (might have other text around it)
    const jsonMatch = output.match(/(\{[\s\S]*"numTotalTests"[\s\S]*\})/);
    if (!jsonMatch) return null;

    try {
      const json = JSON.parse(jsonMatch[1]);
      return this.parseJestJson(json);
    } catch {
      return null;
    }
  }

  private parseJestJson(json: {
    numTotalTests: number;
    numPassedTests: number;
    numFailedTests: number;
    numPendingTests: number;
    testResults: Array<{
      name: string;
      status: string;
      assertionResults: Array<{
        fullName: string;
        title: string;
        status: string;
        duration: number;
        failureMessages?: string[];
      }>;
    }>;
  }): TestRun {
    const tests: TestResult[] = [];
    const suites: TestSuite[] = [];

    for (const file of json.testResults) {
      const fileTests: TestResult[] = [];

      for (const test of file.assertionResults) {
        const status = this.mapStatus(test.status);
        const failure = test.failureMessages?.length
          ? this.parseFailure(test.failureMessages.join("\n"))
          : undefined;

        const testResult: TestResult = {
          name: test.title,
          fullName: test.fullName,
          status,
          duration: test.duration ?? 0,
          failure,
          file: file.name,
        };

        tests.push(testResult);
        fileTests.push(testResult);
      }

      suites.push({
        name: path.basename(file.name),
        file: file.name,
        tests: fileTests,
        suites: [],
        duration: fileTests.reduce((sum, t) => sum + t.duration, 0),
        passedCount: fileTests.filter((t) => t.status === "passed").length,
        failedCount: fileTests.filter((t) => t.status === "failed").length,
        skippedCount: fileTests.filter((t) => t.status === "skipped").length,
      });
    }

    const now = new Date().toISOString();
    return {
      startedAt: now,
      completedAt: now,
      duration: 0,
      success: json.numFailedTests === 0,
      framework: this.detectedFramework,
      suites,
      tests,
      summary: {
        total: json.numTotalTests,
        passed: json.numPassedTests,
        failed: json.numFailedTests,
        skipped: json.numPendingTests,
        pending: 0,
        fileCount: json.testResults.length,
        suiteCount: suites.length,
      },
    };
  }

  private parseTextOutput(output: string, exitCode: number): TestRun {
    const tests: TestResult[] = [];
    const lines = output.split("\n");

    // Parse common test output patterns
    let passed = 0, failed = 0, skipped = 0;

    for (const line of lines) {
      // Match patterns like "✓ test name" or "✗ test name" or "PASS/FAIL"
      const passMatch = line.match(/[✓✔]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
      const failMatch = line.match(/[✗✘×]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
      const skipMatch = line.match(/[○-]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);

      if (passMatch) {
        tests.push(this.createTestResult(passMatch[1], "passed"));
        passed++;
      } else if (failMatch) {
        tests.push(this.createTestResult(failMatch[1], "failed"));
        failed++;
      } else if (skipMatch) {
        tests.push(this.createTestResult(skipMatch[1], "skipped"));
        skipped++;
      }
    }

    // Try to extract summary from common patterns
    const summaryMatch = output.match(/(\d+)\s+pass(?:ed|ing)?.*?(\d+)\s+fail(?:ed|ing)?/i);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1], 10);
      failed = parseInt(summaryMatch[2], 10);
    }

    const now = new Date().toISOString();
    return {
      startedAt: now,
      completedAt: now,
      duration: 0,
      success: exitCode === 0,
      framework: this.detectedFramework,
      suites: [],
      tests,
      summary: {
        total: passed + failed + skipped,
        passed,
        failed,
        skipped,
        pending: 0,
        fileCount: 0,
        suiteCount: 0,
      },
    };
  }

  private createTestResult(name: string, status: TestStatus): TestResult {
    return {
      name: name.trim(),
      fullName: name.trim(),
      status,
      duration: 0,
    };
  }

  private mapStatus(status: string): TestStatus {
    switch (status.toLowerCase()) {
      case "passed":
        return "passed";
      case "failed":
        return "failed";
      case "pending":
      case "skipped":
      case "disabled":
        return "skipped";
      case "todo":
        return "todo";
      default:
        return "pending";
    }
  }

  private parseFailure(message: string): TestFailure {
    const stack = this.parseStackTrace(message);
    const location = this.findUserCodeFrame(stack);

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

  private parseStackTrace(text: string): StackFrame[] {
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

  private findUserCodeFrame(frames: StackFrame[]): SourceLocation | undefined {
    for (const frame of frames) {
      if (!frame.location) continue;
      const file = frame.location.file;
      if (file.includes("node_modules")) continue;
      if (file.startsWith("node:")) continue;
      return frame.location;
    }
    return undefined;
  }

  private async executeCommand(
    command: string,
    args: string[],
    cwd: string
  ): Promise<Result<{ output: string; exitCode: number }, Error>> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0", CI: "true" },
      });

      let output = "";
      proc.stdout?.on("data", (d) => (output += d.toString()));
      proc.stderr?.on("data", (d) => (output += d.toString()));
      proc.on("error", (e) => resolve(Err(e)));
      proc.on("close", (code) => resolve(Ok({ output, exitCode: code ?? 0 })));
    });
  }
}
