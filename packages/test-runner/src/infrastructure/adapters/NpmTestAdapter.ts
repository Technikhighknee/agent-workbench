import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import type { Result } from "@agent-workbench/core";
import { Ok, Err } from "@agent-workbench/core";
import type {
  TestRun,
  TestResult,
  TestSuite,
  TestConfig,
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
      // Include both standard patterns and monorepo patterns
      testPatterns: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.test.js",
        "**/*.spec.js",
        "**/*.test.tsx",
        "**/*.spec.tsx",
        "**/test/**/*.ts",
        "**/test/**/*.js",
        "**/tests/**/*.ts",
        "**/tests/**/*.js",
        "**/__tests__/**/*.ts",
        "**/__tests__/**/*.js",
      ],
    });
  }

  async run(projectPath: string, options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    const configResult = await this.getConfig(projectPath);
    if (!configResult.ok) return configResult;

    const config = configResult.value;
    
    // For file-specific tests in a monorepo, detect workspace and run there
    const workspaceInfo = options?.files?.length 
      ? await this.detectWorkspaceForFiles(projectPath, options.files)
      : null;
    
    const { command, args } = this.buildCommand(config, options, workspaceInfo);
    const cwd = workspaceInfo?.workspacePath || config.cwd;

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const runResult = await this.executeCommand(command, args, cwd);

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

  buildCommand(
    config: TestConfig, 
    options?: RunTestsOptions,
    workspaceInfo?: { workspaceName: string; workspacePath: string; relativeFiles: string[] } | null
  ): { command: string; args: string[] } {
    const args: string[] = ["test"];
    
    // If we detected a workspace, run in that workspace
    if (workspaceInfo) {
      args.push("-w", workspaceInfo.workspaceName, "--");
      // Use relative file paths within the workspace
      if (workspaceInfo.relativeFiles.length) {
        args.push(...workspaceInfo.relativeFiles);
      }
    } else {
      args.push("--");
      // Add file filters (absolute paths for non-workspace runs)
      if (options?.files?.length) {
        args.push(...options.files);
      }
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

  private parseTextOutput(output: string, _exitCode: number): TestRun {
    const tests: TestResult[] = [];
    const lines = output.split("\n");

    // Parse common test output patterns
    let passed = 0, failed = 0, skipped = 0;

    for (const line of lines) {
      // Match patterns like "✓ test name" or "✗ test name" or "PASS/FAIL"
      const passMatch = line.match(/[✓✔]\\s+(.+?)(?:\\s+\\(\\d+\\s*m?s\\))?$/);
      const failMatch = line.match(/[✗✘×]\\s+(.+?)(?:\\s+\\(\\d+\\s*m?s\\))?$/);
      const skipMatch = line.match(/[○-]\\s+(.+?)(?:\\s+\\(\\d+\\s*m?s\\))?$/);

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
    const summaryMatch = output.match(/(\\d+)\\s+pass(?:ed|ing)?.*?(\\d+)\\s+fail(?:ed|ing)?/i);
    if (summaryMatch) {
      passed = parseInt(summaryMatch[1], 10);
      failed = parseInt(summaryMatch[2], 10);
    }

    const now = new Date().toISOString();
    return {
      startedAt: now,
      completedAt: now,
      duration: 0,
      // Success is based on actual test failures, not exit code
      // (exit code may be non-zero for skipped tests, warnings, etc.)
      success: failed === 0,
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

  /**
   * Detect which workspace a set of files belongs to in a monorepo.
   * Returns workspace info if all files are in the same workspace, null otherwise.
   */
  private async detectWorkspaceForFiles(
    projectPath: string,
    files: string[]
  ): Promise<{ workspaceName: string; workspacePath: string; relativeFiles: string[] } | null> {
    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) return null;

    let pkg: { workspaces?: string[] };
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    } catch {
      return null;
    }

    // Not a monorepo
    if (!pkg.workspaces?.length) return null;

    // Resolve workspace paths
    const workspaceDirs: Array<{ name: string; path: string }> = [];
    for (const ws of pkg.workspaces) {
      // Handle glob patterns like "packages/*"
      const wsPath = path.join(projectPath, ws.replace("/*", ""));
      if (fs.existsSync(wsPath) && fs.statSync(wsPath).isDirectory()) {
        // List subdirectories
        const subdirs = fs.readdirSync(wsPath);
        for (const subdir of subdirs) {
          const fullPath = path.join(wsPath, subdir);
          const pkgJsonPath = path.join(fullPath, "package.json");
          if (fs.existsSync(pkgJsonPath)) {
            try {
              const wsPkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
              if (wsPkg.name) {
                workspaceDirs.push({ name: wsPkg.name, path: fullPath });
              }
            } catch {
              // Skip invalid package.json
            }
          }
        }
      }
    }

    // Find which workspace each file belongs to
    let matchedWorkspace: { name: string; path: string } | null = null;
    const relativeFiles: string[] = [];

    for (const file of files) {
      const absoluteFile = path.isAbsolute(file) ? file : path.join(projectPath, file);

      for (const ws of workspaceDirs) {
        if (absoluteFile.startsWith(ws.path + path.sep)) {
          if (matchedWorkspace && matchedWorkspace.name !== ws.name) {
            // Files span multiple workspaces, can't optimize
            return null;
          }
          matchedWorkspace = ws;
          relativeFiles.push(path.relative(ws.path, absoluteFile));
          break;
        }
      }
    }

    if (!matchedWorkspace) return null;

    return {
      workspaceName: matchedWorkspace.name,
      workspacePath: matchedWorkspace.path,
      relativeFiles,
    };
  }

  private async executeCommand(
    command: string,
    args: string[],
    cwd: string
  ): Promise<Result<{ output: string; exitCode: number }, Error>> {
    const MAX_OUTPUT_SIZE = 5 * 1024 * 1024; // 5MB limit
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout

    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: "0", CI: "true" },
      });

      let output = "";
      let outputTruncated = false;
      let resolved = false;

      const cleanup = (): void => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGKILL");
        }
      };

      // Timeout handler
      const timeout = setTimeout(() => {
        if (!resolved) {
          output += "\n\n[TEST RUNNER TIMEOUT: Process killed after 5 minutes]\n";
          cleanup();
          resolve(Ok({ output, exitCode: 124 })); // 124 = timeout exit code
        }
      }, TIMEOUT_MS);

      const appendOutput = (data: Buffer): void => {
        if (outputTruncated) return;
        const chunk = data.toString();
        if (output.length + chunk.length > MAX_OUTPUT_SIZE) {
          output += chunk.slice(0, MAX_OUTPUT_SIZE - output.length);
          output += "\n\n[OUTPUT TRUNCATED: Exceeded 5MB limit]\n";
          outputTruncated = true;
        } else {
          output += chunk;
        }
      };

      proc.stdout?.on("data", appendOutput);
      proc.stderr?.on("data", appendOutput);
      proc.on("error", (e) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(Err(e));
        }
      });
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          resolve(Ok({ output, exitCode: code ?? 0 }));
        }
      });
    });
  }
}
