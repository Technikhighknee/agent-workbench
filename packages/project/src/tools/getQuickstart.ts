/**
 * get_quickstart tool - Get instructions to build, test, and run the project.
 * Analyzes package.json scripts and provides actionable commands.
 */

import type { ToolRegistrar } from "./types.js";

interface QuickstartCommands {
  install?: string;
  build?: string;
  test?: string;
  dev?: string;
  start?: string;
  lint?: string;
  format?: string;
}

export const registerGetQuickstart: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_quickstart",
    {
      title: "Get quickstart",
      description:
        "Get actionable commands to install, build, test, and run this project. " +
        "Returns the most common commands needed to work with the codebase.",
      inputSchema: {},
    },
    async () => {
      const rootResult = service.getProjectRoot();
      if (!rootResult.ok) {
        return { content: [{ type: "text", text: `Error: ${rootResult.error}` }] };
      }

      const infoResult = await service.getProjectInfo();
      if (!infoResult.ok) {
        return { content: [{ type: "text", text: `Error: ${infoResult.error}` }] };
      }

      const info = infoResult.value;
      const commands: QuickstartCommands = {};
      const notes: string[] = [];

      // Determine package manager
      const fs = await import("fs");
      const path = await import("path");
      const root = rootResult.value;

      let packageManager = "npm";
      if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
        packageManager = "pnpm";
      } else if (fs.existsSync(path.join(root, "yarn.lock"))) {
        packageManager = "yarn";
      } else if (fs.existsSync(path.join(root, "bun.lockb"))) {
        packageManager = "bun";
      }

      // Determine install command
      commands.install = `${packageManager} install`;

      // Find scripts
      const scriptMap: Record<string, string[]> = {
        build: ["build", "compile", "bundle"],
        test: ["test", "test:unit", "tests"],
        dev: ["dev", "develop", "start:dev", "serve"],
        start: ["start", "serve", "run"],
        lint: ["lint", "eslint", "check"],
        format: ["format", "prettier", "fmt"],
      };

      for (const script of info.scripts) {
        for (const [category, names] of Object.entries(scriptMap)) {
          if (names.includes(script.name) && !commands[category as keyof QuickstartCommands]) {
            commands[category as keyof QuickstartCommands] = `${packageManager} run ${script.name}`;
          }
        }
      }

      // Check for workspaces (monorepo)
      if (info.workspaces && info.workspaces.length > 0) {
        notes.push(`This is a monorepo with ${info.workspaces.length} packages.`);
        notes.push(`To run commands in a specific package: \`${packageManager} run <cmd> -w <package-name>\``);
      }

      // Build output
      const output: string[] = [
        `# Quick Start: ${info.name}`,
        "",
        `**Project Type:** ${info.type}`,
        `**Package Manager:** ${packageManager}`,
        "",
        "## Commands",
        "",
      ];

      const commandDescriptions: Record<string, string> = {
        install: "Install dependencies",
        build: "Build the project",
        test: "Run tests",
        dev: "Start development server",
        start: "Start production server",
        lint: "Run linter",
        format: "Format code",
      };

      for (const [key, cmd] of Object.entries(commands)) {
        if (cmd) {
          output.push(`### ${commandDescriptions[key] || key}`);
          output.push("```bash");
          output.push(cmd);
          output.push("```");
          output.push("");
        }
      }

      if (notes.length > 0) {
        output.push("## Notes");
        output.push("");
        for (const note of notes) {
          output.push(`- ${note}`);
        }
        output.push("");
      }

      // Add available scripts section
      const scriptNames = info.scripts.map(s => s.name);
      const otherScripts = scriptNames.filter(name => {
        return !Object.values(scriptMap).flat().includes(name);
      });

      if (otherScripts.length > 0) {
        output.push("## Other Available Scripts");
        output.push("");
        output.push(`\`${otherScripts.join("`, `")}\``);
        output.push("");
      }

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};
