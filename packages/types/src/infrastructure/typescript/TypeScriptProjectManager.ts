/**
 * TypeScript Project Manager.
 * Handles discovery, initialization, and management of TypeScript projects.
 */

import ts from "typescript";
import path from "path";
import fs from "fs";

import { type Result, Ok, Err } from "@agent-workbench/core";
import { TypeScriptLanguageServiceHost } from "./TypeScriptLanguageServiceHost.js";

/**
 * A single TypeScript project (one tsconfig.json).
 */
export interface TypeScriptProject {
  configPath: string;
  rootDir: string;
  service: ts.LanguageService;
  host: TypeScriptLanguageServiceHost;
  fileNames: string[];
}

/**
 * Discovers and manages TypeScript projects in a workspace.
 */
export class TypeScriptProjectManager {
  private projects: Map<string, TypeScriptProject> = new Map();
  private workspaceRoot: string = "";

  /**
   * Get all projects.
   */
  getProjects(): Map<string, TypeScriptProject> {
    return this.projects;
  }

  /**
   * Get workspace root.
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Initialize all TypeScript projects in a workspace.
   */
  initialize(workspacePath: string): Result<number, Error> {
    this.workspaceRoot = path.resolve(workspacePath);
    this.projects.clear();

    const configPaths = this.discoverTsConfigs(this.workspaceRoot);

    if (configPaths.length === 0) {
      return Err(new Error(`No tsconfig.json found in ${workspacePath}`));
    }

    let totalFiles = 0;
    for (const configPath of configPaths) {
      const projectResult = this.initializeProject(configPath);
      if (projectResult.ok) {
        totalFiles += projectResult.value.fileNames.length;
      }
    }

    return Ok(totalFiles);
  }

  /**
   * Find which project a file belongs to.
   */
  findProjectForFile(filePath: string): TypeScriptProject | null {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workspaceRoot, filePath);

    let bestMatch: TypeScriptProject | null = null;
    let bestMatchLength = 0;

    for (const project of this.projects.values()) {
      if (
        absolutePath.startsWith(project.rootDir + path.sep) ||
        absolutePath.startsWith(project.rootDir + "/")
      ) {
        if (project.rootDir.length > bestMatchLength) {
          bestMatch = project;
          bestMatchLength = project.rootDir.length;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Dispose all projects.
   */
  dispose(): void {
    for (const project of this.projects.values()) {
      project.service.dispose();
    }
    this.projects.clear();
  }

  /**
   * Discover all tsconfig.json files in the workspace.
   */
  private discoverTsConfigs(rootPath: string): string[] {
    const configs: string[] = [];

    const rootConfig = path.join(rootPath, "tsconfig.json");
    if (fs.existsSync(rootConfig)) {
      configs.push(rootConfig);
    }

    const patterns = [
      "packages/*/tsconfig.json",
      "apps/*/tsconfig.json",
      "libs/*/tsconfig.json",
      "src/*/tsconfig.json",
    ];

    for (const pattern of patterns) {
      const parts = pattern.split("/");
      const baseDir = path.join(rootPath, parts[0]);

      if (fs.existsSync(baseDir) && fs.statSync(baseDir).isDirectory()) {
        try {
          const subdirs = fs.readdirSync(baseDir);
          for (const subdir of subdirs) {
            const configPath = path.join(baseDir, subdir, "tsconfig.json");
            if (fs.existsSync(configPath)) {
              configs.push(configPath);
            }
          }
        } catch {
          // Ignore errors reading directories
        }
      }
    }

    return configs;
  }

  /**
   * Initialize a single TypeScript project.
   */
  private initializeProject(configPath: string): Result<TypeScriptProject, Error> {
    const configResult = this.parseConfig(configPath);
    if (!configResult.ok) {
      return configResult;
    }

    const { options, fileNames } = configResult.value;
    const rootDir = path.dirname(configPath);

    const host = new TypeScriptLanguageServiceHost(fileNames, options, rootDir, false);
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());

    const project: TypeScriptProject = {
      configPath,
      rootDir,
      service,
      host,
      fileNames,
    };

    this.projects.set(rootDir, project);
    return Ok(project);
  }

  /**
   * Parse a tsconfig.json file.
   */
  private parseConfig(configPath: string): Result<ts.ParsedCommandLine, Error> {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      return Err(new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")));
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    if (parsed.errors.length > 0) {
      const messages = parsed.errors
        .map((e) => ts.flattenDiagnosticMessageText(e.messageText, "\n"))
        .join("\n");
      return Err(new Error(messages));
    }

    return Ok(parsed);
  }
}
