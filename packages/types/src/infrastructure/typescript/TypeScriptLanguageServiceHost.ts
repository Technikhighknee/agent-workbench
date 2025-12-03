import ts from "typescript";
import path from "path";
import fs from "fs";

/**
 * TypeScript LanguageServiceHost implementation.
 * Manages file contents and provides them to the language service.
 *
 * With lazy=true, files are loaded on-demand instead of upfront.
 */
export class TypeScriptLanguageServiceHost implements ts.LanguageServiceHost {
  private files: Map<string, { version: number; content: string }> = new Map();
  private readonly rootDir: string;

  constructor(
    private readonly fileNames: string[],
    private readonly options: ts.CompilerOptions,
    rootDir: string,
    preload: boolean = true
  ) {
    this.rootDir = rootDir;

    // Only pre-load if requested (for backwards compatibility)
    if (preload) {
      for (const fileName of fileNames) {
        this.ensureFile(fileName);
      }
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
    this.ensureFile(file);
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
    this.ensureFile(fileName);
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
