import { spawn } from "child_process";
import type { Result } from "../../core/result.js";
import { Ok, Err } from "../../core/result.js";
import type {
  TestRun,
  TestConfig,
  RunTestsOptions,
  TestFramework,
  StackFrame,
  SourceLocation,
} from "../../core/model.js";
import type { TestFrameworkAdapter } from "../../core/ports/TestFrameworkAdapter.js";

/**
 * Base class for test framework adapters.
 * Provides common functionality for running commands and parsing output.
 */
export abstract class BaseAdapter implements TestFrameworkAdapter {
  abstract readonly framework: TestFramework;

  abstract detect(projectPath: string): Promise<boolean>;
  abstract getConfig(projectPath: string): Promise<Result<TestConfig, Error>>;
  abstract parseOutput(output: string, exitCode: number): Result<TestRun, Error>;
  abstract buildCommand(config: TestConfig, options?: RunTestsOptions): { command: string; args: string[] };

  /**
   * Run tests by executing the test command and parsing output.
   */
  async run(projectPath: string, options?: RunTestsOptions): Promise<Result<TestRun, Error>> {
    const configResult = await this.getConfig(projectPath);
    if (!configResult.ok) {
      return configResult;
    }

    const config = configResult.value;
    const { command, args } = this.buildCommand(config, options);

    const startTime = Date.now();
    const runResult = await this.executeCommand(command, args, config.cwd);
    const duration = Date.now() - startTime;

    if (!runResult.ok) {
      return runResult;
    }

    const { output, exitCode } = runResult.value;
    const parseResult = this.parseOutput(output, exitCode);

    if (!parseResult.ok) {
      return parseResult;
    }

    // Add timing info
    const testRun = parseResult.value;
    testRun.duration = duration;
    testRun.rawOutput = output;

    return Ok(testRun);
  }

  /**
   * Execute a command and capture output.
   */
  protected async executeCommand(
    command: string,
    args: string[],
    cwd: string
  ): Promise<Result<{ output: string; exitCode: number }, Error>> {
    return new Promise((resolve) => {
      const proc = spawn(command, args, {
        cwd,
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: "0",
          NO_COLOR: "1",
          CI: "true",
        },
      });

      let output = "";

      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        output += data.toString();
      });

      proc.on("error", (error) => {
        resolve(Err(error));
      });

      proc.on("close", (code) => {
        resolve(Ok({ output, exitCode: code ?? 0 }));
      });
    });
  }

  /**
   * Parse a stack trace string into structured frames.
   */
  protected parseStackTrace(stack: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = stack.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("at ")) continue;

      const frame = this.parseStackFrame(trimmed);
      if (frame) {
        frames.push(frame);
      }
    }

    return frames;
  }

  /**
   * Parse a single stack frame line.
   * Handles formats like:
   *   at functionName (file:line:col)
   *   at file:line:col
   *   at Object.<anonymous> (file:line:col)
   */
  protected parseStackFrame(line: string): StackFrame | null {
    const raw = line;

    // Remove "at " prefix
    let content = line.replace(/^\s*at\s+/, "");

    // Try to extract function name and location
    let functionName: string | undefined;
    let location: SourceLocation | undefined;

    // Format: functionName (file:line:col)
    const withParens = content.match(/^(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    if (withParens) {
      functionName = withParens[1];
      location = {
        file: withParens[2],
        line: parseInt(withParens[3], 10),
        column: parseInt(withParens[4], 10),
      };
    } else {
      // Format: file:line:col
      const withoutParens = content.match(/^(.+):(\d+):(\d+)$/);
      if (withoutParens) {
        location = {
          file: withoutParens[1],
          line: parseInt(withoutParens[2], 10),
          column: parseInt(withoutParens[3], 10),
        };
      }
    }

    return { functionName, location, raw };
  }

  /**
   * Find the first user code frame in a stack trace.
   * Skips node_modules and internal frames.
   */
  protected findUserCodeFrame(frames: StackFrame[]): SourceLocation | undefined {
    for (const frame of frames) {
      if (!frame.location) continue;

      const file = frame.location.file;

      // Skip node_modules
      if (file.includes("node_modules")) continue;

      // Skip internal Node.js files
      if (file.startsWith("node:")) continue;

      // Skip files without a path separator (likely internal)
      if (!file.includes("/") && !file.includes("\\")) continue;

      return frame.location;
    }

    return undefined;
  }

  /**
   * Create an empty test run for error cases.
   */
  protected createEmptyRun(error?: string): TestRun {
    const now = new Date().toISOString();
    return {
      startedAt: now,
      completedAt: now,
      duration: 0,
      success: false,
      framework: this.framework,
      suites: [],
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        fileCount: 0,
        suiteCount: 0,
      },
      rawOutput: error,
    };
  }
}
