/**
 * TypeChecker - A simple, fast, single-file-focused TypeScript checker.
 *
 * Design principles:
 * 1. Single file focus - optimize for checking ONE file at a time
 * 2. Lazy loading - find projects on-demand, not upfront
 * 3. Hard timeouts - never hang, fail fast
 * 4. No state - don't cache anything that could get stale
 */

import ts from "typescript";
import path from "path";
import fs from "fs";

// ============================================================================
// Types
// ============================================================================

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  code: string;
  severity: "error" | "warning" | "info" | "hint";
}

export interface TypeInfo {
  type: string;
  name: string;
  kind: string;
  documentation?: string;
}

export interface Definition {
  file: string;
  line: number;
  column: number;
  name: string;
  kind: string;
  preview?: string;
}

export interface QuickFix {
  title: string;
  edits: Array<{
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    newText: string;
  }>;
}

// ============================================================================
// Timeout utility
// ============================================================================

function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============================================================================
// TypeChecker
// ============================================================================

export class TypeChecker {
  private static readonly TIMEOUT = 5000; // 5 seconds max for any operation

  /**
   * Check a single file for type errors.
   * This is the primary operation - fast and focused.
   */
  async checkFile(filePath: string): Promise<Diagnostic[]> {
    return withTimeout(
      this.checkFileImpl(filePath),
      TypeChecker.TIMEOUT,
      `checkFile(${path.basename(filePath)})`
    );
  }

  private async checkFileImpl(filePath: string): Promise<Diagnostic[]> {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    // Find tsconfig.json
    const configPath = this.findTsConfig(absolutePath);
    if (!configPath) {
      throw new Error(`No tsconfig.json found for: ${absolutePath}`);
    }

    // Parse config
    const config = this.parseConfig(configPath);

    // Create program for this file
    const program = ts.createProgram([absolutePath], config.options);
    const sourceFile = program.getSourceFile(absolutePath);

    if (!sourceFile) {
      throw new Error(`Could not load source file: ${absolutePath}`);
    }

    // Get diagnostics for this file only
    const diagnostics: ts.Diagnostic[] = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];

