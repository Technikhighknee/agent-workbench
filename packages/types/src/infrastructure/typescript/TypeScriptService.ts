import ts from "typescript";
import path from "path";
import fs from "fs";

import { Result, Ok, Err } from "@agent-workbench/core";
import type {
  TypeService,
  GetDiagnosticsOptions,
  GetTypeOptions,
  GetDefinitionOptions,
  GetCodeActionsOptions,
} from "../../core/ports/TypeService.js";
import type {
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticCategory,
  DiagnosticSummary,
  TypeInfo,
  Definition,
  CodeAction,
  ProjectInfo,
  SymbolKind,
  RelatedDiagnosticInfo,
  FileEdit,
  TextChange,
} from "../../core/model.js";

/**
 * A single TypeScript project (one tsconfig.json).
 */
interface TypeScriptProject {
  configPath: string;
  rootDir: string;
  service: ts.LanguageService;
  host: TypeScriptLanguageServiceHost;
  fileNames: string[];
}

/**
 * TypeScript language service implementation with multi-project support.
 *
 * Design principles:
 * 1. Multi-project - each tsconfig.json owns its directory
 * 2. Lazy initialization - don't parse until needed
 * 3. Incremental updates - file changes don't rebuild world
 * 4. Error isolation - TS service crashes don't take down server
 * 5. Position fidelity - all positions are 1-indexed for consistency
 */
export class TypeScriptService implements TypeService {
  private projects: Map<string, TypeScriptProject> = new Map();
  private workspaceRoot: string = "";
  private initialized: boolean = false;

