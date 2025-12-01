import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

export function registerRerunFailed(server: McpServer, service: TestRunnerServiceImpl): void {
  server.registerTool(
    "rerun_failed",
    {
      title: "Rerun failed tests",
      description: `Rerun only the tests that failed in the last run.

Useful for:
- Iterating on fixes without running the full test suite
- Verifying a fix resolved the failures
- Faster feedback during debugging`,
      inputSchema: {
        args: z.array(z.string()).optional().describe("Additional arguments for the test runner"),
      },
    },
    async (input: { args?: string[] }) => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text" as const, text: "Error: Test runner not initialized." }],
          isError: true,
        };
      }

      const result = await service.rerunFailed({ args: input.args });

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error.message}` }],
          isError: true,
        };
      }

      const run = result.value;
      const { summary } = run;

      let output = `## Rerun Results\n\n`;
      output += `**Status**: ${run.success ? "✓ ALL PASSING" : "✗ STILL FAILING"}\n`;
      output += `**Duration**: ${run.duration}ms\n\n`;

      output += `### Summary\n`;
      output += `- Total: ${summary.total}\n`;
      output += `- Passed: ${summary.passed}\n`;
      output += `- Failed: ${summary.failed}\n`;

      if (run.success) {
        output += `\n✓ All previously failing tests are now passing!\n`;
      } else {
        const failures = run.tests.filter((t) => t.status === "failed");
        output += `\n### Still Failing (${failures.length})\n\n`;
        for (const test of failures) {
          output += `- ✗ ${test.fullName}`;
          if (test.failure?.message) {
            output += `: ${test.failure.message.split("\n")[0]}`;
          }
          output += `\n`;
        }
      }

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
