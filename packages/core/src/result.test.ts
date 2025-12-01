import { describe, it } from "node:test";
import assert from "node:assert";
import {
  Result,
  Ok,
  Err,
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  unwrapOr,
  unwrapOrElse,
  unwrap,
  all,
  tryCatch,
  tryCatchAsync,
} from "./result.js";

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

describe("Result utilities", () => {
  describe("isOk / isErr", () => {
    it("isOk returns true for Ok", () => {
      assert.strictEqual(isOk(Ok(42)), true);
      assert.strictEqual(isOk(Err("error")), false);
    });

    it("isErr returns true for Err", () => {
      assert.strictEqual(isErr(Err("error")), true);
      assert.strictEqual(isErr(Ok(42)), false);
    });

    it("works as type guard", () => {
      const result: Result<number, string> = Ok(42);
      if (isOk(result)) {
        // TypeScript knows result.value exists
        assert.strictEqual(result.value, 42);
      }
    });
  });

  describe("map", () => {
    it("transforms Ok value", () => {
      const result = map(Ok(5), (x) => x * 2);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 10);
      }
    });

    it("passes through Err unchanged", () => {
      const result = map(Err("error") as Result<number, string>, (x) => x * 2);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "error");
      }
    });
  });

  describe("mapErr", () => {
    it("transforms Err value", () => {
      const result = mapErr(Err("error"), (e) => e.toUpperCase());
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "ERROR");
      }
    });

    it("passes through Ok unchanged", () => {
      const result = mapErr(Ok(42) as Result<number, string>, (e) => e.toUpperCase());
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 42);
      }
    });
  });

  describe("andThen", () => {
    function divide(a: number, b: number): Result<number, string> {
      if (b === 0) return Err("division by zero");
      return Ok(a / b);
    }

    it("chains successful operations", () => {
      const result = andThen(Ok(20), (x) => divide(x, 4));
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 5);
      }
    });

    it("short-circuits on first error", () => {
      const result = andThen(Err("initial error") as Result<number, string>, (x) =>
        divide(x, 4)
      );
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "initial error");
      }
    });

    it("propagates error from chained operation", () => {
      const result = andThen(Ok(20), (x) => divide(x, 0));
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "division by zero");
      }
    });
  });

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      assert.strictEqual(unwrapOr(Ok(42), 0), 42);
    });

    it("returns default for Err", () => {
      assert.strictEqual(unwrapOr(Err("error"), 0), 0);
    });
  });

  describe("unwrapOrElse", () => {
    it("returns value for Ok without calling fn", () => {
      let called = false;
      const result = unwrapOrElse(Ok(42), () => {
        called = true;
        return 0;
      });
      assert.strictEqual(result, 42);
      assert.strictEqual(called, false);
    });

    it("computes default for Err", () => {
      const result = unwrapOrElse(Err("error"), (e) => e.length);
      assert.strictEqual(result, 5);
    });
  });

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      assert.strictEqual(unwrap(Ok(42)), 42);
    });

    it("throws for Err", () => {
      assert.throws(() => unwrap(Err(new Error("test"))), { message: "test" });
    });
  });

  describe("all", () => {
    it("combines all Ok results", () => {
      const result = all([Ok(1), Ok(2), Ok(3)]);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.deepStrictEqual(result.value, [1, 2, 3]);
      }
    });

    it("returns first Err", () => {
      const result = all([Ok(1), Err("error"), Ok(3)] as Result<number, string>[]);
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, "error");
      }
    });

    it("handles empty array", () => {
      const result = all([]);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.deepStrictEqual(result.value, []);
      }
    });
  });

  describe("tryCatch", () => {
    it("wraps successful result", () => {
      const result = tryCatch(() => 42);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 42);
      }
    });

    it("catches thrown Error", () => {
      const result = tryCatch(() => {
        throw new Error("test error");
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.message, "test error");
      }
    });

    it("wraps non-Error throws in Error", () => {
      const result = tryCatch(() => {
        throw "string error";
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.message, "string error");
      }
    });
  });

  describe("tryCatchAsync", () => {
    it("wraps successful async result", async () => {
      const result = await tryCatchAsync(async () => 42);
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value, 42);
      }
    });

    it("catches async rejection", async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error("async error");
      });
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error.message, "async error");
      }
    });
  });
});
