#!/usr/bin/env npx tsx
/**
 * Documentation generator for agent-workbench.
 *
 * Extracts package and tool metadata from source code and generates:
 * - docs/packages/*.md - Individual package documentation
 * - docs/packages/README.md - Package index
 * - generated/packages.json - Package metadata for runtime
 * - generated/tools.json - Tool metadata for session guide
 *
 * Run with: npx tsx scripts/generate-docs.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const DOCS_DIR = path.join(ROOT, "docs");
const GENERATED_DIR = path.join(ROOT, "generated");

interface ToolInfo {
  name: string;
  title: string;
  description: string;
  file: string;
}

interface PackageInfo {
  name: string;
  shortName: string;
  description: string;
  path: string;
  isServer: boolean;
  tools: ToolInfo[];
}

/**
 * Extract tool info from a TypeScript file containing registerTool calls.
 */
function extractToolsFromFile(filePath: string): ToolInfo[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const tools: ToolInfo[] = [];

  // Match: registerTool("tool_name", { title: "...", description: "...", ...
  // This regex captures tool name, then looks for title and description in the config object
  const registerPattern =
    /registerTool\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs;

  let match;
  while ((match = registerPattern.exec(content)) !== null) {
    const toolName = match[1];
    const configBlock = match[2];

    // Extract title
    const titleMatch = configBlock.match(/title\s*:\s*["']([^"']+)["']/);
    const title = titleMatch ? titleMatch[1] : toolName;

    // Extract description - handle multiline template literals and regular strings
    let description = "";
    const descMatch = configBlock.match(
      /description\s*:\s*(?:["'`]([^"'`]+)["'`]|`([^`]+)`)/s
    );
    if (descMatch) {
      description = (descMatch[1] || descMatch[2] || "")
        .replace(/\s+/g, " ")
        .trim();
      // Get first sentence only for cleaner output
      const firstSentence = description.match(/^[^.!?]+[.!?]?/);
      if (firstSentence && firstSentence[0].length < description.length) {
        description = firstSentence[0].trim();
      }
      // Truncate if still too long
      if (description.length > 150) {
        description = description.substring(0, 147) + "...";
      }
    }

    tools.push({
      name: toolName,
      title,
      description,
      file: path.basename(filePath),
    });
  }

  return tools;
}

/**
 * Scan a package directory for all tools.
 */
function scanPackageTools(packagePath: string): ToolInfo[] {
  const toolsDir = path.join(packagePath, "src", "tools");
  if (!fs.existsSync(toolsDir)) {
    return [];
  }

  const tools: ToolInfo[] = [];
  const files = fs.readdirSync(toolsDir).filter((f) => f.endsWith(".ts"));

  for (const file of files) {
    const filePath = path.join(toolsDir, file);
    tools.push(...extractToolsFromFile(filePath));
  }

  return tools;
}

/**
 * Read all packages and extract metadata.
 */
function scanPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const dirs = fs.readdirSync(PACKAGES_DIR);

  for (const dir of dirs) {
    const packagePath = path.join(PACKAGES_DIR, dir);
    const packageJsonPath = path.join(packagePath, "package.json");

    if (!fs.existsSync(packageJsonPath)) continue;

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const serverPath = path.join(packagePath, "src", "server.ts");
    const isServer = fs.existsSync(serverPath);

    const tools = scanPackageTools(packagePath);

    packages.push({
      name: packageJson.name,
      shortName: dir,
      description: packageJson.description || "",
      path: `packages/${dir}`,
      isServer,
      tools,
    });
  }

  // Sort: servers first, then by name
  return packages.sort((a, b) => {
    if (a.isServer !== b.isServer) return a.isServer ? -1 : 1;
    return a.shortName.localeCompare(b.shortName);
  });
}

/**
 * Generate markdown documentation for a single package.
 */
function generatePackageDoc(pkg: PackageInfo): string {
  const lines: string[] = [
    `# ${pkg.shortName}`,
    "",
    `[← Back to packages](README.md) · [Source](../../${pkg.path}/)`,
    "",
    pkg.description,
    "",
  ];

  if (pkg.tools.length > 0) {
    lines.push("## Tools", "", "| Tool | Description |", "|------|-------------|");

    for (const tool of pkg.tools) {
      const desc = tool.description || tool.title;
      lines.push(`| \`${tool.name}\` | ${desc} |`);
    }
    lines.push("");
  }

  if (pkg.isServer) {
    lines.push(
      "## MCP Configuration",
      "",
      "```json",
      "{",
      `  "${pkg.shortName}": {`,
      `    "command": "npx",`,
      `    "args": ["${pkg.name}"]`,
      "  }",
      "}",
      "```",
      ""
    );
  }

  return lines.join("\n");
}

/**
 * Generate the packages index.
 */
function generatePackagesIndex(packages: PackageInfo[]): string {
  const servers = packages.filter((p) => p.isServer);
  const shared = packages.filter((p) => !p.isServer);

  const lines: string[] = [
    "# Packages",
    "",
    "[← Back to docs](../README.md)",
    "",
    "## MCP Servers",
    "",
    "| Package | Tools | Description |",
    "|---------|-------|-------------|",
  ];

  for (const pkg of servers) {
    lines.push(
      `| [${pkg.shortName}](${pkg.shortName}.md) | ${pkg.tools.length} | ${pkg.description} |`
    );
  }

  if (shared.length > 0) {
    lines.push("", "## Shared", "", "| Package | Description |", "|---------|-------------|");
    for (const pkg of shared) {
      lines.push(`| [${pkg.shortName}](${pkg.shortName}.md) | ${pkg.description} |`);
    }
  }

  // Add dependency diagram
  lines.push(
    "",
    "## Dependencies",
    "",
    "```",
    "core ──┬── syntax ────── insight",
    "       ├── history",
    "       ├── project",
    "       ├── types ─────── preview",
    "       ├── task-runner ─ test-runner",
    "       └── board",
    "```"
  );

  return lines.join("\n");
}

/**
 * Generate JSON data for runtime use (e.g., session guide).
 */
function generateRuntimeData(packages: PackageInfo[]): {
  packages: Record<string, { description: string; tools: string[] }>;
  tools: Record<string, { package: string; description: string }>;
} {
  const packagesData: Record<string, { description: string; tools: string[] }> = {};
  const toolsData: Record<string, { package: string; description: string }> = {};

  for (const pkg of packages) {
    if (!pkg.isServer) continue;

    packagesData[pkg.shortName] = {
      description: pkg.description,
      tools: pkg.tools.map((t) => t.name),
    };

    for (const tool of pkg.tools) {
      toolsData[tool.name] = {
        package: pkg.shortName,
        description: tool.description || tool.title,
      };
    }
  }

  return { packages: packagesData, tools: toolsData };
}

/**
 * Main entry point.
 */
function main() {
  console.log("Scanning packages...");
  const packages = scanPackages();
  console.log(`Found ${packages.length} packages with ${packages.reduce((n, p) => n + p.tools.length, 0)} tools`);

  // Ensure directories exist
  fs.mkdirSync(path.join(DOCS_DIR, "packages"), { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Generate package docs
  for (const pkg of packages) {
    const docPath = path.join(DOCS_DIR, "packages", `${pkg.shortName}.md`);
    fs.writeFileSync(docPath, generatePackageDoc(pkg));
    console.log(`  → docs/packages/${pkg.shortName}.md`);
  }

  // Generate index
  const indexPath = path.join(DOCS_DIR, "packages", "README.md");
  fs.writeFileSync(indexPath, generatePackagesIndex(packages));
  console.log(`  → docs/packages/README.md`);

  // Generate runtime data
  const runtimeData = generateRuntimeData(packages);
  fs.writeFileSync(
    path.join(GENERATED_DIR, "packages.json"),
    JSON.stringify(runtimeData.packages, null, 2)
  );
  fs.writeFileSync(
    path.join(GENERATED_DIR, "tools.json"),
    JSON.stringify(runtimeData.tools, null, 2)
  );
  console.log(`  → generated/packages.json`);
  console.log(`  → generated/tools.json`);

  console.log("Done!");
}

main();
