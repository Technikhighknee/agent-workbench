import { describe, it } from "node:test";
import assert from "node:assert";
import { Ok, Err, Result } from "./result.js";
import {
  textResponse,
  errorResponse,
  successResponse,
  resultToResponse,
  resultToStructuredResponse,
} from "./mcp.js";

describe("MCP response utilities", () => {
  describe("textResponse", () => {
    it("creates simple text response", () => {
      const response = textResponse("Hello, world!");
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Hello, world!" }],
      });
    });
  });

  describe("errorResponse", () => {
    it("creates error response with message", () => {
      const response = errorResponse("Something went wrong");
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Error: Something went wrong" }],
        structuredContent: { success: false, error: "Something went wrong" },
      });
    });
  });

  describe("successResponse", () => {
    it("creates success response with text only", () => {
      const response = successResponse("Operation completed");
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Operation completed" }],
        structuredContent: { success: true },
      });
    });

    it("creates success response with data", () => {
      const response = successResponse("Found 5 items", { count: 5, items: ["a", "b"] });
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Found 5 items" }],
        structuredContent: { success: true, count: 5, items: ["a", "b"] },
      });
    });
  });

  describe("resultToResponse", () => {
    it("calls formatter for Ok result", () => {
      const result: Result<number, string> = Ok(42);
      const response = resultToResponse(result, (value) =>
        textResponse(`The answer is ${value}`)
      );
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "The answer is 42" }],
      });
    });

    it("returns error response for Err with string", () => {
      const result: Result<number, string> = Err("not found");
      const response = resultToResponse(result, (value) =>
        textResponse(`The answer is ${value}`)
      );
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Error: not found" }],
        structuredContent: { success: false, error: "not found" },
      });
    });

    it("returns error response for Err with Error object", () => {
      const result: Result<number, Error> = Err(new Error("operation failed"));
      const response = resultToResponse(result, (value) =>
        textResponse(`The answer is ${value}`)
      );
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Error: operation failed" }],
        structuredContent: { success: false, error: "operation failed" },
      });
    });
  });

  describe("resultToStructuredResponse", () => {
    it("creates structured response for Ok result", () => {
      const result: Result<{ name: string; count: number }, string> = Ok({
        name: "test",
        count: 5,
      });
      const response = resultToStructuredResponse(result, (value) => ({
        text: `Found ${value.count} items for ${value.name}`,
        data: { itemCount: value.count, searchTerm: value.name },
      }));
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Found 5 items for test" }],
        structuredContent: { success: true, itemCount: 5, searchTerm: "test" },
      });
    });

    it("returns error response for Err result", () => {
      const result: Result<{ name: string }, string> = Err("database error");
      const response = resultToStructuredResponse(result, (value) => ({
        text: `Found ${value.name}`,
        data: { name: value.name },
      }));
      assert.deepStrictEqual(response, {
        content: [{ type: "text", text: "Error: database error" }],
        structuredContent: { success: false, error: "database error" },
      });
    });
  });
});
