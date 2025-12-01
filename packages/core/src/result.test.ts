import { describe, it } from "node:test";
import assert from "node:assert";
import { Result, Ok, Err, ok, err } from "./result.js";

describe("Result type", () => {
  describe("Ok", () => {
    it("creates success result with value", () => {
      const result = Ok(42);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 42);
      }
    });

    it("works with complex types", () => {
      const result = Ok({ name: "test", count: 5 });
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.deepStrictEqual(result.value, { name: "test", count: 5 });
      }
    });
  });

  describe("Err", () => {
    it("creates error result with error", () => {
      const result = Err("something went wrong");
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "something went wrong");
      }
    });

    it("works with Error objects", () => {
      const error = new Error("test error");
      const result = Err(error);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.message, "test error");
      }
    });
  });

  describe("lowercase aliases", () => {
    it("ok is alias for Ok", () => {
      const result = ok("value");
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, "value");
      }
    });

    it("err is alias for Err", () => {
      const result = err("error");
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "error");
      }
    });
  });

  describe("type narrowing", () => {
    it("narrows to success branch when ok is true", () => {
      const result: Result<number, string> = Ok(10);
      if (result.ok) {
        // TypeScript knows result.value exists here
        const doubled: number = result.value * 2;
        assert.strictEqual(doubled, 20);
      }
    });

    it("narrows to error branch when ok is false", () => {
      const result: Result<number, string> = Err("failed");
      if (!result.ok) {
        // TypeScript knows result.error exists here
        const upper: string = result.error.toUpperCase();
        assert.strictEqual(upper, "FAILED");
      }
    });
  });

  describe("real-world patterns", () => {
    function divide(a: number, b: number): Result<number, string> {
      if (b === 0) {
        return Err("division by zero");
      }
      return Ok(a / b);
    }

    it("handles success case in function", () => {
      const result = divide(10, 2);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 5);
      }
    });

    it("handles error case in function", () => {
      const result = divide(10, 0);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "division by zero");
      }
    });

    it("chains multiple operations", () => {
      const first = divide(20, 4);
      if (!first.ok) {
        assert.fail("first division should succeed");
      }

      const second = divide(first.value, 0);
      assert.strictEqual(second.ok, false);
      if (!second.ok) {
        assert.strictEqual(second.error, "division by zero");
      }
    });
  });
});