    return diagnostics.map((d) => this.convertDiagnostic(d, configPath));
  }

  /**
   * Get type information at a position.
   */
  async getType(filePath: string, line: number, column: number): Promise<TypeInfo> {
    return withTimeout(
      this.getTypeImpl(filePath, line, column),
      TypeChecker.TIMEOUT,
      `getType(${path.basename(filePath)}:${line}:${column})`
    );
  }

  private async getTypeImpl(filePath: string, line: number, column: number): Promise<TypeInfo> {
    const absolutePath = path.resolve(filePath);
    const configPath = this.findTsConfig(absolutePath);

    if (!configPath) {
      throw new Error(`No tsconfig.json found for: ${absolutePath}`);
    }

    const { service, cleanup } = this.createLanguageService(absolutePath, configPath);

    try {
      const position = this.getPosition(absolutePath, line, column);
      const quickInfo = service.getQuickInfoAtPosition(absolutePath, position);

      if (!quickInfo) {
        throw new Error(`No type information at ${line}:${column}`);
      }

      return {
        type: ts.displayPartsToString(quickInfo.displayParts),
        name: quickInfo.displayParts?.[0]?.text ?? "",
        kind: quickInfo.kind,
        documentation: ts.displayPartsToString(quickInfo.documentation) || undefined,
      };
    } finally {
      cleanup();
    }
  }

  /**
   * Go to definition.
   */
  async getDefinition(filePath: string, line: number, column: number): Promise<Definition[]> {
    return withTimeout(
      this.getDefinitionImpl(filePath, line, column),
      TypeChecker.TIMEOUT,
      `getDefinition(${path.basename(filePath)}:${line}:${column})`
    );
  }

  private async getDefinitionImpl(filePath: string, line: number, column: number): Promise<Definition[]> {
    const absolutePath = path.resolve(filePath);
    const configPath = this.findTsConfig(absolutePath);

    if (!configPath) {
      throw new Error(`No tsconfig.json found for: ${absolutePath}`);
    }

    const { service, cleanup } = this.createLanguageService(absolutePath, configPath);

    try {
      const position = this.getPosition(absolutePath, line, column);
      const definitions = service.getDefinitionAtPosition(absolutePath, position);

      if (!definitions || definitions.length === 0) {
        return [];
      }

      return definitions.map((def) => ({
        file: def.fileName,
        line: this.getLineNumber(def.fileName, def.textSpan.start),
        column: this.getColumnNumber(def.fileName, def.textSpan.start),
        name: def.name,
        kind: def.kind,
        preview: this.getPreview(def.fileName, def.textSpan.start),
      }));
    } finally {
      cleanup();
    }
  }

  /**
   * Get quick fixes for errors at a position.
   */
  async getQuickFixes(filePath: string, line: number, column: number): Promise<QuickFix[]> {
    return withTimeout(
      this.getQuickFixesImpl(filePath, line, column),
      TypeChecker.TIMEOUT,
      `getQuickFixes(${path.basename(filePath)}:${line}:${column})`
    );
  }

  private async getQuickFixesImpl(filePath: string, line: number, column: number): Promise<QuickFix[]> {
    const absolutePath = path.resolve(filePath);
    const configPath = this.findTsConfig(absolutePath);

    if (!configPath) {
      throw new Error(`No tsconfig.json found for: ${absolutePath}`);
    }

    const { service, cleanup } = this.createLanguageService(absolutePath, configPath);

    try {
      const position = this.getPosition(absolutePath, line, column);

      // Get diagnostics at this position to find error codes
      const diagnostics = service.getSemanticDiagnostics(absolutePath);
      const errorCodes = diagnostics
        .filter((d) => d.start !== undefined && d.start <= position && position <= d.start + (d.length ?? 0))
        .map((d) => d.code as number);

      if (errorCodes.length === 0) {
        return [];
      }

      const fixes = service.getCodeFixesAtPosition(
        absolutePath,
        position,
        position,
        errorCodes,
        {},
        {}
      );

      return fixes.map((fix) => ({
        title: fix.description,
        edits: fix.changes.flatMap((change) =>
          change.textChanges.map((tc) => ({
            file: change.fileName,
            startLine: this.getLineNumber(change.fileName, tc.span.start),
            startColumn: this.getColumnNumber(change.fileName, tc.span.start),
            endLine: this.getLineNumber(change.fileName, tc.span.start + tc.span.length),
            endColumn: this.getColumnNumber(change.fileName, tc.span.start + tc.span.length),
            newText: tc.newText,
          }))
        ),
      }));
    } finally {
      cleanup();
    }
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private findTsConfig(filePath: string): string | null {
    let dir = path.dirname(filePath);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const configPath = path.join(dir, "tsconfig.json");
      if (fs.existsSync(configPath)) {
        return configPath;
      }
      dir = path.dirname(dir);
    }

    return null;
  }

  private parseConfig(configPath: string): ts.ParsedCommandLine {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath)
    );

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors.map((e) =>
        ts.flattenDiagnosticMessageText(e.messageText, "\n")
      ).join("\n"));
    }

    return parsed;
  }

  private createLanguageService(
    targetFile: string,
    configPath: string
  ): { service: ts.LanguageService; cleanup: () => void } {
    const config = this.parseConfig(configPath);
    const rootDir = path.dirname(configPath);

    // Only include the target file and its dependencies will be loaded on-demand
    const fileNames = [targetFile];
    const files = new Map<string, string>();

    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => fileNames,
      getScriptVersion: () => "1",
      getScriptSnapshot: (fileName) => {
        let content = files.get(fileName);
        if (!content) {
          try {
            content = fs.readFileSync(fileName, "utf-8");
            files.set(fileName, content);
          } catch {
            return undefined;
          }
        }
        return ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => rootDir,
      getCompilationSettings: () => config.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    const service = ts.createLanguageService(host, ts.createDocumentRegistry());

    return {
      service,
      cleanup: () => {
        service.dispose();
        files.clear();
      },
    };
  }

  private getPosition(filePath: string, line: number, column: number): number {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    if (line < 1 || line > lines.length) {
      throw new Error(`Invalid line number: ${line}`);
    }

    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += lines[i].length + 1;
    }
    offset += column - 1;

    return offset;
  }

  private getLineNumber(filePath: string, offset: number): number {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const before = content.slice(0, offset);
      return before.split("\n").length;
    } catch {
      return 1;
    }
  }

  private getColumnNumber(filePath: string, offset: number): number {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const before = content.slice(0, offset);
      const lastNewline = before.lastIndexOf("\n");
      return offset - lastNewline;
    } catch {
      return 1;
    }
  }

  private getPreview(filePath: string, offset: number): string | undefined {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const lineNum = this.getLineNumber(filePath, offset) - 1;
      return lines[lineNum]?.trim().slice(0, 100);
    } catch {
      return undefined;
    }
  }

  private convertDiagnostic(diag: ts.Diagnostic, configPath: string): Diagnostic {
    const file = diag.file?.fileName ?? "unknown";
    const rootDir = path.dirname(configPath);

    let line = 1, column = 1, endLine = 1, endColumn = 1;
    if (diag.file && diag.start !== undefined) {
      const start = diag.file.getLineAndCharacterOfPosition(diag.start);
      const end = diag.file.getLineAndCharacterOfPosition(diag.start + (diag.length ?? 0));
      line = start.line + 1;
      column = start.character + 1;
      endLine = end.line + 1;
      endColumn = end.character + 1;
    }

    return {
      file: path.relative(rootDir, file),
      line,
      column,
      endLine,
      endColumn,
      message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
      code: `TS${diag.code}`,
      severity: this.convertSeverity(diag.category),
    };
  }

  private convertSeverity(category: ts.DiagnosticCategory): Diagnostic["severity"] {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return "error";
      case ts.DiagnosticCategory.Warning:
        return "warning";
      case ts.DiagnosticCategory.Suggestion:
        return "hint";
      default:
        return "info";
    }
  }
}
