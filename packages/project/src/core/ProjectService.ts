/**
 * Project metadata service.
 * Detects project type and reads configuration.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type Result,
  ok,
  err,
  type ProjectInfo,
  type ProjectType,
  type ConfigFile,
  type ConfigType,
} from "./model.js";
import {
  parseNpmProject,
  parseCargoProject,
  parsePythonProject,
  parseGoProject,
} from "./ProjectParsers.js";

/**
 * Known config files and their types.
 */
const CONFIG_FILES: Record<string, ConfigType> = {
  // Package managers
  "package.json": "npm",
  // TypeScript
  "tsconfig.json": "typescript",
  "tsconfig.base.json": "typescript",
  "jsconfig.json": "typescript",
  // ESLint
  ".eslintrc": "eslint",
  ".eslintrc.js": "eslint",
  ".eslintrc.cjs": "eslint",
  ".eslintrc.json": "eslint",
  "eslint.config.js": "eslint",
  "eslint.config.mjs": "eslint",
  // Prettier
  ".prettierrc": "prettier",
  ".prettierrc.js": "prettier",
  ".prettierrc.json": "prettier",
  "prettier.config.js": "prettier",
  // Testing
  "jest.config.js": "jest",
  "jest.config.ts": "jest",
  "jest.config.json": "jest",
  "vitest.config.ts": "vitest",
  "vitest.config.js": "vitest",
  // Build tools
  ".babelrc": "babel",
  "babel.config.js": "babel",
  "babel.config.json": "babel",
  "webpack.config.js": "webpack",
  "webpack.config.ts": "webpack",
  "vite.config.js": "vite",
  "vite.config.ts": "vite",
  "rollup.config.js": "rollup",
  "rollup.config.ts": "rollup",
  // Docker
  "Dockerfile": "docker",
  "docker-compose.yml": "docker",
  "docker-compose.yaml": "docker",
  // CI/CD
  ".github": "github",
  ".gitlab-ci.yml": "gitlab",
  // Editor
  ".editorconfig": "editor",
  // Git
  ".gitignore": "git",
  ".gitattributes": "git",
  // Node version
  ".nvmrc": "node",
  ".node-version": "node",
  // Monorepo tools
  "turbo.json": "monorepo",
  "nx.json": "monorepo",
  "pnpm-workspace.yaml": "monorepo",
  "lerna.json": "monorepo",
  // Other linters
  "biome.json": "linter",
  "biome.jsonc": "linter",
  ".oxlintrc.json": "linter",
  // Environment
  ".env": "env",
  ".env.local": "env",
  ".env.example": "env",
  ".env.development": "env",
  ".env.production": "env",
  // Claude / AI
  ".mcp.json": "mcp",
  "CLAUDE.md": "claude",
};

export class ProjectService {
  private resolvedRoot: string | null = null;

  constructor(private readonly rootPath: string) {}

  /**
   * Find the project root by walking up directories.
   */
  static async findProjectRoot(startPath: string): Promise<string> {
    const markers = [
      "package.json",
      "Cargo.toml",
      "pyproject.toml",
      "setup.py",
      "go.mod",
    ];

    let current = path.resolve(startPath);
    const root = path.parse(current).root;

    while (current !== root) {
      for (const marker of markers) {
        const markerPath = path.join(current, marker);
        try {
          await fs.access(markerPath);
          return current;
        } catch {
          // Continue searching
        }
      }
      current = path.dirname(current);
    }

    return startPath;
  }

  /**
   * Get the resolved project root (cached after first call).
   */
  async getProjectRoot(): Promise<string> {
    if (this.resolvedRoot === null) {
      this.resolvedRoot = await ProjectService.findProjectRoot(this.rootPath);
    }
    return this.resolvedRoot;
  }

  /**
   * Detect project type based on marker files.
   */
  async detectType(): Promise<ProjectType> {
    const projectRoot = await this.getProjectRoot();
    const checks: [string, ProjectType][] = [
      ["package.json", "npm"],
      ["Cargo.toml", "cargo"],
      ["pyproject.toml", "python"],
      ["setup.py", "python"],
      ["go.mod", "go"],
    ];

    for (const [file, type] of checks) {
      const filePath = path.join(projectRoot, file);
      try {
        await fs.access(filePath);
        return type;
      } catch {
        // File doesn't exist
      }
    }

    return "unknown";
  }

  /**
   * Get complete project info.
   */
  async getProjectInfo(): Promise<Result<ProjectInfo, string>> {
    const projectRoot = await this.getProjectRoot();
    const type = await this.detectType();

    switch (type) {
      case "npm":
        return parseNpmProject(projectRoot);
      case "cargo":
        return parseCargoProject(projectRoot);
      case "python":
        return parsePythonProject(projectRoot);
      case "go":
        return parseGoProject(projectRoot);
      default:
        return ok({
          name: path.basename(this.rootPath),
          version: "unknown",
          type: "unknown",
          rootPath: this.rootPath,
          scripts: [],
          dependencies: [],
        });
    }
  }

  /**
   * Find configuration files in the project.
   */
  async findConfigs(): Promise<Result<ConfigFile[], string>> {
    const projectRoot = await this.getProjectRoot();
    const configs: ConfigFile[] = [];

    try {
      const entries = await fs.readdir(projectRoot, { withFileTypes: true });

      for (const entry of entries) {
        const name = entry.name;
        const fullPath = path.join(projectRoot, name);

        if (name in CONFIG_FILES) {
          configs.push({
            name,
            path: fullPath,
            type: CONFIG_FILES[name],
          });
        } else if (entry.isDirectory() && name === ".github") {
          configs.push({
            name,
            path: fullPath,
            type: "github",
          });
        } else if (entry.isDirectory() && name === ".claude") {
          configs.push({
            name,
            path: fullPath,
            type: "claude",
          });
        }
      }

      // Check for nested config directories
      const nestedDirs: Array<{ name: string; type: ConfigType }> = [
        { name: ".vscode", type: "editor" },
      ];

      for (const { name, type } of nestedDirs) {
        const dirPath = path.join(projectRoot, name);
        try {
          await fs.access(dirPath);
          if (!configs.some((c) => c.name === name)) {
            configs.push({ name, path: dirPath, type });
          }
        } catch {
          // Directory doesn't exist
        }
      }

      return ok(configs.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      return err(`Failed to scan configs: ${error}`);
    }
  }

  /**
   * Read a specific config file.
   */
  async readConfig(configPath: string): Promise<Result<string, string>> {
    const projectRoot = await this.getProjectRoot();
    const fullPath = path.isAbsolute(configPath)
      ? configPath
      : path.join(projectRoot, configPath);

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      return ok(content);
    } catch (error) {
      return err(`Failed to read config: ${error}`);
    }
  }
}
