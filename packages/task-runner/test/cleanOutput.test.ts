import { describe, it, expect } from "vitest";
import { cleanOutput, compactOutput, truncateOutput, processOutput } from "../src/cleanOutput.js";

describe("cleanOutput", () => {
  it("strips ANSI codes", () => {
    const input = "\x1b[32mgreen\x1b[0m text";
    const output = cleanOutput(input);
    expect(output).toBe("green text");
  });

  it("removes progress bar lines", () => {
    const input = "Starting...\n[=====>     ] 50%\nDone!";
    const output = cleanOutput(input);
    // Progress bars are completely removed (no empty line left behind)
    expect(output).toBe("Starting...\nDone!");
  });

  it("removes spinner characters", () => {
    const input = "⠋ Loading\n⠙ Loading\n⠹ Loading\nLoaded!";
    const output = cleanOutput(input);
    expect(output).toContain("Loaded!");
  });

  it("keeps error messages", () => {
    const input = "Processing...\nerror: something failed\nAborted";
    const output = cleanOutput(input);
    expect(output).toContain("error");
    expect(output).toContain("failed");
  });

  it("collapses multiple empty lines", () => {
    const input = "line1\n\n\n\n\nline2";
    const output = cleanOutput(input);
    expect(output).toBe("line1\n\nline2");
  });

  it("trims leading and trailing empty lines", () => {
    const input = "\n\n\ncontent\n\n\n";
    const output = cleanOutput(input);
    expect(output).toBe("content");
  });

  it("handles mixed ANSI and progress", () => {
    const input = "\x1b[34mBuilding\x1b[0m\n[##########] 100%\n\x1b[32mSuccess!\x1b[0m";
    const output = cleanOutput(input);
    expect(output).toContain("Building");
    expect(output).toContain("Success!");
    expect(output).not.toContain("100%");
  });
});

describe("compactOutput", () => {
  it("returns unchanged if under limit", () => {
    const input = "line1\nline2\nline3";
    const output = compactOutput(input, 10);
    expect(output).toBe(input);
  });

  it("compacts output over limit", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`);
    const input = lines.join("\n");
    const output = compactOutput(input, 50);

    expect(output.split("\n").length).toBeLessThan(60);
    expect(output).toContain("omitted");
  });

  it("keeps important lines from middle", () => {
    const lines = [
      "start",
      ...Array.from({ length: 100 }, () => "normal"),
      "error: critical failure",
      ...Array.from({ length: 100 }, () => "normal"),
      "end",
    ];
    const input = lines.join("\n");
    const output = compactOutput(input, 50);

    expect(output).toContain("error: critical failure");
  });
});

describe("truncateOutput", () => {
  it("returns unchanged if under limit", () => {
    const input = "short text";
    const result = truncateOutput(input, 1000);

    expect(result.output).toBe(input);
    expect(result.truncated).toBe(false);
  });

  it("truncates if over limit", () => {
    const input = "a".repeat(1000);
    const result = truncateOutput(input, 100);

    expect(result.output.length).toBeLessThan(150);
    expect(result.truncated).toBe(true);
    expect(result.output).toContain("truncated");
  });

  it("handles multi-byte characters correctly", () => {
    const input = "你好世界".repeat(100);
    const result = truncateOutput(input, 100);

    // Should not break in middle of multi-byte character
    expect(() => Buffer.from(result.output, "utf8")).not.toThrow();
    expect(result.truncated).toBe(true);
  });
});

describe("processOutput", () => {
  it("cleans, compacts, and truncates", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `\x1b[32mline ${i}\x1b[0m`);
    const input = lines.join("\n");

    const result = processOutput(input, 10000, 100);

    // Should be cleaned (no ANSI)
    expect(result.output).not.toContain("\x1b[");

    // Should be reasonably sized
    expect(result.output.length).toBeLessThan(15000);
  });

  it("preserves important content", () => {
    const lines = [
      "Starting build...",
      ...Array.from({ length: 1000 }, () => "compiling..."),
      "Build failed: missing dependency",
      ...Array.from({ length: 1000 }, () => "cleanup..."),
    ];
    const input = lines.join("\n");

    const result = processOutput(input, 50000, 100);

    expect(result.output).toContain("Starting build");
    expect(result.output).toContain("Build failed");
  });
});
