import { describe, it, expect } from "vitest";
import {
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
  type Result,
} from "../src/result.js";

describe("Result", () => {
  describe("Ok", () => {
    it("creates a successful result", () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it("works with different types", () => {
      expect(Ok("hello").value).toBe("hello");
      expect(Ok({ a: 1 }).value).toEqual({ a: 1 });
      expect(Ok([1, 2, 3]).value).toEqual([1, 2, 3]);
      expect(Ok(null).value).toBe(null);
      expect(Ok(undefined).value).toBe(undefined);
    });
  });

  describe("Err", () => {
    it("creates an error result", () => {
      const result = Err("failed");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("failed");
    });

    it("works with Error objects", () => {
      const error = new Error("something went wrong");
      const result = Err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe("lowercase aliases", () => {
    it("ok is alias for Ok", () => {
      expect(ok(42)).toEqual(Ok(42));
    });

    it("err is alias for Err", () => {
      expect(err("failed")).toEqual(Err("failed"));
    });
  });

  describe("isOk", () => {
    it("returns true for Ok results", () => {
      expect(isOk(Ok(42))).toBe(true);
    });

    it("returns false for Err results", () => {
      expect(isOk(Err("error"))).toBe(false);
    });

    it("narrows type correctly", () => {
      const result: Result<number, string> = Ok(42);
      if (isOk(result)) {
        // TypeScript should know result.value exists here
        expect(result.value).toBe(42);
      }
    });
  });

  describe("isErr", () => {
    it("returns false for Ok results", () => {
      expect(isErr(Ok(42))).toBe(false);
    });

    it("returns true for Err results", () => {
      expect(isErr(Err("error"))).toBe(true);
    });

    it("narrows type correctly", () => {
      const result: Result<number, string> = Err("failed");
      if (isErr(result)) {
        // TypeScript should know result.error exists here
        expect(result.error).toBe("failed");
      }
    });
  });

  describe("map", () => {
    it("transforms Ok value", () => {
      const result = map(Ok(5), (x) => x * 2);
      expect(result).toEqual(Ok(10));
    });

    it("passes through Err unchanged", () => {
      const result = map(Err("error") as Result<number, string>, (x) => x * 2);
      expect(result).toEqual(Err("error"));
    });

    it("can change value type", () => {
      const result = map(Ok(42), (x) => x.toString());
      expect(result).toEqual(Ok("42"));
    });
  });

  describe("mapErr", () => {
    it("transforms Err value", () => {
      const result = mapErr(Err("error"), (e) => e.toUpperCase());
      expect(result).toEqual(Err("ERROR"));
    });

    it("passes through Ok unchanged", () => {
      const result = mapErr(Ok(42) as Result<number, string>, (e) => e.toUpperCase());
      expect(result).toEqual(Ok(42));
    });

    it("can change error type", () => {
      const result = mapErr(Err("error"), (e) => new Error(e));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe("andThen", () => {
    const divide = (a: number, b: number): Result<number, string> =>
      b === 0 ? Err("division by zero") : Ok(a / b);

    it("chains successful operations", () => {
      const result = andThen(Ok(10), (x) => divide(x, 2));
      expect(result).toEqual(Ok(5));
    });

    it("short-circuits on first error", () => {
      const result = andThen(Ok(10), (x) => divide(x, 0));
      expect(result).toEqual(Err("division by zero"));
    });

    it("passes through initial Err", () => {
      const result = andThen(Err("initial error") as Result<number, string>, (x) => divide(x, 2));
      expect(result).toEqual(Err("initial error"));
    });
  });

  describe("unwrapOr", () => {
    it("returns value for Ok", () => {
      expect(unwrapOr(Ok(42), 0)).toBe(42);
    });

    it("returns default for Err", () => {
      expect(unwrapOr(Err("error") as Result<number, string>, 0)).toBe(0);
    });
  });

  describe("unwrapOrElse", () => {
    it("returns value for Ok", () => {
      expect(unwrapOrElse(Ok(42), () => 0)).toBe(42);
    });

    it("computes default for Err", () => {
      const result = unwrapOrElse(Err("error") as Result<number, string>, (e) => e.length);
      expect(result).toBe(5); // "error".length
    });
  });

  describe("unwrap", () => {
    it("returns value for Ok", () => {
      expect(unwrap(Ok(42))).toBe(42);
    });

    it("throws error for Err", () => {
      const error = new Error("test error");
      expect(() => unwrap(Err(error))).toThrow(error);
    });

    it("throws string as-is for Err with string", () => {
      expect(() => unwrap(Err("string error"))).toThrow("string error");
    });
  });

  describe("all", () => {
    it("combines successful results", () => {
      const results = [Ok(1), Ok(2), Ok(3)];
      expect(all(results)).toEqual(Ok([1, 2, 3]));
    });

    it("returns first error", () => {
      const results: Result<number, string>[] = [Ok(1), Err("first error"), Err("second error")];
      expect(all(results)).toEqual(Err("first error"));
    });

    it("returns Ok with empty array for empty input", () => {
      expect(all([])).toEqual(Ok([]));
    });
  });

  describe("tryCatch", () => {
    it("wraps successful execution in Ok", () => {
      const result = tryCatch(() => 42);
      expect(result).toEqual(Ok(42));
    });

    it("wraps thrown Error in Err", () => {
      const error = new Error("test error");
      const result = tryCatch(() => {
        throw error;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it("wraps thrown non-Error in Err with Error wrapper", () => {
      const result = tryCatch(() => {
        throw "string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe("string error");
      }
    });
  });

  describe("tryCatchAsync", () => {
    it("wraps successful async execution in Ok", async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(result).toEqual(Ok(42));
    });

    it("wraps rejected promise in Err", async () => {
      const error = new Error("async error");
      const result = await tryCatchAsync(async () => {
        throw error;
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });

    it("wraps rejected non-Error in Err with Error wrapper", async () => {
      const result = await tryCatchAsync(async () => {
        throw "string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe("string error");
      }
    });
  });
});
