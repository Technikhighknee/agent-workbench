import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

export function registerListTestFiles(server: McpServer, service: TestRunnerServiceImpl): void {
  server.registerTool(
    "list_test_files",
    {
      title: "List test files",
      description: `List all test files in the project.

Returns paths to all files matching test patterns (*.test.ts, *.spec.ts, etc.)

Use cases:
- Discover available tests
- Find test files for a specific feature
- Choose which tests to run`,
      inputSchema: {},
    },
    async () => {
      if (!service.isInitialized()) {
        return {
          content: [{ type: "text" as const, text: "Error: Test runner not initialized. No test framework detected." }],
          isError: true,
        };
      }

      const result = await service.listTestFiles();

      if (!result.ok) {
        return {
          content: [{ type: "text" as const, text: `Error listing test files: ${result.error.message}` }],
          isError: true,
        };
      }

      const files = result.value;

      if (files.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No test files found in project." }],
        };
      }

      let output = `## Test Files (${files.length})\n\n`;
      for (const file of files) {
        output += `- ${file}\n`;
      }

      output += `\n---\n`;
      output += `**Tip:** Use \`run_tests\` with specific files to run targeted tests.\n`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}
