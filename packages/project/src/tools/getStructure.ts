/**
 * get_structure tool - Get an overview of the project's directory structure.
 * Identifies key directories and files to help orient in a new codebase.
 */

import type { ToolRegistrar } from "./types.js";
import * as fs from "fs";
import * as path from "path";

interface DirectoryInfo {
  name: string;
  description: string;
  fileCount: number;
  keyFiles: string[];
}

// Well-known directory patterns and their purposes
const KNOWN_DIRECTORIES: Record<string, string> = {
  src: "Source code",
  lib: "Library code",
  app: "Application code (often Next.js/Remix)",
  pages: "Page components (Next.js pages router)",
  components: "Reusable UI components",
  hooks: "Custom React hooks",
  utils: "Utility functions",
  helpers: "Helper functions",
  services: "Service layer / API clients",
  api: "API routes or handlers",
  routes: "Route definitions",
  controllers: "Request handlers (MVC)",
  models: "Data models",
  schemas: "Schema definitions",
  types: "TypeScript type definitions",
  interfaces: "Interface definitions",
  config: "Configuration files",
  constants: "Constant values",
  assets: "Static assets (images, fonts)",
  public: "Public static files",
  static: "Static files",
  styles: "Stylesheets",
  css: "CSS files",
  test: "Test files",
  tests: "Test files",
  __tests__: "Test files (Jest convention)",
  spec: "Test specifications",
  fixtures: "Test fixtures",
  mocks: "Mock implementations",
  scripts: "Build/utility scripts",
  tools: "Development tools",
  docs: "Documentation",
  packages: "Monorepo packages",
  apps: "Monorepo applications",
  libs: "Monorepo libraries",
  modules: "Feature modules",
  features: "Feature-based organization",
  core: "Core business logic",
  shared: "Shared code across modules",
  common: "Common utilities",
  middleware: "Middleware functions",
  guards: "Route/access guards",
  decorators: "Decorators",
  pipes: "Data transformation pipes",
  filters: "Exception filters",
  interceptors: "Request interceptors",
  providers: "Dependency providers",
  repositories: "Data access layer",
  entities: "Database entities",
  migrations: "Database migrations",
  seeds: "Database seed data",
  locales: "Internationalization files",
  i18n: "Internationalization",
  store: "State management",
  state: "State management",
  actions: "Redux/state actions",
  reducers: "Redux reducers",
  selectors: "Redux selectors",
  queries: "GraphQL queries / React Query",
  mutations: "GraphQL mutations",
  context: "React contexts",
  layouts: "Layout components",
  templates: "Template files",
  views: "View components (MVC)",
  partials: "Partial templates",
  dist: "Build output",
  build: "Build output",
  out: "Build output",
  ".next": "Next.js build cache",
  node_modules: "Dependencies (ignored)",
  vendor: "Vendor files",
};

// Key files to look for
const KEY_FILES = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "index.ts",
  "index.js",
  "main.ts",
  "main.js",
  "app.ts",
  "app.js",
  "server.ts",
  "server.js",
  "index.html",
];

