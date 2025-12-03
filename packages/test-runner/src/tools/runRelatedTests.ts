import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

export function registerRunRelatedTests(
  server: McpServer,
  service: TestRunnerServiceImpl
): void {
  server.registerTool(
    "run_related_tests",
    {
      title: "Run tests for source file",
      description: `Run tests related to a source file.

Automatically discovers and runs tests for a given source file using:
1. Naming conventions (foo.ts → foo.test.ts)
2. Import analysis (tests that import the source)
3. Co-location patterns (__tests__ directory)

Only runs high/medium confidence tests by default.

Use cases:
- Quick verification after editing a file
- TDD workflow - run tests for current file
- Pre-commit verification for changed files`,
      inputSchema: {
        source_file: z.string().describe("Path to the source file (relative or absolute)"),
        args: z.array(z.string()).optional().describe("Additional arguments for the test runner"),
      },
    },
    async ({ source_file, args }) => {
      if (!service.isInitialized()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Test runner not initialized. No test framework detected.",
            },
          ],
          isError: true,
        };
      }

      // First find related tests
      const findResult = await service.findTestsFor(source_file);
      if (!findResult.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error finding tests: ${findResult.error.message}`,
            },
          ],
          isError: true,
        };
      }

      const { sourceFile, testFiles } = findResult.value;

      if (testFiles.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No test files found for: ${sourceFile}\n\n` +
                `Cannot run tests without test files.\n` +
                `**Suggestion:** Create a test file first.\n`,
            },
          ],
        };
      }

      // Run the tests
      const result = await service.runTestsFor(source_file, { args });

      if (!result.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running tests: ${result.error.message}`,
            },
          ],
          isError: true,
        };
      }

      const run = result.value;

      // Format output
      let output = `## Test Results for ${sourceFile}\n\n`;
      output += `**Status:** ${run.status === "passed" ? "✅ PASSED" : "❌ FAILED"}\n`;
      output += `**Duration:** ${run.duration}ms\n\n`;

      output += `### Summary\n`;
      output += `- Total: ${run.summary.total}\n`;
      output += `- Passed: ${run.summary.passed}\n`;
      output += `- Failed: ${run.summary.failed}\n`;
      if (run.summary.skipped > 0) {
        output += `- Skipped: ${run.summary.skipped}\n`;
      }
      output += "\n";

      // Show test files that were run
      const runTestFiles = [...new Set(testFiles.filter(t =>
        t.confidence === "high" || t.confidence === "medium"
      ).map(t => t.path))];

      if (runTestFiles.length > 0) {
        output += `### Test Files Run\n`;
        for (const file of runTestFiles) {
          output += `- ${file}\n`;
        }
        output += "\n";
      }

      // Show failures if any
      if (run.summary.failed > 0) {
        const failed = run.tests.filter((t) => t.status === "failed");
        output += `### Failures\n\n`;

        for (const test of failed.slice(0, 5)) {
          output += `#### ${test.name}\n`;
          if (test.file) {
            output += `📁 ${test.file}`;
            if (test.line) output += `:${test.line}`;
            output += "\n";
          }
          if (test.error) {
            output += `\`\`\`\n${test.error.slice(0, 500)}${test.error.length > 500 ? "..." : ""}\n\`\`\`\n`;
          }
          output += "\n";
        }

        if (failed.length > 5) {
          output += `_...and ${failed.length - 5} more failures_\n\n`;
        }

        output += `---\n`;
        output += `**Tip:** Use \`get_test_failures\` for detailed failure information.\n`;
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
