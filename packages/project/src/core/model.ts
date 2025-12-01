/**
 * Core domain types for the project package.
 */

/**
 * Type of project based on package manager / build tool.
 */
export type ProjectType =
  | "npm"      // Node.js with package.json
  | "cargo"    // Rust with Cargo.toml
  | "python"   // Python with pyproject.toml or setup.py
  | "go"       // Go with go.mod
  | "unknown";

/**
 * A dependency in the project.
 */
export interface Dependency {
  name: string;
  version: string;
  type: "production" | "development" | "peer" | "optional";
}

/**
 * An available script/command.
 */
export interface Script {
  name: string;
  command: string;
}

/**
 * Basic project information.
 */
export interface ProjectInfo {
  /** Project name */
  name: string;
  /** Project version */
  version: string;
  /** Project type (npm, cargo, etc.) */
  type: ProjectType;
  /** Project description */
  description?: string;
  /** Entry point / main file */
  main?: string;
  /** Root directory */
  rootPath: string;
  /** Available scripts */
  scripts: Script[];
  /** Dependencies */
  dependencies: Dependency[];
  /** Workspace packages (for monorepos) */
  workspaces?: WorkspacePackage[];
}

/**
 * A package in a monorepo workspace.
 */
export interface WorkspacePackage {
  /** Package name */
  name: string;
  /** Path relative to root */
  path: string;
  /** Package version */
  version?: string;
}

/**
 * A configuration file found in the project.
 */
export interface ConfigFile {
  /** File name */
  name: string;
  /** Full path */
  path: string;
  /** Type of config (typescript, eslint, prettier, etc.) */
  type: ConfigType;
}

/**
 * Known configuration file types.
 */
export type ConfigType =
  | "npm"
  | "typescript"
  | "eslint"
  | "prettier"
  | "jest"
  | "vitest"
  | "babel"
  | "webpack"
  | "vite"
  | "rollup"
  | "docker"
  | "github"
  | "gitlab"
  | "editor"
  | "git"
  | "node"
  | "monorepo"
  | "linter"
  | "env"
  | "other";

// Re-export Result utilities from core
export { Result, ok, err } from "@agent-workbench/core";