  /**
   * Initialize the TypeScript language service for a workspace.
   * Discovers all tsconfig.json files and creates a project for each.
   */
  async initialize(workspacePath: string): Promise<Result<ProjectInfo, Error>> {
    try {
      this.workspaceRoot = path.resolve(workspacePath);
      this.projects.clear();

      // Discover all tsconfig.json files
      const configPaths = this.discoverTsConfigs(this.workspaceRoot);

      if (configPaths.length === 0) {
        return Err(new Error(`No tsconfig.json found in ${workspacePath} or its subdirectories`));
      }

      // Initialize each project
      let totalFiles = 0;
      for (const configPath of configPaths) {
        const projectResult = this.initializeProject(configPath);
        if (projectResult.ok) {
          totalFiles += projectResult.value.fileNames.length;
        }
        // Continue even if some projects fail - partial initialization is fine
      }

      this.initialized = true;

      // Return aggregate info
      const firstProject = this.projects.values().next().value;
      return Ok({
        configPath: configPaths.length === 1
          ? configPaths[0]
          : `${configPaths.length} projects`,
        rootDir: this.workspaceRoot,
        fileCount: totalFiles,
        compilerOptions: firstProject ? {
          target: ts.ScriptTarget[firstProject.host.getCompilationSettings().target ?? ts.ScriptTarget.ES5],
          strict: firstProject.host.getCompilationSettings().strict,
        } : {},
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async reload(): Promise<Result<ProjectInfo, Error>> {
    if (!this.workspaceRoot) {
      return Err(new Error("Service not initialized. Call initialize() first."));
    }
    return this.initialize(this.workspaceRoot);
  }

  isInitialized(): boolean {
    return this.initialized && this.projects.size > 0;
  }

  getProjectInfo(): Result<ProjectInfo, Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    let totalFiles = 0;
    for (const project of this.projects.values()) {
      totalFiles += project.fileNames.length;
    }

    return Ok({
      configPath: `${this.projects.size} project(s)`,
      rootDir: this.workspaceRoot,
      fileCount: totalFiles,
      compilerOptions: {},
    });
  }

  /**
   * Get diagnostics for a file or the entire workspace.
   */
  async getDiagnostics(options?: GetDiagnosticsOptions): Promise<Result<Diagnostic[], Error>> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    try {
      const diagnostics: Diagnostic[] = [];

      if (options?.file) {
        // Single file - find its project
        const project = this.findProjectForFile(options.file);
        if (!project) {
          return Err(new Error(`File not in any TypeScript project: ${options.file}`));
        }
        diagnostics.push(...this.getDiagnosticsForFile(project, options.file, options.errorsOnly));
      } else {
        // All projects
        for (const project of this.projects.values()) {
          for (const file of project.fileNames) {
            diagnostics.push(...this.getDiagnosticsForFile(project, file, options?.errorsOnly));

            if (options?.limit && diagnostics.length >= options.limit) {
              break;
            }
          }
          if (options?.limit && diagnostics.length >= options.limit) {
            break;
          }
        }
      }

      // Sort by file, then line
      diagnostics.sort((a, b) => {
        if (a.file !== b.file) return a.file.localeCompare(b.file);
        return a.line - b.line;
      });

      return Ok(options?.limit ? diagnostics.slice(0, options.limit) : diagnostics);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private getDiagnosticsForFile(
    project: TypeScriptProject,
    file: string,
    errorsOnly?: boolean
  ): Diagnostic[] {
    const resolvedFile = project.host.resolveFile(file);
    if (!project.host.fileExists(resolvedFile)) {
      return [];
    }

    const syntactic = project.service.getSyntacticDiagnostics(resolvedFile);
    const semantic = project.service.getSemanticDiagnostics(resolvedFile);
    const suggestion = project.service.getSuggestionDiagnostics(resolvedFile);

    const allDiags = [
      ...syntactic.map((d) => this.convertDiagnostic(d, "syntactic", project)),
      ...semantic.map((d) => this.convertDiagnostic(d, "semantic", project)),
      ...suggestion.map((d) => this.convertDiagnostic(d, "suggestion", project)),
    ];

    return errorsOnly
      ? allDiags.filter((d) => d.severity === "error")
      : allDiags;
  }

  async getDiagnosticSummary(): Promise<Result<DiagnosticSummary, Error>> {
    const diagsResult = await this.getDiagnostics();
    if (!diagsResult.ok) {
      return diagsResult;
    }

    const diags = diagsResult.value;
    const filesWithDiagnostics = new Set(diags.map((d) => d.file)).size;

    let totalFiles = 0;
    for (const project of this.projects.values()) {
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

  /**
   * Get type information at a position.
   */
  getTypeAtPosition(options: GetTypeOptions): Result<TypeInfo, Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    try {
      const project = this.findProjectForFile(options.file);
      if (!project) {
        return Err(new Error(`File not in any TypeScript project: ${options.file}`));
      }

      const file = project.host.resolveFile(options.file);
      const position = project.host.getPosition(file, options.line, options.column);

      if (position === -1) {
        return Err(new Error(`Invalid position: ${options.line}:${options.column}`));
      }

      const quickInfo = project.service.getQuickInfoAtPosition(file, position);
      if (!quickInfo) {
        return Err(new Error("No type information at position"));
      }

      const typeString = ts.displayPartsToString(quickInfo.displayParts);
      const documentation = ts.displayPartsToString(quickInfo.documentation);
      const tags = quickInfo.tags?.map((tag) => ({
        name: tag.name,
        text: ts.displayPartsToString(tag.text),
      }));

      return Ok({
        type: typeString,
        name: quickInfo.displayParts?.[0]?.text ?? "",
        kind: this.convertSymbolKind(quickInfo.kind),
        documentation: documentation || undefined,
        tags: tags?.length ? tags : undefined,
      });
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get definition locations for a symbol.
   */
  getDefinition(options: GetDefinitionOptions): Result<Definition[], Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    try {
      const project = this.findProjectForFile(options.file);
      if (!project) {
        return Err(new Error(`File not in any TypeScript project: ${options.file}`));
      }

      const file = project.host.resolveFile(options.file);
      const position = project.host.getPosition(file, options.line, options.column);

      if (position === -1) {
        return Err(new Error(`Invalid position: ${options.line}:${options.column}`));
      }

      const definitions = project.service.getDefinitionAtPosition(file, position);
      if (!definitions || definitions.length === 0) {
        return Ok([]);
      }

      return Ok(definitions.map((def) => this.convertDefinition(def, project)));
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Find all references to a symbol.
   */
  findReferences(options: GetDefinitionOptions): Result<Definition[], Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    try {
      const project = this.findProjectForFile(options.file);
      if (!project) {
        return Err(new Error(`File not in any TypeScript project: ${options.file}`));
      }

      const file = project.host.resolveFile(options.file);
      const position = project.host.getPosition(file, options.line, options.column);

      if (position === -1) {
        return Err(new Error(`Invalid position: ${options.line}:${options.column}`));
      }

      const references = project.service.findReferences(file, position);
      if (!references || references.length === 0) {
        return Ok([]);
      }

      const definitions: Definition[] = [];
      for (const refEntry of references) {
        for (const ref of refEntry.references) {
          definitions.push(this.convertReferenceEntry(ref, project));
        }
      }

      return Ok(definitions);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get code actions at a position or for a selection.
   */
  getCodeActions(options: GetCodeActionsOptions): Result<CodeAction[], Error> {
    if (!this.initialized) {
      return Err(new Error("Service not initialized"));
    }

    try {
      const project = this.findProjectForFile(options.file);
      if (!project) {
        return Err(new Error(`File not in any TypeScript project: ${options.file}`));
      }

      const file = project.host.resolveFile(options.file);
      const start = project.host.getPosition(file, options.startLine, options.startColumn);
      const end = project.host.getPosition(file, options.endLine, options.endColumn);

      if (start === -1 || end === -1) {
        return Err(new Error("Invalid position range"));
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

      return Ok(codeActions.map((action) => this.convertCodeAction(action, project)));
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Notify the service that a file has changed.
   */
  notifyFileChanged(file: string, content?: string): void {
    const project = this.findProjectForFile(file);
    if (!project) return;

    const resolvedFile = project.host.resolveFile(file);
    project.host.updateFile(resolvedFile, content);
  }

  dispose(): void {
    for (const project of this.projects.values()) {
      project.service.dispose();
    }
    this.projects.clear();
    this.initialized = false;
  }

  // --- Private helpers ---

  /**
   * Discover all tsconfig.json files in the workspace.
   */
  private discoverTsConfigs(rootPath: string): string[] {
    const configs: string[] = [];

    // Check root first
    const rootConfig = path.join(rootPath, "tsconfig.json");
    if (fs.existsSync(rootConfig)) {
      configs.push(rootConfig);
    }

    // Check common monorepo patterns
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

    const host = new TypeScriptLanguageServiceHost(fileNames, options, rootDir);
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
   * Find which project a file belongs to.
   */
  private findProjectForFile(filePath: string): TypeScriptProject | null {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.workspaceRoot, filePath);

    // Find the project whose rootDir is an ancestor of this file
    let bestMatch: TypeScriptProject | null = null;
    let bestMatchLength = 0;

    for (const project of this.projects.values()) {
      if (absolutePath.startsWith(project.rootDir + path.sep) ||
          absolutePath.startsWith(project.rootDir + "/")) {
        // Prefer the most specific match (longest rootDir)
        if (project.rootDir.length > bestMatchLength) {
          bestMatch = project;
          bestMatchLength = project.rootDir.length;
        }
      }
    }

    return bestMatch;
  }

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

  private convertDiagnostic(
    diag: ts.Diagnostic,
    category: DiagnosticCategory,
    project: TypeScriptProject
  ): Diagnostic {
    const file = diag.file?.fileName ?? "unknown";
    const { line, column, endLine, endColumn } = this.getLineAndColumn(diag);

    return {
      file: project.host.relativePath(file),
      line,
      column,
      endLine,
      endColumn,
      message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
      code: `TS${diag.code}`,
      severity: this.convertSeverity(diag.category),
      category,
      source: "typescript",
      relatedInfo: diag.relatedInformation?.map((info) =>
        this.convertRelatedInfo(info, project)
      ),
    };
  }

  private getLineAndColumn(diag: ts.Diagnostic): {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
  } {
    if (!diag.file || diag.start === undefined) {
      return { line: 1, column: 1, endLine: 1, endColumn: 1 };
    }

    const start = diag.file.getLineAndCharacterOfPosition(diag.start);
    const end = diag.file.getLineAndCharacterOfPosition(
      diag.start + (diag.length ?? 0)
    );

    return {
      line: start.line + 1,
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  private convertSeverity(category: ts.DiagnosticCategory): DiagnosticSeverity {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return "error";
      case ts.DiagnosticCategory.Warning:
        return "warning";
      case ts.DiagnosticCategory.Suggestion:
        return "hint";
      case ts.DiagnosticCategory.Message:
        return "info";
      default:
        return "info";
    }
  }

  private convertRelatedInfo(
    info: ts.DiagnosticRelatedInformation,
    project: TypeScriptProject
  ): RelatedDiagnosticInfo {
    const file = info.file?.fileName ?? "unknown";
    let line = 1, column = 1;

    if (info.file && info.start !== undefined) {
      const pos = info.file.getLineAndCharacterOfPosition(info.start);
      line = pos.line + 1;
      column = pos.character + 1;
    }

    return {
      file: project.host.relativePath(file),
      line,
      column,
      message: ts.flattenDiagnosticMessageText(info.messageText, "\n"),
    };
  }

  private convertSymbolKind(kind: ts.ScriptElementKind): SymbolKind {
    switch (kind) {
      case ts.ScriptElementKind.variableElement:
      case ts.ScriptElementKind.localVariableElement:
      case ts.ScriptElementKind.letElement:
      case ts.ScriptElementKind.constElement:
        return "variable";
      case ts.ScriptElementKind.functionElement:
      case ts.ScriptElementKind.localFunctionElement:
        return "function";
      case ts.ScriptElementKind.classElement:
        return "class";
      case ts.ScriptElementKind.interfaceElement:
        return "interface";
      case ts.ScriptElementKind.typeElement:
        return "type";
      case ts.ScriptElementKind.enumElement:
        return "enum";
      case ts.ScriptElementKind.enumMemberElement:
        return "enum_member";
      case ts.ScriptElementKind.memberVariableElement:
      case ts.ScriptElementKind.memberGetAccessorElement:
      case ts.ScriptElementKind.memberSetAccessorElement:
        return "property";
      case ts.ScriptElementKind.memberFunctionElement:
        return "method";
      case ts.ScriptElementKind.parameterElement:
        return "parameter";
      case ts.ScriptElementKind.typeParameterElement:
        return "type_parameter";
      case ts.ScriptElementKind.moduleElement:
        return "module";
      case ts.ScriptElementKind.keyword:
        return "keyword";
      default:
        return "unknown";
    }
  }

  private convertDefinition(def: ts.DefinitionInfo, project: TypeScriptProject): Definition {
    const { line, column, endLine, endColumn } = this.getDefinitionPosition(def, project);
    const preview = this.getPreview(def, project);

    return {
      // Use absolute path for consistency with other MCP tools
      file: def.fileName,
      line,
      column,
      endLine,
      endColumn,
      name: def.name,
      kind: this.convertSymbolKind(def.kind),
      preview,
      containerName: def.containerName || undefined,
    };
  }

  private convertReferenceEntry(ref: ts.ReferenceEntry, project: TypeScriptProject): Definition {
    const file = ref.fileName;
    const sourceFile = project.host.getSourceFile(file);

    let line = 1, column = 1, endLine = 1, endColumn = 1;
    let name = "";
    let kind: string = "unknown";

    if (sourceFile) {
      const start = sourceFile.getLineAndCharacterOfPosition(ref.textSpan.start);
      const end = sourceFile.getLineAndCharacterOfPosition(
        ref.textSpan.start + ref.textSpan.length
      );
      line = start.line + 1;
      column = start.character + 1;
      endLine = end.line + 1;
      endColumn = end.character + 1;

      // Extract the actual text of the reference
      name = sourceFile.text.slice(ref.textSpan.start, ref.textSpan.start + ref.textSpan.length);

      // Determine the kind based on the reference type
      // ReferenceEntry has isWriteAccess but not isDefinition
      if (ref.isWriteAccess) {
        kind = "variable"; // Write access implies variable assignment
      } else {
        kind = "unknown"; // Read access - could be any reference
      }
    }

    return {
      // Use absolute path for consistency with other MCP tools
      file,
      line,
      column,
      endLine,
      endColumn,
      name,
      kind: kind as SymbolKind,
    };
  }

  private getDefinitionPosition(def: ts.DefinitionInfo, project: TypeScriptProject): {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
  } {
    const sourceFile = project.host.getSourceFile(def.fileName);
    if (!sourceFile) {
      return { line: 1, column: 1, endLine: 1, endColumn: 1 };
    }

    const start = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
    const end = sourceFile.getLineAndCharacterOfPosition(
      def.textSpan.start + def.textSpan.length
    );

    return {
      line: start.line + 1,
      column: start.character + 1,
      endLine: end.line + 1,
      endColumn: end.character + 1,
    };
  }

  private getPreview(def: ts.DefinitionInfo, project: TypeScriptProject): string | undefined {
    const sourceFile = project.host.getSourceFile(def.fileName);
    if (!sourceFile) return undefined;

    const start = sourceFile.getLineAndCharacterOfPosition(def.textSpan.start);
    const lines = sourceFile.text.split("\n");
    const line = lines[start.line];

    return line?.trim().slice(0, 100);
  }

  private convertCodeAction(action: ts.CodeFixAction, project: TypeScriptProject): CodeAction {
    const edits: FileEdit[] = action.changes.map((change) => ({
      file: project.host.relativePath(change.fileName),
      changes: change.textChanges.map((tc) =>
        this.convertTextChange(change.fileName, tc, project)
      ),
    }));

    return {
      title: action.description,
      kind: "quickfix",
      isPreferred: action.fixId !== undefined,
      edits,
    };
  }

  private convertTextChange(
    fileName: string,
    change: ts.TextChange,
    project: TypeScriptProject
  ): TextChange {
    const sourceFile = project.host.getSourceFile(fileName);
    if (!sourceFile) {
      return {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 1 },
        newText: change.newText,
      };
    }

    const start = sourceFile.getLineAndCharacterOfPosition(change.span.start);
    const end = sourceFile.getLineAndCharacterOfPosition(
      change.span.start + change.span.length
    );

    return {
      start: { line: start.line + 1, column: start.character + 1 },
      end: { line: end.line + 1, column: end.character + 1 },
      newText: change.newText,
    };
  }
}

/**
 * TypeScript LanguageServiceHost implementation.
 * Manages file contents and provides them to the language service.
 */
class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {
  private files: Map<string, { version: number; content: string }> = new Map();
  private readonly rootDir: string;

  constructor(
    private readonly fileNames: string[],
    private readonly options: ts.CompilerOptions,
    rootDir: string
  ) {
    this.rootDir = rootDir;

    // Pre-load all project files
    for (const fileName of fileNames) {
      this.ensureFile(fileName);
    }
  }

  getScriptFileNames(): string[] {
    return this.fileNames;
  }

  getScriptVersion(fileName: string): string {
    const file = this.files.get(fileName);
    return file ? file.version.toString() : "0";
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    this.ensureFile(fileName);
    const file = this.files.get(fileName);
    if (!file) return undefined;
    return ts.ScriptSnapshot.fromString(file.content);
  }

  getCurrentDirectory(): string {
    return this.rootDir;
  }

  getCompilationSettings(): ts.CompilerOptions {
    return this.options;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  fileExists(fileName: string): boolean {
    return fs.existsSync(fileName);
  }

  readFile(fileName: string): string | undefined {
    try {
      return fs.readFileSync(fileName, "utf-8");
    } catch {
      return undefined;
    }
  }

  readDirectory(
    path: string,
    extensions?: readonly string[],
    exclude?: readonly string[],
    include?: readonly string[],
    depth?: number
  ): string[] {
    return ts.sys.readDirectory(path, extensions, exclude, include, depth);
  }

  directoryExists(directoryName: string): boolean {
    return ts.sys.directoryExists(directoryName);
  }

  getDirectories(directoryName: string): string[] {
    return ts.sys.getDirectories(directoryName);
  }

  /**
   * Resolve a file path (relative or absolute).
   */
  resolveFile(file: string): string {
    if (path.isAbsolute(file)) {
      return file;
    }
    return path.resolve(this.rootDir, file);
  }

  /**
   * Get relative path from root.
   */
  relativePath(file: string): string {
    return path.relative(this.rootDir, file);
  }

  /**
   * Get position offset from line/column.
   */
  getPosition(file: string, line: number, column: number): number {
    const content = this.files.get(file)?.content;
    if (!content) return -1;

    const lines = content.split("\n");
    if (line < 1 || line > lines.length) return -1;

    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += column - 1;

    return offset;
  }

  /**
   * Update a file's content.
   */
  updateFile(fileName: string, content?: string): void {
    const existing = this.files.get(fileName);
    const newContent = content ?? this.readFile(fileName) ?? "";
    const version = existing ? existing.version + 1 : 1;

    this.files.set(fileName, { version, content: newContent });
  }

  /**
   * Get source file for position calculations.
   */
  getSourceFile(fileName: string): ts.SourceFile | undefined {
    const content = this.files.get(fileName)?.content;
    if (!content) return undefined;

    return ts.createSourceFile(
      fileName,
      content,
      this.options.target ?? ts.ScriptTarget.ES2020,
      true
    );
  }

  private ensureFile(fileName: string): void {
    if (this.files.has(fileName)) return;

    const content = this.readFile(fileName);
    if (content !== undefined) {
      this.files.set(fileName, { version: 1, content });
    }
  }
}
