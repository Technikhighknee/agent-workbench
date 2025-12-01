import { Result, Ok, Err } from "../result.js";
import { Parser, ParseResult } from "../ports/Parser.js";
import { FileSystem } from "../ports/FileSystem.js";
import { SymbolCache } from "../ports/Cache.js";
import { SymbolTree, findByNamePath, toSymbolInfoList, toSymbolInfo } from "../symbolTree.js";
import { SymbolInfo, SymbolContent, EditResult, SymbolKind, Symbol } from "../model.js";

export interface ListSymbolsParams {
  filePath: string;
  depth?: number;
  kinds?: SymbolKind[];
}

export interface ReadSymbolParams {
  filePath: string;
  namePath: string;
  context?: number;
}

export interface EditSymbolParams {
  filePath: string;
  namePath: string;
  newBody: string;
}

export interface EditLinesParams {
  filePath: string;
  startLine: number;
  endLine: number;
  newContent: string;
}

/**
 * Core service for symbol-aware code operations.
 */
export class SyntaxService {
  constructor(
    private readonly parser: Parser,
    private readonly fs: FileSystem,
    private readonly cache: SymbolCache
  ) {}

  /**
   * List all symbols in a file.
   */
  async listSymbols(params: ListSymbolsParams): Promise<Result<SymbolInfo[], string>> {
    const parseResult = await this.parseFile(params.filePath);
    if (!parseResult.ok) {
      return Err(parseResult.error.message);
    }

    let symbols = toSymbolInfoList(parseResult.value.tree);

    // Filter by depth
    if (params.depth !== undefined && params.depth >= 0) {
      symbols = this.filterByDepth(symbols, params.depth);
    }

    // Filter by kinds
    if (params.kinds && params.kinds.length > 0) {
      symbols = this.filterByKinds(symbols, params.kinds);
    }

    return Ok(symbols);
  }

  /**
   * Read a specific symbol's body.
   */
  async readSymbol(params: ReadSymbolParams): Promise<Result<SymbolContent, string>> {
    const parseResult = await this.parseFile(params.filePath);
    if (!parseResult.ok) {
      return Err(parseResult.error.message);
    }

    const symbol = findByNamePath(parseResult.value.tree, params.namePath);
    if (!symbol) {
      return Err(`Symbol not found: ${params.namePath}`);
    }

    // Read the source file
    const sourceResult = this.fs.read(params.filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error.message);
    }

    const source = sourceResult.value;
    const lines = source.split("\n");

    // Calculate line range with optional context
    const context = params.context ?? 0;
    const startLine = Math.max(1, symbol.span.start.line - context);
    const endLine = Math.min(lines.length, symbol.span.end.line + context);

    // Extract the symbol body
    const body = lines.slice(startLine - 1, endLine).join("\n");

