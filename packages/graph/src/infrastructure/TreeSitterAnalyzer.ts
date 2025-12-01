/**
 * Tree-sitter based analyzer - replaces regex-based TypeScriptAnalyzer.
 * Uses the @agent-workbench/syntax package for proper AST parsing.
 * Supports multiple languages: TypeScript, JavaScript, Python, Go, Rust.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
import {
  TreeSitterParser,
  Symbol as SyntaxSymbol,
  SymbolKind as SyntaxSymbolKind,
  CallInfo,
} from "@agent-workbench/syntax";
import { isOk } from "@agent-workbench/core";
import { GraphNode, GraphEdge, SymbolKind } from "../core/model.js";

interface ExtractedSymbol {
  node: GraphNode;
  calls: { target: string; line: number; column: number; confidence: number }[];
}

/**
 * Maps syntax package SymbolKind to graph package SymbolKind.
 */
function mapSymbolKind(kind: SyntaxSymbolKind): SymbolKind {
  const kindMap: Record<string, SymbolKind> = {
    file: "module",
    class: "class",
    interface: "interface",
    function: "function",
    method: "method",
    property: "property",
    variable: "variable",
    constant: "constant",
    enum: "enum",
    enum_member: "constant",
    type_alias: "type",
    namespace: "namespace",
    module: "module",
    constructor: "constructor",
    field: "property",
    parameter: "parameter",
    import: "module",
  };
  return kindMap[kind] || "variable";
}

/**
 * Infer semantic tags from symbol name and source code.
 */
