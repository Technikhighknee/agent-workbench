/**
 * Language-specific project parsers.
 * Extracts project info from package.json, Cargo.toml, pyproject.toml, go.mod.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  Result,
  ProjectInfo,
  Dependency,
  Script,
  WorkspacePackage,
} from "./model.js";
import { ok, err } from "./model.js";

/**
 * Parse npm/Node.js project.
 */
export async function parseNpmProject(projectRoot: string): Promise<Result<ProjectInfo, string>> {
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

    const dependencies = parseNpmDependencies(pkg);

    let workspaces: WorkspacePackage[] | undefined;
    if (pkg.workspaces) {
      workspaces = await parseNpmWorkspaces(projectRoot, pkg.workspaces);
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
 * Parse all npm dependency types.
 */
function parseNpmDependencies(pkg: Record<string, unknown>): Dependency[] {
  const dependencies: Dependency[] = [];
  const depTypes: Array<{ key: string; type: Dependency["type"] }> = [
    { key: "dependencies", type: "production" },
    { key: "devDependencies", type: "development" },
    { key: "peerDependencies", type: "peer" },
    { key: "optionalDependencies", type: "optional" },
  ];

  for (const { key, type } of depTypes) {
    const deps = pkg[key] as Record<string, string> | undefined;
    if (deps) {
      for (const [name, version] of Object.entries(deps)) {
        dependencies.push({ name, version: String(version), type });
      }
    }
  }

  return dependencies;
}

/**
 * Parse npm workspaces and resolve to actual packages.
 */
async function parseNpmWorkspaces(
  projectRoot: string,
  workspacesConfig: string[] | { packages: string[] }
): Promise<WorkspacePackage[]> {
  const patterns = Array.isArray(workspacesConfig)
    ? workspacesConfig
    : workspacesConfig.packages || [];

  const workspaces: WorkspacePackage[] = [];

  for (const pattern of patterns) {
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
              // Not a package
            }
          }
        }
      } catch {
        // Directory doesn't exist
      }
    } else {
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
        // Not a package
      }
    }
  }

  return workspaces.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse Rust/Cargo project.
 */
export async function parseCargoProject(projectRoot: string): Promise<Result<ProjectInfo, string>> {
  const cargoPath = path.join(projectRoot, "Cargo.toml");

  try {
    const content = await fs.readFile(cargoPath, "utf-8");

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

    const dependencies = parseCargoDependencies(content);

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
 * Parse Cargo dependencies from TOML content.
 */
function parseCargoDependencies(content: string): Dependency[] {
  const dependencies: Dependency[] = [];
  const depPattern = /^([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]+)"|{[^}]*version\s*=\s*"([^"]+)"[^}]*})/gm;

  const depsSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/);
  if (depsSection) {
    for (const match of depsSection[1].matchAll(depPattern)) {
      dependencies.push({
        name: match[1],
        version: match[2] || match[3] || "unknown",
        type: "production",
      });
    }
  }

  const devDepsSection = content.match(/\[dev-dependencies\]([\s\S]*?)(?=\[|$)/);
  if (devDepsSection) {
    for (const match of devDepsSection[1].matchAll(depPattern)) {
      dependencies.push({
        name: match[1],
        version: match[2] || match[3] || "unknown",
        type: "development",
      });
    }
  }

  return dependencies;
}

/**
 * Parse Python project.
 */
export async function parsePythonProject(projectRoot: string): Promise<Result<ProjectInfo, string>> {
  const pyprojectPath = path.join(projectRoot, "pyproject.toml");

  try {
    const content = await fs.readFile(pyprojectPath, "utf-8");

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
      dependencies: [],
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
export async function parseGoProject(projectRoot: string): Promise<Result<ProjectInfo, string>> {
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

    const dependencies = parseGoDependencies(content);

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
 * Parse Go dependencies from go.mod content.
 */
function parseGoDependencies(content: string): Dependency[] {
  const dependencies: Dependency[] = [];
  const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);

  if (requireMatch) {
    for (const match of requireMatch[1].matchAll(/^\s*(\S+)\s+(\S+)/gm)) {
      if (!match[1].startsWith("//")) {
        dependencies.push({
          name: match[1],
          version: match[2],
          type: "production",
        });
      }
    }
  }

  return dependencies;
}