    return Ok({
      name: symbol.name,
      namePath: params.namePath,
      kind: symbol.kind,
      body,
      startLine,
      endLine,
    });
  }

  /**
   * Replace a symbol's entire body.
   */
  async editSymbol(params: EditSymbolParams): Promise<Result<EditResult, string>> {
    const parseResult = await this.parseFile(params.filePath);
    if (!parseResult.ok) {
      return Err(parseResult.error.message);
    }

    const symbol = findByNamePath(parseResult.value.tree, params.namePath);
    if (!symbol) {
      return Err(`Symbol not found: ${params.namePath}`);
    }

    // Read the source file
    const sourceResult = this.fs.read(params.filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error.message);
    }

    const source = sourceResult.value;
    const lines = source.split("\n");
    const oldLineCount = lines.length;

    // Replace the symbol's lines
    const startLine = symbol.span.start.line;
    const endLine = symbol.span.end.line;

    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const newLines = params.newBody.split("\n");

    const newSource = [...before, ...newLines, ...after].join("\n");
    const newLineCount = before.length + newLines.length + after.length;

    // Write the file
    const writeResult = this.fs.write(params.filePath, newSource);
    if (!writeResult.ok) {
      return Err(writeResult.error.message);
    }

    // Invalidate cache
    this.cache.invalidate(params.filePath);

    return Ok({
      filePath: params.filePath,
      linesChanged: Math.abs(newLineCount - oldLineCount) + (endLine - startLine + 1),
      oldLineCount,
      newLineCount,
    });
  }

  /**
   * Read a file's raw content.
   */
  readFile(filePath: string): Result<string, Error> {
    if (!this.fs.exists(filePath)) {
      return Err(new Error(`File not found: ${filePath}`));
    }
    return this.fs.read(filePath);
  }

  /**
   * Write raw content to a file.
   */
  writeFile(filePath: string, content: string): Result<void, Error> {
    const result = this.fs.write(filePath, content);
    if (result.ok) {
      this.cache.invalidate(filePath);
    }
    return result;
  }

  /**
   * Replace lines by line number range.
   */
  async editLines(params: EditLinesParams): Promise<Result<EditResult, string>> {
    // Validate line numbers
    if (params.startLine < 1) {
      return Err("startLine must be >= 1");
    }
    if (params.endLine < params.startLine) {
      return Err("endLine must be >= startLine");
    }

    // Read the source file
    const sourceResult = this.fs.read(params.filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error.message);
    }

    const source = sourceResult.value;
    const lines = source.split("\n");
    const oldLineCount = lines.length;

    if (params.startLine > lines.length) {
      return Err(`startLine ${params.startLine} exceeds file length ${lines.length}`);
    }

    // Clamp endLine to file length
    const endLine = Math.min(params.endLine, lines.length);

    // Replace the lines
    const before = lines.slice(0, params.startLine - 1);
    const after = lines.slice(endLine);
    const newLines = params.newContent.split("\n");

    const newSource = [...before, ...newLines, ...after].join("\n");
    const newLineCount = before.length + newLines.length + after.length;

    // Write the file
    const writeResult = this.fs.write(params.filePath, newSource);
    if (!writeResult.ok) {
      return Err(writeResult.error.message);
    }

    // Invalidate cache
    this.cache.invalidate(params.filePath);

    return Ok({
      filePath: params.filePath,
      linesChanged: Math.abs(newLineCount - oldLineCount) + (endLine - params.startLine + 1),
      oldLineCount,
      newLineCount,
    });
  }

  /**
   * Parse a file with caching.
   */
  private async parseFile(filePath: string): Promise<Result<ParseResult, Error>> {
    // Check file exists
    if (!this.fs.exists(filePath)) {
      return Err(new Error(`File not found: ${filePath}`));
    }

    // Get file stats for cache validation
    const statsResult = this.fs.stats(filePath);
    if (!statsResult.ok) {
      return Err(statsResult.error);
    }

    const { mtime } = statsResult.value;

    // Check cache
    const cached = this.cache.get(filePath, mtime);
    if (cached) {
      return Ok({ tree: cached, errors: [] });
    }

    // Read and parse
    const sourceResult = this.fs.read(filePath);
    if (!sourceResult.ok) {
      return Err(sourceResult.error);
    }

    const parseResult = await this.parser.parse(sourceResult.value, filePath);
    if (!parseResult.ok) {
      return parseResult;
    }

    // Cache the result
    this.cache.set(filePath, mtime, parseResult.value.tree);

    return parseResult;
  }

  private filterByDepth(symbols: SymbolInfo[], depth: number): SymbolInfo[] {
    if (depth === 0) {
      return symbols.map((s) => ({ ...s, children: undefined }));
    }

    return symbols.map((s) => ({
      ...s,
      children: s.children ? this.filterByDepth(s.children, depth - 1) : undefined,
    }));
  }

  private filterByKinds(symbols: SymbolInfo[], kinds: SymbolKind[]): SymbolInfo[] {
    return symbols
      .filter((s) => kinds.includes(s.kind))
      .map((s) => ({
        ...s,
        children: s.children ? this.filterByKinds(s.children, kinds) : undefined,
      }));
  }
}
