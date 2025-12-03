/**
 * TypeScript Language Service Implementation.
 *
 * Design principles:
 * 1. Never hang - all operations have timeouts
 * 2. Fast for single files - optimize the common case
 * 3. Lazy loading - don't load files until needed
 * 4. Graceful degradation - return partial results on timeout
 * 5. Position fidelity - all positions are 1-indexed
 */

import ts from "typescript";
import path from "path";

import { type Result, Ok, Err } from "@agent-workbench/core";
import type {
  TypeService,
  GetDiagnosticsOptions,
  GetTypeOptions,
  GetDefinitionOptions,
  GetCodeActionsOptions,
} from "../../core/ports/TypeService.js";
import type {
  Diagnostic,
  DiagnosticSummary,
  TypeInfo,
  Definition,
  CodeAction,
  ProjectInfo,
} from "../../core/model.js";
import { TypeScriptProjectManager, type TypeScriptProject } from "./TypeScriptProjectManager.js";
import {
  convertDiagnostic,
  convertDefinition,
  convertReferenceEntry,
  convertSymbolKind,
  convertCodeAction,
} from "./converters/index.js";

/** Default timeout for operations in milliseconds */
const DEFAULT_TIMEOUT = 10000;

/** Timeout for single-file operations */
const SINGLE_FILE_TIMEOUT = 5000;

/** Max files to check in project-wide diagnostics */
const MAX_FILES_TO_CHECK = 500;

export class TypeScriptService implements TypeService {
  private projectManager = new TypeScriptProjectManager();
  private initialized = false;

