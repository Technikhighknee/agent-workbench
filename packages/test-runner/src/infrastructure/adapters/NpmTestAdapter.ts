import fs from "fs";
import path from "path";
import { spawn } from "child_process";

import type { Result } from "@agent-workbench/core";
import { Ok, Err } from "@agent-workbench/core";
import type {
  TestRun,
  TestConfig,
  RunTestsOptions,
  TestFramework,
} from "../../core/model.js";
import type { TestFrameworkAdapter } from "../../core/ports/TestFrameworkAdapter.js";
import { parseTestOutput } from "./TestOutputParser.js";
import { detectWorkspaceForFiles, type WorkspaceInfo } from "./WorkspaceDetector.js";

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
      ? detectWorkspaceForFiles(projectPath, options.files)
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
    const testRun = parseTestOutput(output, exitCode, this.detectedFramework);

    testRun.startedAt = startedAt;
    testRun.completedAt = completedAt;
    testRun.duration = duration;
    testRun.rawOutput = output;
    testRun.framework = this.detectedFramework;

    return Ok(testRun);
  }

  parseOutput(output: string, exitCode: number): Result<TestRun, Error> {
    return Ok(parseTestOutput(output, exitCode, this.detectedFramework));
  }

  buildCommand(
    config: TestConfig,
    options?: RunTestsOptions,
    workspaceInfo?: WorkspaceInfo | null
  ): { command: string; args: string[] } {
    const args: string[] = ["test"];

    // If we detected a workspace, run in that workspace
    if (workspaceInfo) {
      args.push("-w", workspaceInfo.workspaceName, "--");
      if (workspaceInfo.relativeFiles.length) {
        args.push(...workspaceInfo.relativeFiles);
      }
    } else {
      args.push("--");
      if (options?.files?.length) {
        args.push(...options.files);
      }
    }

    // Add test name pattern
    if (options?.testNamePattern) {
      if (this.detectedFramework === "vitest" || this.detectedFramework === "jest") {
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

      const timeout = setTimeout(() => {
        if (!resolved) {
          output += "\n\n[TEST RUNNER TIMEOUT: Process killed after 5 minutes]\n";
          cleanup();
          resolve(Ok({ output, exitCode: 124 }));
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
