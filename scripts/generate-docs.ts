#!/usr/bin/env npx tsx
/**
 * Documentation generator for agent-workbench.
 *
 * Reads GUIDE.md from each package and generates:
 * - .claude/skills/[pkg]/SKILL.md - Skill files for Claude
 * - docs/packages/[pkg].md - Package documentation
 * - generated/session-guide.json - Data for get_session_guide
 *
 * Run with: npm run generate:docs
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const DOCS_DIR = path.join(ROOT, "docs");
const SKILLS_DIR = path.join(ROOT, ".claude", "skills");
const GENERATED_DIR = path.join(ROOT, "generated");

interface GuideFrontmatter {
  name: string;
  tagline: string;
}

interface PackageGuide {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  content: string;
  tools: string[];
  isServer: boolean;
}

/**
 * Parse YAML-like frontmatter from markdown.
 */
function parseFrontmatter(content: string): { frontmatter: GuideFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: { name: "", tagline: "" }, body: content };
  }

  const yamlContent = match[1];
  const body = match[2];

  const frontmatter: GuideFrontmatter = { name: "", tagline: "" };
  for (const line of yamlContent.split("\n")) {
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim().replace(/^["']|["']$/g, "");
    if (key.trim() === "name") frontmatter.name = value;
    if (key.trim() === "tagline") frontmatter.tagline = value;
  }

  return { frontmatter, body };
}

/**
 * Extract tool names from Quick Reference table in GUIDE.md.
 */
function extractTools(content: string): string[] {
  const tools: string[] = [];

  // Find Quick Reference section
  const quickRefMatch = content.match(/## Quick Reference[\s\S]*?\|[\s\S]*?(?=\n##|\n$)/);
  if (!quickRefMatch) return tools;

  // Extract tool names from backticks in table
  const toolMatches = quickRefMatch[0].matchAll(/`([a-z_]+)`/g);
  for (const match of toolMatches) {
    if (!tools.includes(match[1])) {
      tools.push(match[1]);
    }
  }

  return tools;
}

/**
 * Extract first paragraph as description.
 */
function extractDescription(body: string): string {
  // Skip the title, get first non-empty paragraph
  const lines = body.split("\n");
  let foundTitle = false;
  let description = "";

  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim() && !line.startsWith("#")) {
      description = line.replace(/\*\*/g, "").trim();
      break;
    }
  }

  return description;
}

/**
 * Read all packages with GUIDE.md.
 */
function scanPackages(): PackageGuide[] {
  const packages: PackageGuide[] = [];
  const dirs = fs.readdirSync(PACKAGES_DIR);

  for (const dir of dirs) {
    const packagePath = path.join(PACKAGES_DIR, dir);
    const guidePath = path.join(packagePath, "GUIDE.md");
    const packageJsonPath = path.join(packagePath, "package.json");

    if (!fs.existsSync(guidePath) || !fs.existsSync(packageJsonPath)) continue;

    const guideContent = fs.readFileSync(guidePath, "utf-8");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const serverPath = path.join(packagePath, "src", "server.ts");
    const isServer = fs.existsSync(serverPath);

    const { frontmatter, body } = parseFrontmatter(guideContent);
    const tools = extractTools(body);
    const description = extractDescription(body);

    packages.push({
      name: packageJson.name,
      shortName: dir,
      tagline: frontmatter.tagline,
      description,
      content: body,
      tools,
      isServer,
    });
  }

  return packages.sort((a, b) => a.shortName.localeCompare(b.shortName));
}

/**
 * Generate SKILL.md for Claude.
 */
function generateSkillFile(pkg: PackageGuide): string {
  const allowedTools = pkg.tools.map(t => `mcp__${pkg.shortName}__${t}`).join(", ");

  const lines: string[] = [
    "---",
    `name: ${pkg.shortName}`,
    `description: "${pkg.tagline}"`,
    `allowed-tools: ${allowedTools}`,
    "---",
    "",
    pkg.content,
  ];

  return lines.join("\n");
}

/**
 * Generate markdown doc for a package.
 */
function generatePackageDoc(pkg: PackageGuide): string {
  const lines: string[] = [
    `# ${pkg.shortName}`,
    "",
    `[← Back to packages](README.md) · [Source](../../packages/${pkg.shortName}/)`,
    "",
    pkg.description,
    "",
  ];

  if (pkg.tools.length > 0) {
    lines.push("## Tools", "");
    for (const tool of pkg.tools) {
      lines.push(`- \`${tool}\``);
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
      "",
      `See [GUIDE.md](../../packages/${pkg.shortName}/GUIDE.md) for full documentation.`
    );
  }

  return lines.join("\n");
}

/**
 * Generate packages index.
 */
function generatePackagesIndex(packages: PackageGuide[]): string {
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
    lines.push(`| [${pkg.shortName}](${pkg.shortName}.md) | ${pkg.tools.length} | ${pkg.tagline} |`);
  }

  if (shared.length > 0) {
    lines.push("", "## Shared", "", "| Package | Description |", "|---------|-------------|");
    for (const pkg of shared) {
      lines.push(`| [${pkg.shortName}](${pkg.shortName}.md) | ${pkg.tagline} |`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate session guide JSON for runtime use.
 */
function generateSessionGuide(packages: PackageGuide[]): object {
  const guide: Record<string, {
    tagline: string;
    description: string;
    tools: string[];
  }> = {};

  for (const pkg of packages) {
    // Only include packages that are MCP servers with tools
    if (!pkg.isServer || pkg.tools.length === 0) continue;

    guide[pkg.shortName] = {
      tagline: pkg.tagline,
      description: pkg.description,
      tools: pkg.tools,
    };
  }

  return guide;
}

/**
 * Main entry point.
 */
function main() {
  console.log("Scanning packages for GUIDE.md...");
  const packages = scanPackages();
  console.log(`Found ${packages.length} packages with GUIDE.md`);

  // Ensure directories exist
  fs.mkdirSync(path.join(DOCS_DIR, "packages"), { recursive: true });
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Generate skill files (only for packages with tools)
  for (const pkg of packages) {
    if (!pkg.isServer || pkg.tools.length === 0) continue;

    const skillDir = path.join(SKILLS_DIR, pkg.shortName);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(skillPath, generateSkillFile(pkg));
    console.log(`  → .claude/skills/${pkg.shortName}/SKILL.md`);
  }

  // Generate package docs
  for (const pkg of packages) {
    const docPath = path.join(DOCS_DIR, "packages", `${pkg.shortName}.md`);
    fs.writeFileSync(docPath, generatePackageDoc(pkg));
    console.log(`  → docs/packages/${pkg.shortName}.md`);
  }

  // Generate packages index
  const indexPath = path.join(DOCS_DIR, "packages", "README.md");
  fs.writeFileSync(indexPath, generatePackagesIndex(packages));
  console.log(`  → docs/packages/README.md`);

  // Generate session guide JSON
  const sessionGuide = generateSessionGuide(packages);
  fs.writeFileSync(
    path.join(GENERATED_DIR, "session-guide.json"),
    JSON.stringify(sessionGuide, null, 2)
  );
  console.log(`  → generated/session-guide.json`);

  console.log("Done!");
}

main();
