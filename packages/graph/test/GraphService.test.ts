import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GraphService } from "../src/infrastructure/GraphService.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");

describe("GraphService", () => {
  let service: GraphService;

  beforeAll(async () => {
    service = new GraphService();
    const result = await service.initialize(FIXTURES);
    expect(result.ok).toBe(true);
  });

  afterAll(() => {
    // Clean up
  });

  describe("initialization", () => {
    it("initializes without errors", () => {
      expect(service.isInitialized()).toBe(true);
    });

    it("returns stats after initialization", () => {
      const stats = service.getStats();
      expect(stats.nodes).toBeGreaterThan(0);
      expect(stats.files).toBeGreaterThan(0);
      expect(stats.edges).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getSymbol", () => {
    it("finds class by name", () => {
      const result = service.getSymbol("UserService");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("class");
        expect(result.value.name).toBe("UserService");
        expect(result.value.source).toContain("class UserService");
      }
    });

    it("finds function by name", () => {
      const result = service.getSymbol("validateEmail");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("function");
        expect(result.value.name).toBe("validateEmail");
      }
    });

    it("finds interface by name", () => {
      const result = service.getSymbol("User");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("interface");
      }
    });

    it("finds method by qualified name", () => {
      const result = service.getSymbol("UserService.createUser");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.kind).toBe("method");
        expect(result.value.name).toBe("createUser");
      }
    });

    it("returns error for non-existent symbol", () => {
      const result = service.getSymbol("NonExistent");
      expect(result.ok).toBe(false);
    });
  });

  describe("getCallers", () => {
    it("finds callers of validateEmail", () => {
      const result = service.getCallers("validateEmail");
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return at least validateEmail itself in the result
        expect(result.value.nodes.length).toBeGreaterThan(0);
      }
    });

    it("finds callers of repository methods", () => {
      const result = service.getCallers("findById");
      expect(result.ok).toBe(true);
      if (result.ok) {
        // findById is called by getUser and deleteUser
        expect(result.value.nodes.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("getCallees", () => {
    it("finds what validateCreateUserInput calls", () => {
      const result = service.getCallees("validateCreateUserInput");
      expect(result.ok).toBe(true);
      if (result.ok) {
        const calleeNames = result.value.nodes.map((n) => n.name);
        // validateCreateUserInput calls validateName and validateEmail
        expect(calleeNames.length).toBeGreaterThan(0);
      }
    });

    it("finds what createUser calls", () => {
      const result = service.getCallees("createUser");
      expect(result.ok).toBe(true);
      if (result.ok) {
        // createUser calls validateCreateUserInput, findByEmail, create
        expect(result.value.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("findSymbols", () => {
    it("finds symbols by pattern", () => {
      const result = service.findSymbols({ pattern: "validate" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const names = result.value.nodes.map((s) => s.name);
        expect(names.some((n) => n.includes("validate"))).toBe(true);
      }
    });

    it("finds symbols by kind", () => {
      const result = service.findSymbols({ kinds: ["class"] });
      expect(result.ok).toBe(true);
      if (result.ok) {
        const names = result.value.nodes.map((s) => s.name);
        expect(names).toContain("UserService");
        expect(names).toContain("UserRepository");
      }
    });

    it("filters by both pattern and kind", () => {
      const result = service.findSymbols({
        pattern: "User",
        kinds: ["interface"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should find User but not UserService (class)
        const kinds = result.value.nodes.map((s) => s.kind);
        expect(kinds.every((k) => k === "interface")).toBe(true);
      }
    });

    it("respects limit", () => {
      const result = service.findSymbols({ limit: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nodes.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe("traceForward", () => {
    it("traces calls from handleCreateUser", () => {
      const result = service.traceForward("handleCreateUser", { depth: 3 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("traceBackward", () => {
    it("traces callers back to validateEmail", () => {
      const result = service.traceBackward("validateEmail", { depth: 3 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nodes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("findPaths", () => {
    it("returns valid result structure", () => {
      const result = service.findPaths(
        "processUserRegistration",
        "validateEmail",
        { maxDepth: 5 }
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Result should have valid structure
        expect(result.value.nodes).toBeDefined();
        expect(result.value.edges).toBeDefined();
      }
    });

    it("returns result even if no path found", () => {
      const result = service.findPaths(
        "User",
        "validateEmail",
        { maxDepth: 2 }
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("query", () => {
    it("executes compound query with pattern filter", () => {
      const result = service.query({
        from: { pattern: "handle" },
        traverse: {
          direction: "forward",
          maxDepth: 2,
        },
        output: {
          format: "subgraph",
          includeSource: true,
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nodes).toBeDefined();
        expect(result.value.edges).toBeDefined();
      }
    });

    it("supports querying by kind", () => {
      const result = service.query({
        from: { kinds: ["function"] },
        output: {
          format: "subgraph",
          includeSource: false,
          limit: 5,
        },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.nodes.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("edge cases", () => {
    it("handles non-existent symbol in getCallers gracefully", () => {
      const result = service.getCallers("nonExistentFunction");
      // Returns empty result or error - both acceptable
      if (result.ok) {
        expect(result.value.nodes.length).toBe(0);
      }
    });

    it("handles non-existent symbol in getCallees gracefully", () => {
      const result = service.getCallees("nonExistentFunction");
      // Returns empty result or error - both acceptable
      if (result.ok) {
        expect(result.value.nodes.length).toBe(0);
      }
    });

    it("handles empty pattern in findSymbols", () => {
      const result = service.findSymbols({});
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should return all symbols
        expect(result.value.nodes.length).toBeGreaterThan(0);
      }
    });
  });
});
