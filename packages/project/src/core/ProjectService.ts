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
  type Dependency,
  type Script,
  type ConfigFile,
  type ConfigType,
  type WorkspacePackage,
} from "./model.js";

/**
 * Known config files and their types.
 */
const CONFIG_FILES: Record<string, ConfigType> = {
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
};

export class ProjectService {
  private resolvedRoot: string | null = null;

  constructor(private readonly rootPath: string) {}

  /**
   * Find the project root by walking up directories.
   * Looks for package.json, Cargo.toml, pyproject.toml, go.mod.
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

    // No project root found, return original path
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
        // File doesn't exist, continue
      }
    }

    return "unknown";
  }

  /**
   * Get complete project info.
   */
  async getProjectInfo(): Promise<Result<ProjectInfo>> {
    const type = await this.detectType();

    switch (type) {
      case "npm":
        return this.parseNpmProject();
      case "cargo":
        return this.parseCargoProject();
      case "python":
        return this.parsePythonProject();
      case "go":
        return this.parseGoProject();
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
   * Parse npm/Node.js project.
   */
  private async parseNpmProject(): Promise<Result<ProjectInfo>> {
    const projectRoot = await this.getProjectRoot();
    const pkgPath = path.join(projectRoot, "package.json");

    try {
      const content = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(content);

      const scripts: Script[] = [];
      if (pkg.scripts) {
        for (const [name, command] of Object.entries(pkg.scripts)) {
          scripts.push({ name, command: String(command) });
        }
      }

      const dependencies: Dependency[] = [];

      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          dependencies.push({ name, version: String(version), type: "production" });
        }
      }

      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          dependencies.push({ name, version: String(version), type: "development" });
        }
      }

      if (pkg.peerDependencies) {
        for (const [name, version] of Object.entries(pkg.peerDependencies)) {
          dependencies.push({ name, version: String(version), type: "peer" });
        }
      }

      if (pkg.optionalDependencies) {
        for (const [name, version] of Object.entries(pkg.optionalDependencies)) {
          dependencies.push({ name, version: String(version), type: "optional" });
        }
      }

      // Detect workspaces
      let workspaces: WorkspacePackage[] | undefined;
      if (pkg.workspaces) {
        workspaces = await this.parseNpmWorkspaces(pkg.workspaces);
      }

