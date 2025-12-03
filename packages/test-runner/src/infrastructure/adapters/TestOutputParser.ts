/**
 * Test output parser for npm-based test runners.
 * Parses both JSON and text output formats.
 */

import path from "path";

import type {
  TestRun,
  TestResult,
  TestSuite,
  TestStatus,
  TestFramework,
} from "../../core/model.js";
import { parseTestFailure } from "./FailureParser.js";

/**
 * Parse test output (JSON or text format).
 */
export function parseTestOutput(
  output: string,
  exitCode: number,
  framework: TestFramework
): TestRun {
  // Try to parse as JSON first (Vitest/Jest JSON output)
  const jsonResult = tryParseJson(output, framework);
  if (jsonResult) {
    return jsonResult;
  }

  // Fall back to regex parsing of text output
  return parseTextOutput(output, exitCode, framework);
}

/**
 * Try to parse JSON output from Jest/Vitest.
 */
function tryParseJson(output: string, framework: TestFramework): TestRun | null {
  // Find JSON in output (might have other text around it)
  const jsonMatch = output.match(/(\{[\s\S]*"numTotalTests"[\s\S]*\})/);
  if (!jsonMatch) return null;

  try {
    const json = JSON.parse(jsonMatch[1]);
    return parseJestJson(json, framework);
  } catch {
    return null;
  }
}

/**
 * Parse Jest/Vitest JSON output format.
 */
function parseJestJson(
  json: {
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
  },
  framework: TestFramework
): TestRun {
  const tests: TestResult[] = [];
  const suites: TestSuite[] = [];

  for (const file of json.testResults) {
    const fileTests: TestResult[] = [];

    for (const test of file.assertionResults) {
      const status = mapStatus(test.status);
      const failure = test.failureMessages?.length
        ? parseTestFailure(test.failureMessages.join("\n"))
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
    framework,
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

/**
 * Parse text-based test output.
 */
function parseTextOutput(
  output: string,
  _exitCode: number,
  framework: TestFramework
): TestRun {
  const tests: TestResult[] = [];
  const lines = output.split("\n");

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const line of lines) {
    // Match patterns like "✓ test name" or "✗ test name"
    const passMatch = line.match(/[✓✔]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
    const failMatch = line.match(/[✗✘×]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);
    const skipMatch = line.match(/[○-]\s+(.+?)(?:\s+\(\d+\s*m?s\))?$/);

    if (passMatch) {
      tests.push(createTestResult(passMatch[1], "passed"));
      passed++;
    } else if (failMatch) {
      tests.push(createTestResult(failMatch[1], "failed"));
      failed++;
    } else if (skipMatch) {
      tests.push(createTestResult(skipMatch[1], "skipped"));
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
    success: failed === 0,
    framework,
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

/**
 * Create a basic test result.
 */
function createTestResult(name: string, status: TestStatus): TestResult {
  return {
    name: name.trim(),
    fullName: name.trim(),
    status,
    duration: 0,
  };
}

/**
 * Map test status string to TestStatus enum.
 */
function mapStatus(status: string): TestStatus {
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
