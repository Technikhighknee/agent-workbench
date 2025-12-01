import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

const RunTestsInput = z.object({
  files: z.array(z.string()).optional().describe("Specific test files to run"),
  testNamePattern: z.string().optional().describe("Pattern to match test names"),
  grep: z.string().optional().describe("Grep pattern to filter tests"),
  args: z.array(z.string()).optional().describe("Additional arguments for the test runner"),
});

type RunTestsInputType = z.infer<typeof RunTestsInput>;

export function registerRunTests(server: McpServer, service: TestRunnerServiceImpl): void {
  server.registerTool(
    "run_tests",
    {
      title: "Run tests",
      description: `Run tests in the project and get structured results.

INSTEAD OF: \`npm test\`, \`vitest\`, \`jest\` in Bash (which produces raw output and can timeout).

Returns detailed test results including:
- Pass/fail status for each test
- Failure messages with expected/actual values
- Stack traces mapped to source locations
- Summary statistics

Use cases:
- Run all tests to verify changes
- Run specific test files
- Run tests matching a pattern
- Check if a fix resolved failing tests`,
      inputSchema: {
        files: z.array(z.string()).optional().describe("Specific test files to run"),
        testNamePattern: z.string().optional().describe("Pattern to match test names"),
        grep: z.string().optional().describe("Grep pattern to filter tests"),
        args: z.array(z.string()).optional().describe("Additional arguments for the test runner"),
      },
    },
    async (input: RunTestsInputType) => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text" as const, text: "Error: Test runner not initialized. No test framework detected." }],
          isError: true,
        };
      }

      const result = await service.runTests({
        files: input.files,
        testNamePattern: input.testNamePattern,
        grep: input.grep,
        args: input.args,
      });

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error running tests: ${result.error.message}` }],
          isError: true,
        };
      }

      const run = result.value;
      const { summary } = run;

      // Format output
      let output = `## Test Results\n\n`;
      output += `**Status**: ${run.success ? "✓ PASSED" : "✗ FAILED"}\n`;
      output += `**Framework**: ${run.framework}\n`;
      output += `**Duration**: ${run.duration}ms\n\n`;

      output += `### Summary\n`;
      output += `- Total: ${summary.total}\n`;
      output += `- Passed: ${summary.passed}\n`;
      output += `- Failed: ${summary.failed}\n`;
      output += `- Skipped: ${summary.skipped}\n`;
      if (summary.fileCount) output += `- Files: ${summary.fileCount}\n`;

      // Show failures with details
      const failures = run.tests.filter((t) => t.status === "failed");
      if (failures.length > 0) {
        output += `\n### Failures\n\n`;
        for (const test of failures) {
          output += `#### ✗ ${test.fullName}\n`;
          if (test.file) {
            const loc = test.line ? `:${test.line}` : "";
            output += `File: \`${test.file}${loc}\`\n`;
          }
          if (test.failure) {
            output += `\n**Message**: ${test.failure.message}\n`;
            if (test.failure.expected !== undefined) {
              output += `**Expected**: \`${test.failure.expected}\`\n`;
            }
            if (test.failure.actual !== undefined) {
              output += `**Actual**: \`${test.failure.actual}\`\n`;
            }
            if (test.failure.location) {
              const { file, line, column } = test.failure.location;
              output += `**Location**: \`${file}:${line}:${column}\`\n`;
            }
          }
          output += `\n`;
        }
      }

      // Contextual tips based on results
      output += `---\n`;
      if (summary.failed > 0) {
        output += `**Tip:** Use \`get_test_failures\` for detailed failure info with source locations.\n`;
        output += `**Tip:** Use \`rerun_failed\` to quickly retry just the failing tests.\n`;
      }
      output += `**Tip:** Use \`mcp__types__get_diagnostics\` to check for type errors.\n`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
