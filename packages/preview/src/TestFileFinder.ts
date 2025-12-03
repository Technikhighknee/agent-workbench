/**
 * Test file discovery for preview analysis.
 * Finds related test files using multiple strategies.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";

/**
 * A test file related to source code.
 */
export interface FoundTest {
  file: string;
  reason: string;
}

/**
 * Test file finder with caching.
 */
export class TestFileFinder {
  private rootPath: string;
  private testFileCache = new Map<string, boolean>();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Build cache of all test files in the project.
   */
  buildCache(): void {
    this.testFileCache.clear();
    this.scanDirectory(this.rootPath);
  }

  /**
   * Find tests related to a source file.
   */
  findRelatedTests(filePath: string, maxTests: number): FoundTest[] {
    const tests: FoundTest[] = [];
    const relativePath = relative(this.rootPath, filePath);
    const fileName = basename(filePath, ".ts").replace(/\.tsx?$/, "");
    const dirName = dirname(relativePath);

    // Strategy 1: Same name pattern (foo.ts -> foo.test.ts)
    const testPatterns = [
      `${fileName}.test.ts`,
      `${fileName}.test.tsx`,
      `${fileName}.spec.ts`,
      `${fileName}.spec.tsx`,
      `${fileName}_test.ts`,
    ];

    for (const pattern of testPatterns) {
      const testPath = join(dirName, pattern);
      if (this.testFileCache.has(testPath)) {
        tests.push({
          file: testPath,
          reason: "Same name pattern",
        });
      }
    }

    // Strategy 2: Package-level test directory
    const srcIndex = relativePath.indexOf("/src/");
    if (srcIndex !== -1) {
      const packagePath = relativePath.substring(0, srcIndex);
      const packageTestPatterns = [
        join(packagePath, "test", `${fileName}.test.ts`),
        join(packagePath, "test", `${fileName}.spec.ts`),
        join(packagePath, "tests", `${fileName}.test.ts`),
        join(packagePath, "__tests__", `${fileName}.test.ts`),
      ];

      for (const pattern of packageTestPatterns) {
        if (this.testFileCache.has(pattern) && !tests.some((t) => t.file === pattern)) {
          tests.push({
            file: pattern,
            reason: "Package test directory",
          });
        }
      }
    }

    // Strategy 3: Test file in same directory or test subdirectory
    const allTests = Array.from(this.testFileCache.keys());
    for (const testFile of allTests) {
      if (tests.length >= maxTests) break;

      const testDir = dirname(testFile);
      if (
        testDir === dirName ||
        testDir === join(dirName, "test") ||
        testDir === join(dirName, "__tests__")
      ) {
        if (!tests.some((t) => t.file === testFile)) {
          tests.push({
            file: testFile,
            reason: "Same directory",
          });
        }
      }
    }

    return tests.slice(0, maxTests);
  }

  /**
   * Deduplicate tests by file path.
   */
  deduplicateTests(tests: FoundTest[]): FoundTest[] {
    const seen = new Set<string>();
    return tests.filter((t) => {
      if (seen.has(t.file)) return false;
      seen.add(t.file);
      return true;
    });
  }

  /**
   * Recursively scan for test files.
   */
  private scanDirectory(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules" &&
            entry.name !== "dist"
          ) {
            this.scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          if (
            entry.name.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/) ||
            entry.name.match(/_test\.(ts|tsx|js|jsx)$/)
          ) {
            const relativePath = relative(this.rootPath, fullPath);
            this.testFileCache.set(relativePath, true);
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
}