  /**
   * Run an operation with a timeout.
   */
  private async withTimeout<T>(
    operation: () => T | Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<Result<T, Error>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(Err(new Error(`${operationName} timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      try {
        const result = operation();
        if (result instanceof Promise) {
          result
            .then((value) => {
              clearTimeout(timer);
              resolve(Ok(value));
            })
            .catch((error) => {
              clearTimeout(timer);
              resolve(Err(error instanceof Error ? error : new Error(String(error))));
            });
        } else {
          clearTimeout(timer);
          resolve(Ok(result));
        }
      } catch (error) {
        clearTimeout(timer);
        resolve(Err(error instanceof Error ? error : new Error(String(error))));
      }
    });
  }

  async initialize(workspacePath: string): Promise<Result<ProjectInfo, Error>> {
    const result = this.projectManager.initialize(workspacePath);
    if (!result.ok) {
      return result;
    }

    this.initialized = true;
    const projects = this.projectManager.getProjects();
    const firstProject = projects.values().next().value;

    return Ok({
      configPath: projects.size === 1
        ? firstProject?.configPath ?? "unknown"
        : `${projects.size} projects`,
      rootDir: this.projectManager.getWorkspaceRoot(),
      fileCount: result.value,
      compilerOptions: firstProject ? {
        target: ts.ScriptTarget[firstProject.host.getCompilationSettings().target ?? ts.ScriptTarget.ES5],
        strict: firstProject.host.getCompilationSettings().strict,
      } : {},
    });
  }

  async reload(): Promise<Result<ProjectInfo, Error>> {
    const root = this.projectManager.getWorkspaceRoot();
    if (!root) {
      return Err(new Error("Service not initialized"));
    }
    return this.initialize(root);
  }

  isInitialized(): boolean {
    return this.initialized && this.projectManager.getProjects().size > 0;
  }

  getProjectInfo(): Result<ProjectInfo, Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    let totalFiles = 0;
    for (const project of this.projectManager.getProjects().values()) {
      totalFiles += project.fileNames.length;
    }

    return Ok({
      configPath: `${this.projectManager.getProjects().size} project(s)`,
      rootDir: this.projectManager.getWorkspaceRoot(),
      fileCount: totalFiles,
      compilerOptions: {},
    });
  }

  async getDiagnostics(options?: GetDiagnosticsOptions): Promise<Result<Diagnostic[], Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    if (options?.file) {
      return this.getDiagnosticsForSingleFile(options.file, options.errorsOnly);
    }

    return this.getDiagnosticsForWorkspace(options?.limit, options?.errorsOnly);
  }

  private async getDiagnosticsForSingleFile(
    file: string,
    errorsOnly?: boolean
  ): Promise<Result<Diagnostic[], Error>> {
    const project = this.projectManager.findProjectForFile(file);
    if (!project) {
      return Err(new Error(`File not in any TypeScript project: ${file}`));
    }

    return this.withTimeout(
      () => this.getDiagnosticsForFile(project, file, errorsOnly),
      SINGLE_FILE_TIMEOUT,
      `getDiagnostics(${path.basename(file)})`
    );
  }

  private async getDiagnosticsForWorkspace(
    limit?: number,
    errorsOnly?: boolean
  ): Promise<Result<Diagnostic[], Error>> {
    const startTime = Date.now();
    const maxFiles = limit
      ? Math.min(limit * 2, MAX_FILES_TO_CHECK)
      : MAX_FILES_TO_CHECK;

    const diagnostics: Diagnostic[] = [];
    let filesChecked = 0;

    try {
      for (const project of this.projectManager.getProjects().values()) {
        for (const file of project.fileNames) {
          if (Date.now() - startTime > DEFAULT_TIMEOUT) {
            break;
          }

          if (filesChecked >= maxFiles) {
            break;
          }

          if (file.includes("node_modules") || file.includes("/dist/") || file.includes("/.")) {
            continue;
          }

          try {
            const fileDiags = this.getDiagnosticsForFile(project, file, errorsOnly);
            diagnostics.push(...fileDiags);
            filesChecked++;

            if (limit && diagnostics.length >= limit) {
              break;
            }
          } catch {
            filesChecked++;
          }
        }

        if (limit && diagnostics.length >= limit) {
          break;
        }
      }

      diagnostics.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
      });

      return Ok(limit ? diagnostics.slice(0, limit) : diagnostics);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getDiagnosticsForFile(
    project: TypeScriptProject,
    file: string,
    errorsOnly?: boolean
  ): Diagnostic[] {
    try {
      const resolvedFile = project.host.resolveFile(file);
      if (!project.host.fileExists(resolvedFile)) {
        return [];
      }

      const syntactic = project.service.getSyntacticDiagnostics(resolvedFile);
      const semantic = project.service.getSemanticDiagnostics(resolvedFile);

      const ctx = { host: project.host };
      const allDiags = [
        ...syntactic.map((d) => convertDiagnostic(d, "syntactic", ctx)),
        ...semantic.map((d) => convertDiagnostic(d, "semantic", ctx)),
      ];

      return errorsOnly
        ? allDiags.filter((d) => d.severity === "error")
        : allDiags;
    } catch {
      return [];
    }
  }

  async getDiagnosticSummary(): Promise<Result<DiagnosticSummary, Error>> {
    const diagsResult = await this.getDiagnostics({ limit: 1000 });
    if (!diagsResult.ok) {
      return diagsResult;
    }

    const diags = diagsResult.value;
    const filesWithDiagnostics = new Set(diags.map((d) => d.file)).size;

    let totalFiles = 0;
    for (const project of this.projectManager.getProjects().values()) {
      totalFiles += project.fileNames.length;
    }

    return Ok({
      errorCount: diags.filter((d) => d.severity === "error").length,
      warningCount: diags.filter((d) => d.severity === "warning").length,
      infoCount: diags.filter((d) => d.severity === "info").length,
      hintCount: diags.filter((d) => d.severity === "hint").length,
      filesWithDiagnostics,
      totalFiles,
    });
  }

  async getTypeAtPosition(options: GetTypeOptions): Promise<Result<TypeInfo, Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    return this.withTimeout(
      () => this.getTypeAtPositionSync(options),
      SINGLE_FILE_TIMEOUT,
      `getTypeAtPosition(${path.basename(options.file)})`
    );
  }

  private getTypeAtPositionSync(options: GetTypeOptions): TypeInfo {
    const project = this.projectManager.findProjectForFile(options.file);
    if (!project) {
      throw new Error(`File not in any TypeScript project: ${options.file}`);
    }

    const file = project.host.resolveFile(options.file);
    const position = project.host.getPosition(file, options.line, options.column);

    if (position === -1) {
      throw new Error(`Invalid position: ${options.line}:${options.column}`);
    }

    const quickInfo = project.service.getQuickInfoAtPosition(file, position);
    if (!quickInfo) {
      throw new Error("No type information at position");
    }

    const typeString = ts.displayPartsToString(quickInfo.displayParts);
    const documentation = ts.displayPartsToString(quickInfo.documentation);
    const tags = quickInfo.tags?.map((tag) => ({
      name: tag.name,
      text: ts.displayPartsToString(tag.text),
    }));

    return {
      type: typeString,
      name: quickInfo.displayParts?.[0]?.text ?? "",
      kind: convertSymbolKind(quickInfo.kind),
      documentation: documentation || undefined,
      tags: tags?.length ? tags : undefined,
    };
  }

  async getDefinition(options: GetDefinitionOptions): Promise<Result<Definition[], Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    return this.withTimeout(
      () => this.getDefinitionSync(options),
      SINGLE_FILE_TIMEOUT,
      `getDefinition(${path.basename(options.file)})`
    );
  }

  private getDefinitionSync(options: GetDefinitionOptions): Definition[] {
    const project = this.projectManager.findProjectForFile(options.file);
    if (!project) {
      throw new Error(`File not in any TypeScript project: ${options.file}`);
    }

    const file = project.host.resolveFile(options.file);
    const position = project.host.getPosition(file, options.line, options.column);

    if (position === -1) {
      throw new Error(`Invalid position: ${options.line}:${options.column}`);
    }

    const definitions = project.service.getDefinitionAtPosition(file, position);
    if (!definitions || definitions.length === 0) {
      return [];
    }

    const ctx = { host: project.host };
    return definitions.map((def) => convertDefinition(def, ctx));
  }

  async findReferences(options: GetDefinitionOptions): Promise<Result<Definition[], Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    return this.withTimeout(
      () => this.findReferencesSync(options),
      DEFAULT_TIMEOUT,
      `findReferences(${path.basename(options.file)})`
    );
  }

  private findReferencesSync(options: GetDefinitionOptions): Definition[] {
    const project = this.projectManager.findProjectForFile(options.file);
    if (!project) {
      throw new Error(`File not in any TypeScript project: ${options.file}`);
    }

    const file = project.host.resolveFile(options.file);
    const position = project.host.getPosition(file, options.line, options.column);

    if (position === -1) {
      throw new Error(`Invalid position: ${options.line}:${options.column}`);
    }

    const references = project.service.findReferences(file, position);
    if (!references || references.length === 0) {
      return [];
    }

    const ctx = { host: project.host };
    const definitions: Definition[] = [];
    for (const refEntry of references) {
      for (const ref of refEntry.references) {
        definitions.push(convertReferenceEntry(ref, ctx));
      }
    }

    return definitions;
  }

  async getCodeActions(options: GetCodeActionsOptions): Promise<Result<CodeAction[], Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    return this.withTimeout(
      () => this.getCodeActionsSync(options),
      SINGLE_FILE_TIMEOUT,
      `getCodeActions(${path.basename(options.file)})`
    );
  }

  private getCodeActionsSync(options: GetCodeActionsOptions): CodeAction[] {
    const project = this.projectManager.findProjectForFile(options.file);
    if (!project) {
      throw new Error(`File not in any TypeScript project: ${options.file}`);
    }

    const file = project.host.resolveFile(options.file);
    const start = project.host.getPosition(file, options.startLine, options.startColumn);
    const end = project.host.getPosition(file, options.endLine, options.endColumn);

    if (start === -1 || end === -1) {
      throw new Error("Invalid position range");
    }

    const diagnostics = project.service.getSemanticDiagnostics(file)
      .filter((d) => {
        if (d.start === undefined) return false;
        const dEnd = d.start + (d.length ?? 0);
        return d.start <= end && dEnd >= start;
      });

    const errorCodes = options.diagnosticCodes
      ? options.diagnosticCodes.map((c) => parseInt(c.replace(/\D/g, "")))
      : diagnostics.map((d) => d.code as number);

    const codeActions = project.service.getCodeFixesAtPosition(
      file,
      start,
      end,
      errorCodes,
      {},
      {}
    );

    const ctx = { host: project.host };
    return codeActions.map((action) => convertCodeAction(action, ctx));
  }

  notifyFileChanged(file: string, content?: string): void {
    const project = this.projectManager.findProjectForFile(file);
    if (!project) return;

    const resolvedFile = project.host.resolveFile(file);
    project.host.updateFile(resolvedFile, content);
  }

  dispose(): void {
    this.projectManager.dispose();
    this.initialized = false;
  }
}
