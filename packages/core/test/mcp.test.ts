import { describe, it, expect } from "vitest";
import {
  textResponse,
  errorResponse,
  successResponse,
  resultToResponse,
  resultToStructuredResponse,
} from "../src/mcp.js";
import { Ok, Err } from "../src/result.js";

describe("MCP utilities", () => {
  describe("textResponse", () => {
    it("creates a text-only response", () => {
      const response = textResponse("Hello, world!");
      expect(response).toEqual({
        content: [{ type: "text", text: "Hello, world!" }],
      });
    });

    it("handles empty string", () => {
      const response = textResponse("");
      expect(response.content[0].text).toBe("");
    });

    it("preserves multiline text", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const response = textResponse(text);
      expect(response.content[0].text).toBe(text);
    });
  });

  describe("errorResponse", () => {
    it("creates error response with message", () => {
      const response = errorResponse("Something went wrong");
      expect(response).toEqual({
        content: [{ type: "text", text: "Error: Something went wrong" }],
        structuredContent: { success: false, error: "Something went wrong" },
      });
    });

    it("prefixes text with Error:", () => {
      const response = errorResponse("test");
      expect(response.content[0].text).toBe("Error: test");
    });

    it("has success: false in structured content", () => {
      const response = errorResponse("test");
      expect(response.structuredContent?.success).toBe(false);
    });
  });

  describe("successResponse", () => {
    it("creates success response with text only", () => {
      const response = successResponse("Operation completed");
      expect(response).toEqual({
        content: [{ type: "text", text: "Operation completed" }],
        structuredContent: { success: true },
      });
    });

    it("creates success response with structured data", () => {
      const response = successResponse("Found 5 items", { count: 5, items: ["a", "b"] });
      expect(response).toEqual({
        content: [{ type: "text", text: "Found 5 items" }],
        structuredContent: { success: true, count: 5, items: ["a", "b"] },
      });
    });

    it("always includes success: true", () => {
      const response = successResponse("test", { foo: "bar" });
      expect(response.structuredContent?.success).toBe(true);
    });
  });

  describe("resultToResponse", () => {
    it("formats Ok result using formatter", () => {
      const result = Ok(42);
      const response = resultToResponse(result, (value) => textResponse(`Value: ${value}`));
      expect(response).toEqual({
        content: [{ type: "text", text: "Value: 42" }],
      });
    });

    it("converts Err string to error response", () => {
      const result = Err("failed");
      const response = resultToResponse(result, () => textResponse("unused"));
      expect(response).toEqual({
        content: [{ type: "text", text: "Error: failed" }],
        structuredContent: { success: false, error: "failed" },
      });
    });

    it("extracts message from Error objects", () => {
      const result = Err(new Error("error message"));
      const response = resultToResponse(result, () => textResponse("unused"));
      expect(response).toEqual({
        content: [{ type: "text", text: "Error: error message" }],
        structuredContent: { success: false, error: "error message" },
      });
    });
  });

  describe("resultToStructuredResponse", () => {
    it("formats Ok result with text and data", () => {
      const result = Ok({ items: [1, 2, 3] });
      const response = resultToStructuredResponse(result, (value) => ({
        text: `Found ${value.items.length} items`,
        data: { count: value.items.length, items: value.items },
      }));
      expect(response).toEqual({
        content: [{ type: "text", text: "Found 3 items" }],
        structuredContent: { success: true, count: 3, items: [1, 2, 3] },
      });
    });

    it("converts Err to error response", () => {
      const result = Err("not found");
      const response = resultToStructuredResponse(result, () => ({
        text: "unused",
        data: { unused: true },
      }));
      expect(response).toEqual({
        content: [{ type: "text", text: "Error: not found" }],
        structuredContent: { success: false, error: "not found" },
      });
    });

    it("extracts message from Error objects", () => {
      const result = Err(new Error("detailed error"));
      const response = resultToStructuredResponse(result, () => ({
        text: "unused",
        data: {},
      }));
      expect(response.structuredContent).toEqual({
        success: false,
        error: "detailed error",
      });
    });
  });
});
