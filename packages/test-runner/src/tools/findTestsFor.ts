import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TestRunnerServiceImpl } from "../infrastructure/TestRunnerServiceImpl.js";

export function registerFindTestsFor(
  server: McpServer,
  service: TestRunnerServiceImpl
): void {
  server.registerTool(
    "find_tests_for",
    {
      title: "Find tests for source file",
      description: `Find test files related to a source file.

Uses multiple heuristics to discover related tests:
1. **Naming conventions**: foo.ts → foo.test.ts, foo.spec.ts
2. **Import analysis**: Tests that import the source file
3. **Co-location**: Tests in __tests__ directory or same folder

Returns test files with confidence levels (high/medium/low).

Use cases:
- Find which tests to run after modifying a file
- Discover test coverage for a module
- Understand test organization patterns`,
      inputSchema: {
        source_file: z.string().describe("Path to the source file (relative or absolute)"),
      },
    },
    async ({ source_file }) => {
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

      const result = await service.findTestsFor(source_file);

      if (!result.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error finding tests: ${result.error.message}`,
            },
          ],
          isError: true,
        };
      }

      const { sourceFile, testFiles } = result.value;

      if (testFiles.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No test files found for: ${sourceFile}\n\n` +
                `**Suggestions:**\n` +
                `- Create a test file with naming convention: ${sourceFile.replace(/\.[^.]+$/, ".test.ts")}\n` +
                `- Or create in __tests__ directory\n`,
            },
          ],
        };
      }

      // Group by confidence
      const highConfidence = testFiles.filter((t) => t.confidence === "high");
      const mediumConfidence = testFiles.filter((t) => t.confidence === "medium");
      const lowConfidence = testFiles.filter((t) => t.confidence === "low");

      let output = `## Tests for ${sourceFile}\n\n`;
      output += `Found **${testFiles.length}** related test file(s)\n\n`;

      if (highConfidence.length > 0) {
        output += `### High Confidence\n`;
        for (const t of highConfidence) {
          output += `- ${t.path}\n`;
          output += `  _${formatMatchReason(t.matchReason)}_\n`;
        }
        output += "\n";
      }

      if (mediumConfidence.length > 0) {
        output += `### Medium Confidence\n`;
        for (const t of mediumConfidence) {
          output += `- ${t.path}\n`;
          output += `  _${formatMatchReason(t.matchReason)}_\n`;
        }
        output += "\n";
      }

      if (lowConfidence.length > 0) {
        output += `### Low Confidence\n`;
        for (const t of lowConfidence) {
          output += `- ${t.path}\n`;
          output += `  _${formatMatchReason(t.matchReason)}_\n`;
        }
        output += "\n";
      }

      output += `---\n`;
      output += `**Tip:** Use \`run_related_tests\` to run these tests.\n`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  );
}

function formatMatchReason(
  reason: "naming_convention" | "imports_source" | "same_directory"
): string {
  switch (reason) {
    case "naming_convention":
      return "Matched by naming convention";
    case "imports_source":
      return "Imports the source file";
    case "same_directory":
      return "Same directory";
    default:
      return reason;
  }
}
