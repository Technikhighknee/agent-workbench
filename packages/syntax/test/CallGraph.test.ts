import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProjectIndex, TreeSitterParser, NodeFileSystem, InMemoryCache, NodeProjectScanner } from "../src/index.js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("CallGraph", () => {
  let index: ProjectIndex;
  let testDir: string;

  beforeAll(async () => {
    const parser = new TreeSitterParser();
    const fs = new NodeFileSystem();
    const cache = new InMemoryCache();
    const scanner = new NodeProjectScanner();

    // Create a unique temp directory for tests
    testDir = join(tmpdir(), `callgraph-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create test files with call relationships
    // a.ts: exports entryPoint, calls helper
    writeFileSync(join(testDir, "a.ts"), `
export function entryPoint() {
  return helper();
}

function helper() {
  return process();
}

function process() {
  return "done";
}

// This function is never called
function deadFunction() {
  return "dead";
}
`);

    // b.ts: exports service that calls a.ts functions
    writeFileSync(join(testDir, "b.ts"), `
import { entryPoint } from "./a.js";

export function service() {
  return entryPoint();
}

export function unusedExport() {
  return "unused";
}
`);

    // c.ts: chain through multiple files
    writeFileSync(join(testDir, "c.ts"), `
import { service } from "./b.js";

export function main() {
  return service();
}
`);

    index = new ProjectIndex(parser, fs, cache, scanner);
    await index.index(testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("trace", () => {
    it("traces forward from a function", () => {
      const result = index.trace("entryPoint", "forward", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // entryPoint -> helper -> process
      expect(result.value.direction).toBe("forward");
      expect(result.value.from).toContain("entryPoint");

      // Should find helper and process in the trace
      const allSymbols = result.value.reachable.map(r => r.node.name);
      expect(allSymbols).toContain("helper");
      expect(allSymbols).toContain("process");
    });

    it("traces backward to find callers", () => {
      const result = index.trace("helper", "backward", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // helper is called by entryPoint
      const allSymbols = result.value.reachable.map(r => r.node.name);
      expect(allSymbols).toContain("entryPoint");
    });

    it("respects depth limit", () => {
      const result = index.trace("entryPoint", "forward", 1);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // With depth 1, should only find immediate callees
      // entryPoint -> helper (depth 1), but NOT process (depth 2)
      const maxDepth = Math.max(...result.value.reachable.map(r => r.depth), 0);
      expect(maxDepth).toBeLessThanOrEqual(1);
    });

    it("returns error for non-existent symbol", () => {
      const result = index.trace("nonexistent", "forward", 5);
      expect(result.ok).toBe(false);
    });
  });

  describe("findPaths", () => {
    it("finds direct path between caller and callee", () => {
      const result = index.findPaths("entryPoint", "helper", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.paths.length).toBeGreaterThan(0);
      const path = result.value.paths[0];
      // Paths contain node IDs which include the symbol name
      expect(path.nodes[0]).toContain("entryPoint");
      expect(path.nodes[path.nodes.length - 1]).toContain("helper");
    });

    it("finds multi-hop path", () => {
      const result = index.findPaths("entryPoint", "process", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // entryPoint -> helper -> process
      expect(result.value.paths.length).toBeGreaterThan(0);
      const path = result.value.paths[0];
      // Path length is number of edges, 3 nodes = 2 edges
      expect(path.nodes.length).toBe(3);
      expect(path.length).toBe(2); // 2 edges
    });

    it("finds cross-file paths", () => {
      const result = index.findPaths("main", "entryPoint", 10);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // main (c.ts) -> service (b.ts) -> entryPoint (a.ts)
      expect(result.value.paths.length).toBeGreaterThan(0);
    });

    it("returns empty paths when no connection exists", () => {
      const result = index.findPaths("deadFunction", "entryPoint", 5);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.paths.length).toBe(0);
    });

    it("returns error for non-existent source", () => {
      const result = index.findPaths("nonexistent", "helper", 5);
      expect(result.ok).toBe(false);
    });
  });

  describe("findDeadCode", () => {
    it("finds functions not reachable from exports", () => {
      const result = index.findDeadCode();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // deadFunction and helper/process are not exported
      // but helper and process ARE reachable from entryPoint which is exported
      // deadFunction should be flagged as dead
      const deadNames = result.value.deadCode.map(i => i.node.name);
      expect(deadNames).toContain("deadFunction");
    });

    it("does not flag reachable private functions", () => {
      const result = index.findDeadCode();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // helper is called by entryPoint (which is exported)
      // so helper should NOT be in dead code
      const deadNames = result.value.deadCode.map(i => i.node.name);
      expect(deadNames).not.toContain("helper");
      expect(deadNames).not.toContain("process");
    });

    it("filters by file pattern", () => {
      const result = index.findDeadCode("a\\.ts$");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should only check files matching pattern
      for (const item of result.value.deadCode) {
        expect(item.node.file).toMatch(/a\.ts$/);
      }
    });
  });

  describe("call graph invalidation", () => {
    it("rebuilds call graph after file change", async () => {
      // First trace to build graph
      const result1 = index.trace("entryPoint", "forward", 5);
      expect(result1.ok).toBe(true);

      // Modify a file
      writeFileSync(join(testDir, "a.ts"), `
export function entryPoint() {
  return newHelper();
}

function newHelper() {
  return "new";
}

function deadFunction() {
  return "still dead";
}
`);

      // Reindex the changed file
      await index.reindexFile(join(testDir, "a.ts"));

      // Trace again - should use new graph
      const result2 = index.trace("entryPoint", "forward", 5);
      expect(result2.ok).toBe(true);
      if (!result2.ok) return;

      const callees = result2.value.reachable.map(r => r.node.name);
      expect(callees).toContain("newHelper");
      expect(callees).not.toContain("helper");
    });
  });
});
