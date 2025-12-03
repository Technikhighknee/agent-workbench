/**
 * get_session_guide tool - Comprehensive guidance for using agent-workbench MCP tools.
 * Designed to be called at the start of a session.
 *
 * Dynamically loads package information from generated/session-guide.json
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";
import * as path from "path";

interface PackageInfo {
  tagline: string;
  description: string;
  tools: string[];
}

type SessionGuideData = Record<string, PackageInfo>;

/**
 * Load session guide data from generated JSON file.
 * Falls back to empty object if file doesn't exist.
 */
function loadSessionGuideData(): SessionGuideData {
  try {
    // Find the repo root by looking for generated/session-guide.json
    // Start from this file's directory and walk up
    let dir = import.meta.dirname;
    for (let i = 0; i < 10; i++) {
      const guidePath = path.join(dir, "generated", "session-guide.json");
      if (fs.existsSync(guidePath)) {
        const content = fs.readFileSync(guidePath, "utf-8");
        return JSON.parse(content);
      }
      dir = path.dirname(dir);
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Generate the available packages section from loaded data.
 */
function generatePackagesSection(data: SessionGuideData): string {
  const packages = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

  if (packages.length === 0) {
    return "## Available Packages\n\nNo package data found.\n";
  }

  const lines: string[] = ["## Available Packages", ""];

  for (const [name, info] of packages) {
    const toolPrefix = name.replace("-", "_");
    lines.push(`### ${name}`);
    lines.push(`**${info.tagline}** ${info.description}`);
    lines.push("");
    lines.push("Tools:");
    for (const tool of info.tools) {
      lines.push(`- \`mcp__${toolPrefix}__${tool}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build the complete session guide.
 */
function buildSessionGuide(): string {
  const data = loadSessionGuideData();

  const intro = `# Agent Workbench - MCP Tools Usage Guide

**You have specialized MCP tools available.** Use them instead of Bash for better results.

These tools give you: structured data, no timeouts, source-mapped errors, semantic code operations.

## Critical Rules: Use MCP Tools, Not Bash

| Category | ❌ Never Use | ✅ Always Use |
|----------|-------------|--------------|
| Git | \`git log\`, \`git blame\`, \`git diff\` | \`mcp__history__*\` |
| TypeScript | \`tsc\`, \`tsc --noEmit\` | \`mcp__types__*\` |
| Tests | \`npm test\`, \`vitest\`, \`jest\` | \`mcp__test_runner__*\` |
| Builds | Bash for long commands | \`mcp__task_runner__*\` |
| Code ops | Read + Edit for functions | \`mcp__syntax__*\` |

## First: Understand Code With One Call

Before diving into unfamiliar code, use **insight**:
\`\`\`
mcp__insight__insight({ target: "src/server.ts" })     // understand a file
mcp__insight__insight({ target: "src/utils" })         // understand a directory
mcp__insight__insight({ target: "TaskRunner" })        // understand a class
\`\`\`

Returns: symbols, imports/exports, callers/callees, git history, metrics - all at once.

`;

  const packagesSection = generatePackagesSection(data);

  const quickGuide = `## Quick Decision Guide

| I want to... | Use |
|-------------|-----|
| **Understanding** | |
| Understand a file/class | \`mcp__insight__insight\` |
| See file structure | \`mcp__syntax__list_symbols\` |
| Read a function | \`mcp__syntax__read_symbol\` |
| **Editing** | |
| Edit a function | \`mcp__syntax__edit_symbol\` |
| Rename everywhere | \`mcp__syntax__rename_symbol\` |
| Move file safely | \`mcp__syntax__move_file\` |
| **Analysis** | |
| Who calls this? | \`mcp__syntax__get_callers\` |
| Find unused exports | \`mcp__syntax__find_unused_exports\` |
| Find dead code | \`mcp__syntax__find_dead_code\` |
| **Type checking** | |
| Check for errors | \`mcp__types__check_file\` |
| Type at position | \`mcp__types__get_type\` |
| **Testing** | |
| Run tests | \`mcp__test_runner__run_tests\` |
| See failures | \`mcp__test_runner__get_test_failures\` |
| **Git** | |
| Git history | \`mcp__history__file_history\` |
| Who wrote this | \`mcp__history__blame_file\` |
| Current status | \`mcp__history__git_status\` |
| **Builds** | |
| Build project | \`mcp__task_runner__task_run\` |
| Start dev server | \`mcp__task_runner__task_start\` |
`;

  return intro + packagesSection + quickGuide;
}

export function registerGetSessionGuide(server: McpServer): void {
  server.registerTool(
    "get_session_guide",
    {
      title: "Get session guide",
      description:
        "MANDATORY: Call this at the start of every session and after context compacting. " +
        "Learn about 60+ specialized MCP tools that replace Bash for git, TypeScript, tests, " +
        "builds, and code editing. These tools give structured results, no timeouts, and " +
        "semantic operations. Covers: insight, history, types, test-runner, task-runner, syntax packages.",
      inputSchema: {},
    },
    async () => {
      const guide = buildSessionGuide();
      return { content: [{ type: "text", text: guide }] };
    }
  );
}
