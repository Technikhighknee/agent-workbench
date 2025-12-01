/**
 * Core domain types for the test-runner package.
 * Framework-agnostic test result representation.
 */

/**
 * Status of a test.
 */
export type TestStatus = "passed" | "failed" | "skipped" | "pending" | "todo";

/**
 * Detected test framework.
 */
export type TestFramework =
  | "jest"
  | "vitest"
  | "node"      // Node.js built-in test runner
  | "mocha"
  | "pytest"
  | "go"
  | "cargo"
  | "unknown";

/**
 * A source location in a test file.
 */
export interface SourceLocation {
  /** File path (relative to project root) */
  file: string;
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number (if available) */
  column?: number;
}

/**
 * A single stack frame from a failure.
 */
export interface StackFrame {
  /** Function or method name */
  functionName?: string;
  /** Source location */
  location?: SourceLocation;
  /** Raw stack line */
  raw: string;
}

/**
 * Detailed information about a test failure.
 */
export interface TestFailure {
  /** Error message */
  message: string;
  /** Expected value (for assertion failures) */
  expected?: string;
  /** Actual value (for assertion failures) */
  actual?: string;
  /** Diff between expected and actual (if available) */
  diff?: string;
  /** Parsed stack trace */
  stack: StackFrame[];
  /** Raw stack trace string */
  rawStack?: string;
  /** Location of the failing assertion */
  location?: SourceLocation;
}

/**
 * Result of a single test case.
 */
export interface TestResult {
  /** Test name/title */
  name: string;
  /** Full path including suite names */
  fullName: string;
  /** Test status */
  status: TestStatus;
  /** Duration in milliseconds */
  duration: number;
  /** Failure details (if failed) */
  failure?: TestFailure;
  /** File containing the test */
  file?: string;
  /** Line number where test is defined */
  line?: number;
  /** Retry attempt number (if retried) */
  retryAttempt?: number;
}

/**
 * A test suite (describe block, test file, etc.).
 */
export interface TestSuite {
  /** Suite name */
  name: string;
  /** File path */
  file: string;
  /** Child tests */
  tests: TestResult[];
  /** Child suites */
  suites: TestSuite[];
  /** Suite-level duration */
  duration: number;
  /** Count of passed tests (including children) */
  passedCount: number;
  /** Count of failed tests (including children) */
  failedCount: number;
  /** Count of skipped tests (including children) */
  skippedCount: number;
}

/**
 * Aggregate results from a test run.
 */
export interface TestRun {
  /** When the run started */
  startedAt: string;
  /** When the run completed */
  completedAt: string;
  /** Total duration in milliseconds */
  duration: number;
  /** Whether the run succeeded (all tests passed) */
  success: boolean;
  /** Detected test framework */
  framework: TestFramework;
  /** All test suites */
  suites: TestSuite[];
  /** Flattened list of all test results */
  tests: TestResult[];
  /** Summary counts */
  summary: TestSummary;
  /** Raw command output */
  rawOutput?: string;
}

/**
 * Summary statistics for a test run.
 */
export interface TestSummary {
  /** Total number of tests */
  total: number;
  /** Number of passed tests */
  passed: number;
  /** Number of failed tests */
  failed: number;
  /** Number of skipped tests */
  skipped: number;
  /** Number of pending/todo tests */
  pending: number;
  /** Number of test files */
  fileCount: number;
  /** Number of test suites */
  suiteCount: number;
}

/**
 * Options for running tests.
 */
export interface RunTestsOptions {
  /** Specific test file(s) to run */
  files?: string[];
  /** Test name pattern to match */
  testNamePattern?: string;
  /** Only run tests matching this grep pattern */
  grep?: string;
  /** Run tests in watch mode */
  watch?: boolean;
  /** Update snapshots */
  updateSnapshots?: boolean;
  /** Run only failed tests from last run */
  onlyFailures?: boolean;
  /** Maximum parallel workers */
  maxWorkers?: number;
  /** Timeout per test in milliseconds */
  timeout?: number;
  /** Additional arguments to pass to the test runner */
  args?: string[];
}

/**
 * Information about detected test configuration.
 */
export interface TestConfig {
  /** Detected framework */
  framework: TestFramework;
  /** Command to run tests */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Config file path (if found) */
  configFile?: string;
  /** Test file patterns */
  testPatterns: string[];
}

/**
 * A test file with its tests.
 */
export interface TestFile {
  /** File path */
  path: string;
  /** Tests in this file */
  tests: TestResult[];
  /** Whether the file had any failures */
  hasFailures: boolean;
  /** Duration for all tests in file */
  duration: number;
}
