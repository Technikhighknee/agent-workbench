/**
 * Quality Audit Script
 *
 * Checks all packages for quality issues:
 * - Large files (potential monoliths)
 * - Inconsistent patterns
 * - Code organization issues
 */

import { glob } from "glob";
import { readFileSync, statSync } from "fs";
import { basename, dirname, relative } from "path";

interface AuditResult {
  file: string;
  issues: string[];
  metrics: {
    lines: number;
    exports: number;
    functions: number;
  };
}

interface PackageAudit {
  name: string;
  files: AuditResult[];
  summary: {
    totalFiles: number;
    largeFiles: number;
    issueCount: number;
  };
}

const THRESHOLDS = {
  maxFileLines: 400,
  maxFunctions: 15,
  maxExports: 20,
};

async function auditFile(filePath: string): Promise<AuditResult> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const issues: string[] = [];

  // Count exports
  const exportMatches = content.match(/^export\s+(const|function|class|interface|type|enum)/gm) || [];
  const exportCount = exportMatches.length;

  // Count functions/methods
  const functionMatches = content.match(/^\s*(async\s+)?function\s+\w+|^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[:{]/gm) || [];
  const functionCount = functionMatches.length;

  // Check for issues
  if (lines.length > THRESHOLDS.maxFileLines) {
    issues.push(`Large file: ${lines.length} lines (threshold: ${THRESHOLDS.maxFileLines})`);
  }

  if (exportCount > THRESHOLDS.maxExports) {
    issues.push(`Too many exports: ${exportCount} (threshold: ${THRESHOLDS.maxExports})`);
  }

  if (functionCount > THRESHOLDS.maxFunctions) {
    issues.push(`Too many functions: ${functionCount} (threshold: ${THRESHOLDS.maxFunctions})`);
  }

  // Check for common anti-patterns
  if (content.includes("// TODO") || content.includes("// FIXME")) {
    const todoCount = (content.match(/\/\/\s*(TODO|FIXME)/g) || []).length;
    issues.push(`Has ${todoCount} TODO/FIXME comments`);
  }

  // Check for any/unknown abuse
  const anyCount = (content.match(/:\s*any\b/g) || []).length;
  if (anyCount > 5) {
    issues.push(`Excessive 'any' types: ${anyCount}`);
  }

  // Check for console.log (should use proper logging)
  if (content.includes("console.log") && !filePath.includes("test")) {
    issues.push("Contains console.log (use proper logging)");
  }

  return {
    file: filePath,
    issues,
    metrics: {
      lines: lines.length,
      exports: exportCount,
      functions: functionCount,
    },
  };
}

async function auditPackage(packagePath: string): Promise<PackageAudit> {
  const name = basename(packagePath);
  const srcPath = `${packagePath}/src`;

  const files = await glob(`${srcPath}/**/*.ts`, {
    ignore: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
  });

  const results: AuditResult[] = [];
  let issueCount = 0;
  let largeFiles = 0;

  for (const file of files) {
    const result = await auditFile(file);
    results.push(result);
    issueCount += result.issues.length;
    if (result.metrics.lines > THRESHOLDS.maxFileLines) {
      largeFiles++;
    }
  }

  // Sort by issue count (most issues first)
  results.sort((a, b) => b.issues.length - a.issues.length);

  return {
    name,
    files: results,
    summary: {
      totalFiles: files.length,
      largeFiles,
      issueCount,
    },
  };
}

async function main() {
  console.log("🔍 Quality Audit Report\n");
  console.log("=".repeat(60));

  const packages = await glob("packages/*", { onlyDirectories: true });
  const audits: PackageAudit[] = [];

  for (const pkg of packages.sort()) {
    const audit = await auditPackage(pkg);
    audits.push(audit);
  }

  // Summary table
  console.log("\n📊 Package Summary\n");
  console.log("Package          Files  Large  Issues");
  console.log("-".repeat(45));

  for (const audit of audits) {
    const name = audit.name.padEnd(16);
    const files = String(audit.summary.totalFiles).padStart(5);
    const large = String(audit.summary.largeFiles).padStart(6);
    const issues = String(audit.summary.issueCount).padStart(7);
    console.log(`${name}${files}${large}${issues}`);
  }

  // Detailed issues
  console.log("\n\n📋 Detailed Issues\n");

  for (const audit of audits) {
    const filesWithIssues = audit.files.filter((f) => f.issues.length > 0);
    if (filesWithIssues.length === 0) continue;

    console.log(`\n[${audit.name}]`);
    for (const file of filesWithIssues) {
      const relPath = relative(process.cwd(), file.file);
      console.log(`  ${relPath} (${file.metrics.lines} lines)`);
      for (const issue of file.issues) {
        console.log(`    ⚠️  ${issue}`);
      }
    }
  }

  // Large files list for refactoring
  console.log("\n\n🔨 Files to Refactor (by size)\n");

  const allLargeFiles = audits
    .flatMap((a) => a.files)
    .filter((f) => f.metrics.lines > THRESHOLDS.maxFileLines)
    .sort((a, b) => b.metrics.lines - a.metrics.lines);

  for (const file of allLargeFiles.slice(0, 15)) {
    const relPath = relative(process.cwd(), file.file);
    console.log(`  ${file.metrics.lines.toString().padStart(4)} lines: ${relPath}`);
  }

  // Return exit code based on issues
  const totalIssues = audits.reduce((sum, a) => sum + a.summary.issueCount, 0);
  console.log(`\n\nTotal issues found: ${totalIssues}`);

  return totalIssues > 0 ? 1 : 0;
}

main().catch(console.error);
