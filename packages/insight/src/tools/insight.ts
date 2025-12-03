/**
 * insight tool - Get comprehensive understanding of code.
 *
 * This is the primary tool. Give it a file, directory, or symbol name
 * and get back everything you need to understand it.
 */

import { z } from "zod";
import type { ToolRegistrar } from "./types.js";
import type {
  FileInsight,
  DirectoryInsight,
  SymbolInsight,
} from "../model.js";

// Input type
interface InsightInput {
  target: string;
  includeCode?: boolean;
  maxChanges?: number;
}

export const registerInsight: ToolRegistrar = (server, service) => {
  server.registerTool(
    "insight",
    {
      title: "Understand code",
      description: `Get comprehensive understanding of a file, directory, or symbol.

INSTEAD OF: Multiple calls to list_symbols, get_imports, get_exports, git_log, etc.

Returns:
- Structure (symbols, imports, exports)
- Relationships (who calls this, what this calls, dependencies)
- Recent changes (git history)
- Metrics and notes

Examples:
- insight({ target: "src/server.ts" }) - understand a file
- insight({ target: "src/utils" }) - understand a directory
- insight({ target: "TaskRunner" }) - understand a class/function`,
      inputSchema: {
        target: z.string().describe("File path, directory path, or symbol name to understand"),
        includeCode: z.boolean().optional().describe("Include source code in output (default: true)"),
        maxChanges: z.number().optional().describe("Max recent changes to include (default: 5)"),
      },
    },
    async (input: InsightInput) => {
      // Filter out undefined values so defaults aren't overridden
      const options: Record<string, unknown> = {};
      if (input.includeCode !== undefined) options.includeCode = input.includeCode;
      if (input.maxChanges !== undefined) options.maxChanges = input.maxChanges;

      const result = await service.getInsight(input.target, options);

      if (!result.ok) {
        return { content: [{ type: "text", text: `Error: ${result.error}` }] };
      }

      const insight = result.value;
      const output = formatInsight(insight);

      return { content: [{ type: "text", text: output }] };
    }
  );
};

function formatInsight(
  insight: FileInsight | DirectoryInsight | SymbolInsight
): string {
  switch (insight.type) {
    case "file":
      return formatFileInsight(insight);
    case "directory":
      return formatDirectoryInsight(insight);
    case "symbol":
      return formatSymbolInsight(insight);
  }
}