export const registerGetStructure: ToolRegistrar = (server, service) => {
  server.registerTool(
    "get_structure",
    {
      title: "Get structure",
      description:
        "Get an overview of the project's directory structure with descriptions. " +
        "Identifies key directories and important files to help understand the codebase layout.",
      inputSchema: {},
    },
    async () => {
      const root = await service.getProjectRoot();
      const directories: DirectoryInfo[] = [];
      const rootFiles: string[] = [];

      // Read top-level directory
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files and node_modules
          if (entry.name.startsWith(".") && entry.name !== ".github") continue;
          if (entry.name === "node_modules") continue;

          if (entry.isDirectory()) {
            const dirPath = path.join(root, entry.name);
            const description = KNOWN_DIRECTORIES[entry.name] || "Project directory";

            // Count files and find key files
            let fileCount = 0;
            const keyFilesFound: string[] = [];

            try {
              const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
              for (const dirEntry of dirEntries) {
                if (dirEntry.isFile()) {
                  fileCount++;
                  if (KEY_FILES.includes(dirEntry.name)) {
                    keyFilesFound.push(dirEntry.name);
                  }
                } else if (dirEntry.isDirectory()) {
                  // Count subdirectory contribution
                  fileCount += countFiles(path.join(dirPath, dirEntry.name), 2);
                }
              }
            } catch {
              // Ignore permission errors
            }

            directories.push({
              name: entry.name,
              description,
              fileCount,
              keyFiles: keyFilesFound,
            });
          } else if (entry.isFile()) {
            rootFiles.push(entry.name);
          }
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error reading directory: ${error instanceof Error ? error.message : String(error)}`
          }]
        };
      }

      // Sort directories: known ones first, then alphabetically
      directories.sort((a, b) => {
        const aKnown = a.name in KNOWN_DIRECTORIES;
        const bKnown = b.name in KNOWN_DIRECTORIES;
        if (aKnown && !bKnown) return -1;
        if (!aKnown && bKnown) return 1;
        return a.name.localeCompare(b.name);
      });

      // Build output
      const output: string[] = [
        `# Project Structure`,
        "",
        `**Root:** \`${root}\``,
        "",
        "## Directories",
        "",
      ];

      for (const dir of directories) {
        output.push(`### ${dir.name}/`);
        output.push(`${dir.description} (${dir.fileCount} files)`);
        if (dir.keyFiles.length > 0) {
          output.push(`Key files: ${dir.keyFiles.map(f => `\`${f}\``).join(", ")}`);
        }
        output.push("");
      }

      // Root files
      const importantRootFiles = rootFiles.filter(f =>
        KEY_FILES.includes(f) ||
        f.endsWith(".json") ||
        f.endsWith(".config.js") ||
        f.endsWith(".config.ts") ||
        f === "Makefile" ||
        f === "Dockerfile"
      );

      if (importantRootFiles.length > 0) {
        output.push("## Root Files");
        output.push("");
        for (const file of importantRootFiles) {
          output.push(`- \`${file}\``);
        }
        output.push("");
      }

      // Suggest where to start
      output.push("## Where to Start");
      output.push("");

      const suggestions: string[] = [];

      if (directories.some(d => d.name === "src")) {
        suggestions.push("Look in `src/` for main source code");
      }
      if (directories.some(d => d.name === "app")) {
        suggestions.push("Look in `app/` for application routes (likely Next.js App Router)");
      }
      if (directories.some(d => d.name === "pages")) {
        suggestions.push("Look in `pages/` for page components (likely Next.js Pages Router)");
      }
      if (directories.some(d => d.name === "packages")) {
        suggestions.push("This is a monorepo - explore `packages/` for individual packages");
      }
      if (rootFiles.includes("README.md")) {
        suggestions.push("Read `README.md` for project documentation");
      }

      if (suggestions.length > 0) {
        for (const suggestion of suggestions) {
          output.push(`- ${suggestion}`);
        }
      } else {
        output.push("- Start with the main entry point (index.ts/main.ts)");
        output.push("- Check package.json for available scripts");
      }

      output.push("");

      // Contextual tips for code navigation
      output.push("---");
      output.push("**Related MCP tools:**");
      output.push("- Use `mcp__syntax__list_symbols` to see functions/classes in a file");
      output.push("- Use `mcp__syntax__read_symbol` to read code by symbol name");
      output.push("- Use `mcp__graph__graph_initialize` then `graph_trace` for call chains");
      output.push("- Call `get_session_guide` for full MCP tool guidance");

      return { content: [{ type: "text", text: output.join("\n") }] };
    }
  );
};

/**
 * Recursively count files in a directory up to a max depth.
 */
function countFiles(dirPath: string, maxDepth: number): number {
  if (maxDepth <= 0) return 0;

  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules") continue;

      if (entry.isFile()) {
        count++;
      } else if (entry.isDirectory()) {
        count += countFiles(path.join(dirPath, entry.name), maxDepth - 1);
      }
    }
  } catch {
    // Ignore errors
  }
  return count;
}