function inferTags(name: string, source: string): string[] {
  const tags: string[] = [];

  // Name-based tags
  if (/^handle/i.test(name)) tags.push("handler");
  if (/^on[A-Z]/i.test(name)) tags.push("handler", "event");
  if (/^get/i.test(name)) tags.push("getter");
  if (/^set/i.test(name)) tags.push("setter");
  if (/^is|^has|^can/i.test(name)) tags.push("predicate");
  if (/^create|^make|^build/i.test(name)) tags.push("factory");
  if (/^parse|^transform|^convert/i.test(name)) tags.push("transformer");
  if (/^validate|^check|^verify/i.test(name)) tags.push("validation");
  if (/^fetch|^load|^get.*Data/i.test(name)) tags.push("data-fetching");
  if (/^save|^store|^persist/i.test(name)) tags.push("persistence");
  if (/^render|^display|^show/i.test(name)) tags.push("ui");
  if (/test|spec/i.test(name)) tags.push("test");

  // Content-based tags
  if (/\bawait\b/.test(source)) tags.push("async");
  if (/\bfetch\(/.test(source)) tags.push("http", "async");
  if (/\bfs\.|readFile|writeFile/.test(source)) tags.push("filesystem");
  if (/\bconsole\./.test(source)) tags.push("logging");
  if (/\bthrow\s+new/.test(source)) tags.push("throws");
  if (/\btry\s*{/.test(source)) tags.push("error-handling");
  if (/\bPromise\./.test(source)) tags.push("async");

  // SQL detection
  if (
    /\bSELECT\b.*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b.*\bSET\b|\bDELETE\s+FROM\b/i.test(
      source
    )
  ) {
    tags.push("database", "sql");
  }

  // Database library detection
  if (
    /\b(prisma|sequelize|knex|pg|mysql|sqlite|typeorm|drizzle)\b/i.test(source)
  ) {
    tags.push("database");
  }

  return [...new Set(tags)];
}

export class TreeSitterAnalyzer {
  private parser: TreeSitterParser;
  private idCounter = 0;

  constructor() {
    this.parser = new TreeSitterParser();
  }

  generateId(): string {
    return `node_${++this.idCounter}`;
  }

  generateEdgeId(): string {
    return `edge_${++this.idCounter}`;
  }

  computeFileHash(filePath: string): string {
    const content = readFileSync(filePath, "utf-8");
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  }

  /**
   * Check if this analyzer supports the given file type.
   */
  supportsFile(filePath: string): boolean {
    const lang = this.parser.detectLanguage(filePath);
    return !!lang;
  }

  /**
   * Analyze a source file and extract graph nodes and edges.
   */
  async analyze(
    filePath: string
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const content = readFileSync(filePath, "utf-8");

    // Parse the file
    const parseResult = await this.parser.parse(content, filePath);
    if (!isOk(parseResult)) {
      // Return empty result on parse failure
      return { nodes: [], edges: [] };
    }

    // Extract calls
    const callsResult = await this.parser.extractCalls(content, filePath);
    const calls: CallInfo[] = isOk(callsResult) ? callsResult.value : [];

    // Build graph from parsed symbols
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const symbols = parseResult.value.tree.symbols;

    // Process symbols recursively
    this.processSymbols(symbols, filePath, content, nodes, edges, calls);

    return { nodes, edges };
  }

  /**
   * Process symbols recursively, creating nodes and edges.
   */
  private processSymbols(
    symbols: SyntaxSymbol[],
    filePath: string,
    content: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
    allCalls: CallInfo[],
    parentName?: string
  ): void {
    for (const symbol of symbols) {
      // Skip import symbols - they're not relevant for the graph
      if (symbol.kind === "import") continue;

      // Extract source for this symbol
      const source = content.slice(
        symbol.span.start.offset,
        symbol.span.end.offset
      );

      const qualifiedName = parentName
        ? `${parentName}.${symbol.name}`
        : symbol.name;

      // Determine if async from source content
      const isAsync = /\basync\b/.test(source.slice(0, 100)); // Check first 100 chars

      // Determine if exported
      const isExported =
        /^export\s/.test(source) ||
        (parentName === undefined &&
          content.includes(`export ${symbol.kind} ${symbol.name}`));

      // Determine if static (for methods)
      const isStatic = /\bstatic\b/.test(source.slice(0, 50));

      const node: GraphNode = {
        id: this.generateId(),
        kind: mapSymbolKind(symbol.kind),
        name: symbol.name,
        qualifiedName,
        file: filePath,
        line: symbol.span.start.line,
        column: symbol.span.start.column,
        endLine: symbol.span.end.line,
        endColumn: symbol.span.end.column,
        signature: this.extractSignature(symbol, source),
        source,
        documentation: symbol.documentation,
        isAsync,
        isExported,
        isStatic,
        tags: inferTags(symbol.name, source),
      };

      nodes.push(node);

      // Find calls within this symbol's span
      if (
        symbol.kind === "function" ||
        symbol.kind === "method" ||
        symbol.kind === "constructor"
      ) {
        const symbolCalls = allCalls.filter(
          (call) =>
            call.line >= symbol.span.start.line &&
            call.line <= symbol.span.end.line
        );

        for (const call of symbolCalls) {
          // Skip self-calls
          if (call.callee === symbol.name) continue;

          edges.push({
            id: this.generateEdgeId(),
            source: node.id,
            target: call.callee, // Will be resolved later
            kind: "calls",
            confidence: this.computeCallConfidence(call),
            file: filePath,
            line: call.line,
            column: call.column,
            isConditional: this.isInConditional(content, call.line),
            isInLoop: this.isInLoop(content, call.line),
            isInTryCatch: this.isInTryCatch(content, call.line),
          });
        }
      }

      // Process children (e.g., methods of a class)
      if (symbol.children.length > 0) {
        this.processSymbols(
          symbol.children,
          filePath,
          content,
          nodes,
          edges,
          allCalls,
          qualifiedName
        );
      }
    }
  }

  /**
   * Extract a signature string from a symbol.
   */
  private extractSignature(symbol: SyntaxSymbol, source: string): string {
    const lines = source.split("\n");
    const firstLine = lines[0].trim();

    switch (symbol.kind) {
      case "function":
        // Extract up to opening brace or first newline
        const funcMatch = firstLine.match(
          /^((?:export\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)(?:\s*:\s*[^{]+)?)/
        );
        return funcMatch ? funcMatch[1].trim() : `function ${symbol.name}(...)`;

      case "method":
        const methodMatch = firstLine.match(
          /^((?:static\s+)?(?:async\s+)?\w+\s*\([^)]*\)(?:\s*:\s*[^{]+)?)/
        );
        return methodMatch ? methodMatch[1].trim() : `${symbol.name}(...)`;

      case "class":
        const classMatch = firstLine.match(
          /^((?:export\s+)?(?:abstract\s+)?class\s+\w+(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?)/
        );
        return classMatch ? classMatch[1].trim() : `class ${symbol.name}`;

      case "interface":
        const ifaceMatch = firstLine.match(
          /^((?:export\s+)?interface\s+\w+(?:\s+extends\s+[^{]+)?)/
        );
        return ifaceMatch ? ifaceMatch[1].trim() : `interface ${symbol.name}`;

      case "type_alias":
        return `type ${symbol.name}`;

      case "variable":
      case "constant":
        const varMatch = firstLine.match(
          /^((?:export\s+)?(?:const|let|var)\s+\w+(?:\s*:\s*[^=]+)?)/
        );
        return varMatch ? varMatch[1].trim() : `const ${symbol.name}`;

      default:
        return symbol.name;
    }
  }

  /**
   * Compute confidence for a call based on its context.
   */
  private computeCallConfidence(call: CallInfo): number {
    // Direct function calls have high confidence
    if (!call.callee.includes(".")) {
      return 0.95;
    }

    // this.method() calls have high confidence
    if (call.callText.startsWith("this.")) {
      return 0.9;
    }

    // Method calls on objects have lower confidence (harder to resolve)
    return 0.7;
  }

  /**
   * Check if a line is within a conditional block.
   */
  private isInConditional(content: string, line: number): boolean {
    const lines = content.split("\n").slice(0, line);
    const text = lines.join("\n");

    // Simple heuristic: count if/switch vs closing braces
    const conditionals = (text.match(/\b(if|switch)\s*\(/g) || []).length;
    const closingBraces = (text.match(/}\s*(else)?/g) || []).length;

    return conditionals > closingBraces;
  }

  /**
   * Check if a line is within a loop.
   */
  private isInLoop(content: string, line: number): boolean {
    const lines = content.split("\n").slice(0, line);
    const text = lines.join("\n");

    const loops = (text.match(/\b(for|while|do)\s*[\({]/g) || []).length;
    const closingBraces = (text.match(/}\s*(?:while)?/g) || []).length;

    return loops > closingBraces;
  }

  /**
   * Check if a line is within a try-catch block.
   */
  private isInTryCatch(content: string, line: number): boolean {
    const lines = content.split("\n").slice(0, line);
    const text = lines.join("\n");

    const trys = (text.match(/\btry\s*{/g) || []).length;
    const catches = (text.match(/}\s*catch/g) || []).length;

    return trys > catches;
  }
}