function formatFileInsight(insight: FileInsight): string {
  const lines: string[] = [];

  lines.push(`# ${insight.path}`);
  lines.push("");
  lines.push(`**Language:** ${insight.language}`);
  lines.push(`**Summary:** ${insight.summary}`);
  lines.push("");

  // Metrics
  lines.push("## Metrics");
  lines.push(`- Lines: ${insight.metrics.lines}`);
  lines.push(`- Symbols: ${insight.metrics.symbols}`);
  lines.push(`- Imports: ${insight.metrics.imports}`);
  lines.push(`- Exports: ${insight.metrics.exports}`);
  lines.push(`- Complexity: ${insight.metrics.complexity}`);
  lines.push("");

  // Structure
  if (insight.structure.symbols.length > 0) {
    lines.push("## Symbols");
    for (const sym of insight.structure.symbols.slice(0, 15)) {
      lines.push(`- \`${sym.name}\` (${sym.kind}) line ${sym.line}`);
    }
    if (insight.structure.symbols.length > 15) {
      lines.push(`  ... and ${insight.structure.symbols.length - 15} more`);
    }
    lines.push("");
  }

  // Imports
  if (insight.structure.imports.length > 0) {
    lines.push("## Imports");
    for (const imp of insight.structure.imports.slice(0, 10)) {
      const typeOnly = imp.isTypeOnly ? " (type)" : "";
      lines.push(`- \`${imp.source}\`: ${imp.names.join(", ")}${typeOnly}`);
    }
    if (insight.structure.imports.length > 10) {
      lines.push(`  ... and ${insight.structure.imports.length - 10} more`);
    }
    lines.push("");
  }

  // Exports
  if (insight.structure.exports.length > 0) {
    lines.push("## Exports");
    lines.push(insight.structure.exports.join(", "));
    lines.push("");
  }

  // Relationships
  if (insight.relationships.importedBy.length > 0) {
    lines.push("## Imported By");
    for (const file of insight.relationships.importedBy) {
      lines.push(`- ${file}`);
    }
    lines.push("");
  }

  // Recent changes
  if (insight.recentChanges.length > 0) {
    lines.push("## Recent Changes");
    for (const change of insight.recentChanges) {
      lines.push(`- \`${change.hash}\` ${change.message} (${change.author}, ${change.date})`);
    }
    lines.push("");
  }

  // Notes
  if (insight.notes.length > 0) {
    lines.push("## Notes");
    for (const note of insight.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatDirectoryInsight(insight: DirectoryInsight): string {
  const lines: string[] = [];

  lines.push(`# ${insight.path}`);
  lines.push("");
  lines.push(`**Summary:** ${insight.summary}`);
  lines.push("");

  // Metrics
  lines.push("## Metrics");
  lines.push(`- Files: ${insight.structure.files.length}`);
  lines.push(`- Subdirectories: ${insight.structure.subdirectories.length}`);
  lines.push(`- Total lines: ${insight.metrics.lines}`);
  lines.push(`- Total symbols: ${insight.metrics.symbols}`);
  lines.push(`- Complexity: ${insight.metrics.complexity}`);
  lines.push("");

  // Structure
  if (insight.structure.entryPoints.length > 0) {
    lines.push("## Entry Points");
    for (const ep of insight.structure.entryPoints) {
      lines.push(`- ${ep}`);
    }
    lines.push("");
  }

  if (insight.structure.files.length > 0) {
    lines.push("## Files");
    for (const file of insight.structure.files.slice(0, 15)) {
      lines.push(`- ${file}`);
    }
    if (insight.structure.files.length > 15) {
      lines.push(`  ... and ${insight.structure.files.length - 15} more`);
    }
    lines.push("");
  }

  if (insight.structure.subdirectories.length > 0) {
    lines.push("## Subdirectories");
    for (const dir of insight.structure.subdirectories) {
      lines.push(`- ${dir}/`);
    }
    lines.push("");
  }

  // Key symbols
  if (insight.structure.keySymbols.length > 0) {
    lines.push("## Key Symbols");
    for (const sym of insight.structure.keySymbols.slice(0, 10)) {
      lines.push(`- \`${sym.name}\` (${sym.kind}) in ${sym.file}`);
    }
    if (insight.structure.keySymbols.length > 10) {
      lines.push(`  ... and ${insight.structure.keySymbols.length - 10} more`);
    }
    lines.push("");
  }

  // Dependencies
  if (insight.relationships.externalDeps.length > 0) {
    lines.push("## External Dependencies");
    lines.push(insight.relationships.externalDeps.slice(0, 10).join(", "));
    lines.push("");
  }

  if (insight.relationships.internalDeps.length > 0) {
    lines.push("## Internal Dependencies");
    for (const dep of insight.relationships.internalDeps) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  }

  // Recent changes
  if (insight.recentChanges.length > 0) {
    lines.push("## Recent Changes");
    for (const change of insight.recentChanges) {
      lines.push(`- \`${change.hash}\` ${change.message} (${change.author}, ${change.date})`);
    }
    lines.push("");
  }

  // Notes
  if (insight.notes.length > 0) {
    lines.push("## Notes");
    for (const note of insight.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatSymbolInsight(insight: SymbolInsight): string {
  const lines: string[] = [];

  lines.push(`# ${insight.namePath}`);
  lines.push("");
  lines.push(`**Kind:** ${insight.kind}`);
  lines.push(`**File:** ${insight.file}:${insight.line}`);
  lines.push(`**Summary:** ${insight.summary}`);
  lines.push("");

  // Signature
  if (insight.signature) {
    lines.push("## Signature");
    lines.push("```typescript");
    lines.push(insight.signature);
    lines.push("```");
    lines.push("");
  }

  // Code
  if (insight.code) {
    lines.push("## Code");
    lines.push("```typescript");
    lines.push(insight.code);
    lines.push("```");
    lines.push("");
  }

  // Relationships - calls
  if (insight.relationships.calls.length > 0) {
    lines.push("## Calls");
    for (const call of insight.relationships.calls) {
      lines.push(`- \`${call.symbol.name}\` at line ${call.line}`);
    }
    lines.push("");
  }

  // Relationships - called by
  if (insight.relationships.calledBy.length > 0) {
    lines.push("## Called By");
    for (const caller of insight.relationships.calledBy) {
      lines.push(`- \`${caller.symbol.name}\` in ${caller.symbol.file}:${caller.line}`);
    }
    lines.push("");
  }

  // Related symbols
  if (insight.relationships.related.length > 0) {
    lines.push("## Related Symbols");
    for (const rel of insight.relationships.related.slice(0, 10)) {
      lines.push(`- \`${rel.name}\` (${rel.kind})`);
    }
    lines.push("");
  }

  // Recent changes
  if (insight.recentChanges.length > 0) {
    lines.push("## Recent Changes");
    for (const change of insight.recentChanges) {
      lines.push(`- \`${change.hash}\` ${change.message} (${change.author}, ${change.date})`);
    }
    lines.push("");
  }

  // Notes
  if (insight.notes.length > 0) {
    lines.push("## Notes");
    for (const note of insight.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
