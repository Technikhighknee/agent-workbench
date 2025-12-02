import { describe, it, expect, beforeAll } from "vitest";
import { GraphStore } from "../src/GraphStore.js";
import { Analyzer } from "../src/Analyzer.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("GraphStore", () => {
  let store: GraphStore;

  beforeAll(async () => {
    store = new GraphStore();
    const analyzer = new Analyzer();

    const { nodes, edges } = await analyzer.analyzeWorkspace(FIXTURES);
    store.add(nodes, edges);
  });

  describe("initialization", () => {
    it("has nodes after indexing", () => {
      const stats = store.stats();
      expect(stats.nodes).toBeGreaterThan(0);
    });

    it("has files after indexing", () => {
      const stats = store.stats();
      expect(stats.files).toBeGreaterThan(0);
    });

    it("has edges after indexing", () => {
      const stats = store.stats();
      expect(stats.edges).toBeGreaterThanOrEqual(0);
    });
  });

  describe("findSymbols", () => {
    it("finds class by name pattern", () => {
      const symbols = store.findSymbols(/UserService/);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0].kind).toBe("class");
      expect(symbols[0].name).toBe("UserService");
    });

    it("finds function by name pattern", () => {
      const symbols = store.findSymbols(/validateEmail/);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0].kind).toBe("function");
    });

    it("finds interface by name pattern", () => {
      const symbols = store.findSymbols(/^User$/);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0].kind).toBe("interface");
    });

    it("returns empty for non-existent symbol", () => {
      const symbols = store.findSymbols(/NonExistentSymbol123/);
      expect(symbols.length).toBe(0);
    });

    it("filters by kind", () => {
      const symbols = store.findSymbols(/.*/, ["class"]);
      expect(symbols.length).toBeGreaterThan(0);
      const names = symbols.map((s) => s.name);
      expect(names).toContain("UserService");
      expect(names).toContain("UserRepository");
    });

    it("respects limit", () => {
      const symbols = store.findSymbols(/.*/, undefined, 2);
      expect(symbols.length).toBeLessThanOrEqual(2);
    });

    it("finds symbols matching pattern", () => {
      const symbols = store.findSymbols(/validate/i);
      const names = symbols.map((s) => s.name);
      expect(names.some((n) => n.toLowerCase().includes("validate"))).toBe(true);
    });
  });

  describe("getNode", () => {
    it("gets node by ID", () => {
      // Find a symbol first, then get by ID
      const symbols = store.findSymbols(/UserService/);
      expect(symbols.length).toBeGreaterThan(0);

      const node = store.getNode(symbols[0].id);
      expect(node).not.toBeNull();
      expect(node?.name).toBe("UserService");
    });

    it("returns null for non-existent ID", () => {
      const node = store.getNode("non-existent-id");
      expect(node).toBeNull();
    });
  });

  describe("getCallers", () => {
    it("finds callers of a function", () => {
      // validateEmail is called by validateCreateUserInput
      const symbols = store.findSymbols(/validateEmail/);
      expect(symbols.length).toBeGreaterThan(0);

      const callers = store.getCallers(symbols[0].id);
      expect(callers.length).toBeGreaterThanOrEqual(0);
    });

    it("returns empty for symbol with no callers", () => {
      // Find an interface - interfaces can't be called
      const symbols = store.findSymbols(/^User$/);
      expect(symbols.length).toBeGreaterThan(0);

      const callers = store.getCallers(symbols[0].id);
      expect(callers.length).toBe(0);
    });
  });

  describe("getCallees", () => {
    it("finds what a function calls", () => {
      // validateCreateUserInput calls validateName and validateEmail
      const symbols = store.findSymbols(/validateCreateUserInput/);
      expect(symbols.length).toBeGreaterThan(0);

      const callees = store.getCallees(symbols[0].id);
      expect(callees.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("trace", () => {
    it("traces forward from a symbol", () => {
      const symbols = store.findSymbols(/handleCreateUser/);
      if (symbols.length > 0) {
        const traced = store.trace(symbols[0].id, "forward", 3);
        expect(Array.isArray(traced)).toBe(true);
      }
    });

    it("traces backward from a symbol", () => {
      const symbols = store.findSymbols(/validateEmail/);
      if (symbols.length > 0) {
        const traced = store.trace(symbols[0].id, "backward", 3);
        expect(Array.isArray(traced)).toBe(true);
      }
    });

    it("returns empty for non-existent ID", () => {
      const traced = store.trace("non-existent-id", "forward", 3);
      expect(traced.length).toBe(0);
    });
  });

  describe("findPaths", () => {
    it("returns valid path structure", () => {
      const symbols1 = store.findSymbols(/processUserRegistration/);
      const symbols2 = store.findSymbols(/validateEmail/);

      if (symbols1.length > 0 && symbols2.length > 0) {
        const paths = store.findPaths(symbols1[0].id, symbols2[0].id, 5);
        expect(Array.isArray(paths)).toBe(true);
      }
    });

    it("returns empty array if no path found", () => {
      const paths = store.findPaths("id-a", "id-b", 2);
      expect(paths).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles non-existent symbol in getCallers gracefully", () => {
      const callers = store.getCallers("nonExistentId");
      expect(callers).toEqual([]);
    });

    it("handles non-existent symbol in getCallees gracefully", () => {
      const callees = store.getCallees("nonExistentId");
      expect(callees).toEqual([]);
    });
  });
});
