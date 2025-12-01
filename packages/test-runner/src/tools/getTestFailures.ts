import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

export function registerGetTestFailures(server: McpServer, service: TestRunnerServiceImpl): void {
  server.registerTool(
    "get_test_failures",
    {
      title: "Get test failures",
      description: `Get detailed information about failed tests from the last run.

Returns failures with:
- Test name and file location
- Error message
- Expected vs actual values
- Stack trace with source mapping

Use cases:
- Review failures after running tests
- Get source locations to fix failing tests
- Understand assertion differences`,
      inputSchema: {},
    },
    async () => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text" as const, text: "Error: Test runner not initialized." }],
          isError: true,
        };
      }

      const result = service.getFailedTests();

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error.message}` }],
          isError: true,
        };
      }

      const failures = result.value;

      if (failures.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No failed tests in the last run." }],
        };
      }

      let output = `## Failed Tests (${failures.length})\n\n`;

      for (const test of failures) {
        output += `### ✗ ${test.fullName}\n`;

        if (test.file) {
          const loc = test.line ? `:${test.line}` : "";
          output += `**File**: \`${test.file}${loc}\`\n`;
        }

        output += `**Duration**: ${test.duration}ms\n`;

        if (test.failure) {
          output += `\n**Message**:\n\`\`\`\n${test.failure.message}\n\`\`\`\n`;

          if (test.failure.expected !== undefined && test.failure.actual !== undefined) {
            output += `\n**Expected**:\n\`\`\`\n${test.failure.expected}\n\`\`\`\n`;
            output += `\n**Actual**:\n\`\`\`\n${test.failure.actual}\n\`\`\`\n`;
          }

          if (test.failure.diff) {
            output += `\n**Diff**:\n\`\`\`diff\n${test.failure.diff}\n\`\`\`\n`;
          }

          if (test.failure.location) {
            const { file, line, column } = test.failure.location;
            output += `\n**Source Location**: \`${file}:${line}:${column}\`\n`;
          }

          if (test.failure.stack.length > 0) {
            output += `\n**Stack Trace**:\n\`\`\`\n`;
            for (const frame of test.failure.stack.slice(0, 5)) {
              if (frame.location) {
                const fn = frame.functionName ? `${frame.functionName} ` : "";
                output += `  at ${fn}(${frame.location.file}:${frame.location.line}:${frame.location.column})\n`;
              } else if (frame.raw) {
                output += `  ${frame.raw}\n`;
              }
            }
            if (test.failure.stack.length > 5) {
              output += `  ... ${test.failure.stack.length - 5} more frames\n`;
            }
            output += `\`\`\`\n`;
          }
        }

        output += `\n---\n\n`;
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
