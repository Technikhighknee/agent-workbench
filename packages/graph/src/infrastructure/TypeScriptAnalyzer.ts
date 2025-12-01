/**
 * TypeScript/JavaScript analyzer - extracts symbols and call relationships.
 * Produces graph nodes and edges from source files.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
import { GraphNode, GraphEdge } from "../core/model.js";

interface ExtractedSymbol {
  node: GraphNode;
  calls: { target: string; line: number; column: number; confidence: number }[];
  reads: { target: string; line: number; column: number }[];
  writes: { target: string; line: number; column: number }[];
}

// Simple regex-based extraction for speed
// In production, would use tree-sitter from syntax package

export class TypeScriptAnalyzer {
  private idCounter = 0;

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

  analyze(filePath: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const symbolMap = new Map<string, GraphNode>();

    // Extract functions, classes, methods
    const symbols = this.extractSymbols(content, filePath, lines);

    for (const symbol of symbols) {
      nodes.push(symbol.node);
      symbolMap.set(symbol.node.name, symbol.node);

      // Create call edges
      for (const call of symbol.calls) {
        edges.push({
          id: this.generateEdgeId(),
          source: symbol.node.id,
          target: call.target, // Will resolve later
          kind: "calls",
          confidence: call.confidence,
          file: filePath,
          line: call.line,
          column: call.column,
          isConditional: false,
          isInLoop: false,
          isInTryCatch: false,
        });
      }
    }

    return { nodes, edges };
  }

  private extractSymbols(content: string, filePath: string, lines: string[]): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];

    // Match function declarations
    const funcRegex = /^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm;
    let match;

    while ((match = funcRegex.exec(content)) !== null) {
      const [, indent, exported, async, name, params] = match;
      const line = content.slice(0, match.index).split("\n").length;
      const column = (indent?.length || 0) + 1;

      const { source, endLine } = this.extractFunctionBody(content, match.index, lines);
      const calls = this.extractCalls(source, line, name);

      symbols.push({
        node: {
          id: this.generateId(),
          kind: "function",
          name,
          qualifiedName: name,
          file: filePath,
          line,
          column,
          endLine,
          endColumn: 1,
          signature: `function ${name}(${params})`,
          source,
          isAsync: !!async,
          isExported: !!exported,
          isStatic: false,
          tags: this.inferTags(name, source),
        },
        calls,
        reads: [],
        writes: [],
      });
    }

    // Match arrow functions assigned to const/let
    const arrowRegex = /^(\s*)(export\s+)?(const|let)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/gm;

    while ((match = arrowRegex.exec(content)) !== null) {
      const [, indent, exported, , name, async] = match;
      const line = content.slice(0, match.index).split("\n").length;
      const column = (indent?.length || 0) + 1;

      const { source, endLine } = this.extractArrowBody(content, match.index, lines);
      const calls = this.extractCalls(source, line, name);

      symbols.push({
        node: {
          id: this.generateId(),
          kind: "function",
          name,
          qualifiedName: name,
          file: filePath,
          line,
          column,
          endLine,
          endColumn: 1,
          signature: `const ${name} = (...)`,
          source,
          isAsync: !!async,
          isExported: !!exported,
          isStatic: false,
          tags: this.inferTags(name, source),
        },
        calls,
        reads: [],
        writes: [],
      });
    }

    // Match class declarations
    const classRegex = /^(\s*)(export\s+)?class\s+(\w+)(\s+extends\s+(\w+))?(\s+implements\s+([^{]+))?\s*\{/gm;

    while ((match = classRegex.exec(content)) !== null) {
      const [, indent, exported, name, , extendsClass] = match;
      const line = content.slice(0, match.index).split("\n").length;
      const column = (indent?.length || 0) + 1;

      const { source, endLine } = this.extractClassBody(content, match.index, lines);

      const classNode: GraphNode = {
        id: this.generateId(),
        kind: "class",
        name,
        qualifiedName: name,
        file: filePath,
        line,
        column,
        endLine,
        endColumn: 1,
        signature: `class ${name}${extendsClass ? ` extends ${extendsClass}` : ""}`,
        source,
        isAsync: false,
        isExported: !!exported,
        isStatic: false,
        tags: this.inferTags(name, source),
      };

      symbols.push({
        node: classNode,
        calls: [],
        reads: [],
        writes: [],
      });

      // Extract methods from class
      const methods = this.extractMethods(source, filePath, line, name);
      symbols.push(...methods);
    }

    // Match interfaces
    const interfaceRegex = /^(\s*)(export\s+)?interface\s+(\w+)/gm;

    while ((match = interfaceRegex.exec(content)) !== null) {
      const [, indent, exported, name] = match;
      const line = content.slice(0, match.index).split("\n").length;

      const { source, endLine } = this.extractInterfaceBody(content, match.index, lines);

      symbols.push({
        node: {
          id: this.generateId(),
          kind: "interface",
          name,
          qualifiedName: name,
          file: filePath,
          line,
          column: (indent?.length || 0) + 1,
          endLine,
          endColumn: 1,
          signature: `interface ${name}`,
          source,
          isAsync: false,
          isExported: !!exported,
          isStatic: false,
          tags: ["type"],
        },
        calls: [],
        reads: [],
        writes: [],
      });
    }

    return symbols;
  }

  private extractMethods(classSource: string, filePath: string, classStartLine: number, className: string): ExtractedSymbol[] {
    const methods: ExtractedSymbol[] = [];
    const methodRegex = /^(\s*)(static\s+)?(async\s+)?(\w+)\s*\(([^)]*)\)\s*[:{]/gm;

    let match;
    while ((match = methodRegex.exec(classSource)) !== null) {
      const [, indent, isStatic, async, name, params] = match;

      // Skip constructor-like patterns that aren't methods
      if (name === "class" || name === "interface" || name === "function") continue;

      const relLine = classSource.slice(0, match.index).split("\n").length;
      const line = classStartLine + relLine - 1;

      const { source, endLine: relEndLine } = this.extractMethodBody(classSource, match.index);
      const calls = this.extractCalls(source, line, name);

      methods.push({
        node: {
          id: this.generateId(),
          kind: "method",
          name,
          qualifiedName: `${className}.${name}`,
          file: filePath,
          line,
          column: (indent?.length || 0) + 1,
          endLine: classStartLine + relEndLine - 1,
          endColumn: 1,
          signature: `${isStatic ? "static " : ""}${async ? "async " : ""}${name}(${params})`,
          source,
          isAsync: !!async,
          isExported: false,
          isStatic: !!isStatic,
          tags: this.inferTags(name, source),
        },
        calls,
        reads: [],
        writes: [],
      });
    }

    return methods;
  }

  private extractCalls(source: string, baseLine: number, selfName?: string): { target: string; line: number; column: number; confidence: number }[] {
    const calls: { target: string; line: number; column: number; confidence: number }[] = [];
    const lines = source.split("\n");

    // Find start of function body (after opening brace) to skip signature
    let startLineIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("{")) {
        startLineIndex = i + 1; // Start after the line with opening brace
        break;
      }
    }

    // First pass: collect method calls (obj.method() including this.method())
    const methodCallPositions = new Set<string>(); // "line:column" to avoid duplicates

    let lineNum = startLineIndex;
    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i];
      let match;
      const lineMcRegex = /(\w+)\.(\w+)\s*\(/g;
      while ((match = lineMcRegex.exec(line)) !== null) {
        const target = `${match[1]}.${match[2]}`;

        // Skip this.foo if we want just the method name for resolution
        if (match[1] === "this") {
          const methodName = match[2];
          // Skip self-references
          if (selfName && methodName === selfName) {
            continue;
          }
          calls.push({
            target: methodName, // Just the method name for better resolution
            line: baseLine + lineNum,
            column: match.index + 1,
            confidence: 0.85,
          });
        } else {
          calls.push({
            target,
            line: baseLine + lineNum,
            column: match.index + 1,
            confidence: 0.7,
          });
        }
        // Mark the method name position so we don't double-count it
        const methodPos = match.index + match[1].length + 1; // Position of method name
        methodCallPositions.add(`${lineNum}:${methodPos}`);
      }
      lineNum++;
    }

    // Second pass: collect standalone function calls (not already captured as methods)
    lineNum = startLineIndex;
    for (let i = startLineIndex; i < lines.length; i++) {
      const line = lines[i];
      let match;
      const lineCallRegex = /\b(\w+)\s*\(/g;
      while ((match = lineCallRegex.exec(line)) !== null) {
        const name = match[1];
        // Skip keywords, control structures, and self-references
        if (["if", "while", "for", "switch", "catch", "try", "function", "class", "return", "throw", "new", "typeof", "instanceof", "async", "await", "import", "export", "const", "let", "var"].includes(name)) {
          continue;
        }
        // Skip self-references (method calling itself in signature line)
        if (selfName && name === selfName) {
          continue;
        }

        // Skip if this position was already captured as a method call
        const posKey = `${lineNum}:${match.index}`;
        if (methodCallPositions.has(posKey)) {
          continue;
        }

        // Also skip if preceded by a dot (it's a method name)
        if (match.index > 0 && line[match.index - 1] === ".") {
          continue;
        }

        calls.push({
          target: name,
          line: baseLine + lineNum,
          column: match.index + 1,
          confidence: 0.9,
        });
      }
      lineNum++;
    }

    return calls;
  }

  private extractFunctionBody(content: string, startIndex: number, _lines: string[]): { source: string; endLine: number } {
    let braceCount = 0;
    let inBody = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === "{") {
        braceCount++;
        inBody = true;
      } else if (content[i] === "}") {
        braceCount--;
        if (inBody && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    const source = content.slice(startIndex, endIndex);
    const endLine = content.slice(0, endIndex).split("\n").length;
    return { source, endLine };
  }

  private extractArrowBody(content: string, startIndex: number, _lines: string[]): { source: string; endLine: number } {
    // Find the arrow
    let arrowIndex = content.indexOf("=>", startIndex);
    if (arrowIndex === -1) return { source: "", endLine: 0 };

    // Check if it's a block body or expression
    let bodyStart = arrowIndex + 2;
    while (bodyStart < content.length && /\s/.test(content[bodyStart])) bodyStart++;

    if (content[bodyStart] === "{") {
      // Block body - find matching brace
      return this.extractFunctionBody(content, bodyStart, _lines);
    } else {
      // Expression body - find end (semicolon or newline with lower indent)
      let endIndex = bodyStart;
      let parenCount = 0;

      for (let i = bodyStart; i < content.length; i++) {
        if (content[i] === "(") parenCount++;
        else if (content[i] === ")") parenCount--;
        else if (content[i] === ";" && parenCount === 0) {
          endIndex = i + 1;
          break;
        } else if (content[i] === "\n" && parenCount === 0) {
          // Check if next non-empty line has same or lower indent
          endIndex = i;
          break;
        }
      }

      const source = content.slice(startIndex, endIndex);
      const endLine = content.slice(0, endIndex).split("\n").length;
      return { source, endLine };
    }
  }

  private extractClassBody(content: string, startIndex: number, _lines: string[]): { source: string; endLine: number } {
    return this.extractFunctionBody(content, startIndex, _lines);
  }

  private extractInterfaceBody(content: string, startIndex: number, _lines: string[]): { source: string; endLine: number } {
    return this.extractFunctionBody(content, startIndex, _lines);
  }

  private extractMethodBody(classSource: string, startIndex: number): { source: string; endLine: number } {
    let braceCount = 0;
    let inBody = false;
    let endIndex = startIndex;

    for (let i = startIndex; i < classSource.length; i++) {
      if (classSource[i] === "{") {
        braceCount++;
        inBody = true;
      } else if (classSource[i] === "}") {
        braceCount--;
        if (inBody && braceCount === 0) {
          endIndex = i + 1;
          break;
        }
      }
    }

    const source = classSource.slice(startIndex, endIndex);
    const endLine = classSource.slice(0, endIndex).split("\n").length;
    return { source, endLine };
  }

  private inferTags(name: string, source: string): string[] {
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
    
    // SQL detection - require SQL keywords in string literals or with table-like patterns
    // Match: SELECT ... FROM, INSERT INTO, UPDATE ... SET, DELETE FROM
    if (/\bSELECT\b.*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b.*\bSET\b|\bDELETE\s+FROM\b/i.test(source)) {
      tags.push("database", "sql");
    }
    
    // Database library detection
    if (/\b(prisma|sequelize|knex|pg|mysql|sqlite|typeorm|drizzle)\b/i.test(source)) tags.push("database");

    return [...new Set(tags)];
  }
}
