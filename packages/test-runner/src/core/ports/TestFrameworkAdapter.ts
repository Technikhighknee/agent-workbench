import type { Result } from "@agent-workbench/core";
import type {
  TestRun,
  TestConfig,
  RunTestsOptions,
  TestFramework,
} from "../model.js";

/**
 * Port for test framework adapters.
 * Each supported framework implements this interface.
 */
export interface TestFrameworkAdapter {
  /**
   * The framework this adapter handles.
   */
  readonly framework: TestFramework;

  /**
   * Check if this adapter can handle the given project.
   *
   * @param projectPath - Path to project root
   * @returns True if this framework is detected
   */
  detect(projectPath: string): Promise<boolean>;

  /**
   * Get the test configuration for the project.
   *
   * @param projectPath - Path to project root
   * @returns Test configuration
   */
  getConfig(projectPath: string): Promise<Result<TestConfig, Error>>;

  /**
   * Run tests and return structured results.
   *
   * @param projectPath - Path to project root
   * @param options - Run options
   * @returns Parsed test results
   */
  run(projectPath: string, options?: RunTestsOptions): Promise<Result<TestRun, Error>>;

  /**
   * Parse raw test output into structured results.
   *
   * @param output - Raw stdout/stderr from test command
   * @param exitCode - Process exit code
   * @returns Parsed test results
   */
  parseOutput(output: string, exitCode: number): Result<TestRun, Error>;

  /**
   * Build the command and arguments for running tests.
   *
   * @param config - Test configuration
   * @param options - Run options
   * @returns Command and arguments
   */
  buildCommand(config: TestConfig, options?: RunTestsOptions): { command: string; args: string[] };
}

/**
 * Port for the test runner service.
 */
export interface TestRunnerService {
  /**
   * Initialize the service for a project.
   * Detects the test framework and configuration.
   *
   * @param projectPath - Path to project root
   */
  initialize(projectPath: string): Promise<Result<TestConfig, Error>>;

  /**
   * Check if the service is initialized.
   */
  isInitialized(): boolean;

  /**
   * Get the detected test configuration.
   */
  getConfig(): Result<TestConfig, Error>;

  /**
   * Run tests with optional filtering.
   *
   * @param options - Run options
   */
  runTests(options?: RunTestsOptions): Promise<Result<TestRun, Error>>;

  /**
   * Run tests for specific files.
   *
   * @param files - File paths to test
   * @param options - Additional options
   */
  runFiles(files: string[], options?: RunTestsOptions): Promise<Result<TestRun, Error>>;

  /**
   * Get the last test run results.
   */
  getLastRun(): Result<TestRun, Error>;

  /**
   * List available test files.
   */
  listTestFiles(): Promise<Result<string[], Error>>;
}