      return ok({
        name: pkg.name || path.basename(projectRoot),
        version: pkg.version || "unknown",
        type: "npm",
        description: pkg.description,
        main: pkg.main,
        rootPath: projectRoot,
        scripts,
        dependencies,
        workspaces,
      });
    } catch (error) {
      return err(`Failed to parse package.json: ${error}`);
    }
  }

  /**
   * Parse npm workspaces and resolve to actual packages.
   */
  private async parseNpmWorkspaces(
    workspacesConfig: string[] | { packages: string[] }
  ): Promise<WorkspacePackage[]> {
    const projectRoot = await this.getProjectRoot();
    const patterns = Array.isArray(workspacesConfig)
      ? workspacesConfig
      : workspacesConfig.packages || [];

    const workspaces: WorkspacePackage[] = [];

    for (const pattern of patterns) {
      // Simple glob expansion - handle "packages/*" pattern
      if (pattern.includes("*")) {
        const baseDir = pattern.replace(/\/\*.*$/, "");
        const basePath = path.join(projectRoot, baseDir);

        try {
          const entries = await fs.readdir(basePath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const pkgPath = path.join(basePath, entry.name, "package.json");
              try {
                const content = await fs.readFile(pkgPath, "utf-8");
                const pkg = JSON.parse(content);
                workspaces.push({
                  name: pkg.name || entry.name,
                  path: path.join(baseDir, entry.name),
                  version: pkg.version,
                });
              } catch {
                // Not a package, skip
              }
            }
          }
        } catch {
          // Directory doesn't exist, skip
        }
      } else {
        // Direct path
        const pkgPath = path.join(projectRoot, pattern, "package.json");
        try {
          const content = await fs.readFile(pkgPath, "utf-8");
          const pkg = JSON.parse(content);
          workspaces.push({
            name: pkg.name || path.basename(pattern),
            path: pattern,
            version: pkg.version,
          });
        } catch {
          // Not a package, skip
        }
      }
    }

    return workspaces.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Parse Rust/Cargo project.
   */
  private async parseCargoProject(): Promise<Result<ProjectInfo>> {
    const projectRoot = await this.getProjectRoot();
    const cargoPath = path.join(projectRoot, "Cargo.toml");

    try {
      const content = await fs.readFile(cargoPath, "utf-8");

      // Simple TOML parsing for basic fields
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      const versionMatch = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
      const descMatch = content.match(/^\s*description\s*=\s*"([^"]+)"/m);

      const scripts: Script[] = [
        { name: "build", command: "cargo build" },
        { name: "build:release", command: "cargo build --release" },
        { name: "test", command: "cargo test" },
        { name: "run", command: "cargo run" },
        { name: "check", command: "cargo check" },
        { name: "clippy", command: "cargo clippy" },
        { name: "fmt", command: "cargo fmt" },
      ];

      // Parse dependencies
      const dependencies: Dependency[] = [];
      const depsSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
      if (depsSection) {
        const depLines = depsSection[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|{[^}]*version\s*=\s*"([^"]+)"[^}]*})/gm);
        for (const match of depLines) {
          dependencies.push({
            name: match[1],
            version: match[2] || match[3] || "unknown",
            type: "production",
          });
        }
      }

      const devDepsSection = content.match(/\[dev-dependencies\]([\s\S]*?)(?=\[|$)/);
      if (devDepsSection) {
        const depLines = devDepsSection[1].matchAll(/^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|{[^}]*version\s*=\s*"([^"]+)"[^}]*})/gm);
        for (const match of depLines) {
          dependencies.push({
            name: match[1],
            version: match[2] || match[3] || "unknown",
            type: "development",
          });
        }
      }

      return ok({
        name: nameMatch?.[1] || path.basename(projectRoot),
        version: versionMatch?.[1] || "unknown",
        type: "cargo",
        description: descMatch?.[1],
        rootPath: projectRoot,
        scripts,
        dependencies,
      });
    } catch (error) {
      return err(`Failed to parse Cargo.toml: ${error}`);
    }
  }

  /**
   * Parse Python project.
   */
  private async parsePythonProject(): Promise<Result<ProjectInfo>> {
    const projectRoot = await this.getProjectRoot();
    // Try pyproject.toml first
    const pyprojectPath = path.join(projectRoot, "pyproject.toml");

    try {
      const content = await fs.readFile(pyprojectPath, "utf-8");

      // Simple TOML parsing
      const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
      const versionMatch = content.match(/^\s*version\s*=\s*"([^"]+)"/m);
      const descMatch = content.match(/^\s*description\s*=\s*"([^"]+)"/m);

      const scripts: Script[] = [
        { name: "install", command: "pip install -e ." },
        { name: "test", command: "pytest" },
        { name: "lint", command: "ruff check ." },
        { name: "format", command: "ruff format ." },
        { name: "typecheck", command: "mypy ." },
      ];

      return ok({
        name: nameMatch?.[1] || path.basename(projectRoot),
        version: versionMatch?.[1] || "unknown",
        type: "python",
        description: descMatch?.[1],
        rootPath: projectRoot,
        scripts,
        dependencies: [], // Python deps are complex, skip for now
      });
    } catch {
      // Fall back to setup.py detection
      return ok({
        name: path.basename(projectRoot),
        version: "unknown",
        type: "python",
        rootPath: projectRoot,
        scripts: [
          { name: "install", command: "pip install -e ." },
          { name: "test", command: "pytest" },
        ],
        dependencies: [],
      });
    }
  }

  /**
   * Parse Go project.
   */
  private async parseGoProject(): Promise<Result<ProjectInfo>> {
    const projectRoot = await this.getProjectRoot();
    const goModPath = path.join(projectRoot, "go.mod");

    try {
      const content = await fs.readFile(goModPath, "utf-8");

      const moduleMatch = content.match(/^module\s+(\S+)/m);
      const goVersionMatch = content.match(/^go\s+(\S+)/m);

      const scripts: Script[] = [
        { name: "build", command: "go build ./..." },
        { name: "test", command: "go test ./..." },
        { name: "run", command: "go run ." },
        { name: "fmt", command: "go fmt ./..." },
        { name: "vet", command: "go vet ./..." },
        { name: "mod:tidy", command: "go mod tidy" },
      ];

      // Parse require block
      const dependencies: Dependency[] = [];
      const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
      if (requireMatch) {
        const depLines = requireMatch[1].matchAll(/^\s*(\S+)\s+(\S+)/gm);
        for (const match of depLines) {
          if (!match[1].startsWith("//")) {
            dependencies.push({
              name: match[1],
              version: match[2],
              type: "production",
            });
          }
        }
      }

      return ok({
        name: moduleMatch?.[1] || path.basename(projectRoot),
        version: goVersionMatch?.[1] || "unknown",
        type: "go",
        rootPath: projectRoot,
        scripts,
        dependencies,
      });
    } catch (error) {
      return err(`Failed to parse go.mod: ${error}`);
    }
  }

  /**
   * Find configuration files in the project.
   */
  async findConfigs(): Promise<Result<ConfigFile[]>> {
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
        }
      }

      // Check for nested configs
      const vscodeDir = path.join(projectRoot, ".vscode");
      try {
        await fs.access(vscodeDir);
        configs.push({
          name: ".vscode",
          path: vscodeDir,
          type: "editor",
        });
      } catch {
        // No .vscode
      }

      return ok(configs.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      return err(`Failed to scan configs: ${error}`);
    }
  }

  /**
   * Read a specific config file.
   */
  async readConfig(configPath: string): Promise<Result<string>> {
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
