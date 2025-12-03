---
name: test-runner
description: "Know exactly what failed, where, and why. No output parsing."
allowed-tools: mcp__test-runner__run_tests, mcp__test-runner__get_test_failures, mcp__test-runner__list_test_files, mcp__test-runner__rerun_failed, mcp__test-runner__find_tests_for, mcp__test-runner__run_related_tests
---

# test-runner

**Tests that tell you WHAT failed, WHERE (with source maps), and WHY (expected vs actual).**

## First: run_tests

After any code change:
```
run_tests({})
```

## Why This Wins

| The Problem | Built-in Failure | test-runner Solution |
|-------------|------------------|----------------------|
| Run tests | npm test output needs parsing | `run_tests` returns structured pass/fail |
| Find failures | Scroll through output | `get_test_failures` gives exact locations |
| Stack traces | Point to compiled JS | Source-mapped to your TypeScript |
| Rerun failed | Remember which failed | `rerun_failed` handles it |

## Quick Reference

| Task | Tool |
|------|------|
| Run all tests | `run_tests({})` |
| Run specific file | `run_tests({ files: ['auth.test.ts'] })` |
| Run by name | `run_tests({ testNamePattern: 'email' })` |
| **Find tests for a source file** | `find_tests_for({ source_file: 'src/api.ts' })` |
| **Run tests for a source file** | `run_related_tests({ source_file: 'src/api.ts' })` |
| Get failure details | `get_test_failures({})` |
| Retry failures only | `rerun_failed({})` |
| Find test files | `list_test_files({})` |

## Common Workflows

### Smart Edit-Test Cycle (Recommended)
```
// BEFORE editing - know what tests exist
find_tests_for({ source_file: 'src/api.ts' })

// ... make your changes ...

// AFTER editing - run only the relevant tests (fast!)
run_related_tests({ source_file: 'src/api.ts' })
```
**Why this workflow?**
- `find_tests_for` tells you what's covered BEFORE you edit
- `run_related_tests` is faster than `run_tests({})` - only runs relevant tests
- Multiple discovery strategies: naming convention, import analysis, co-location

### After Making Changes
```
run_tests({})
```

### Fixing Failing Tests
```
run_tests({})
get_test_failures({})  // Shows expected vs actual, source locations
// ... fix code ...
rerun_failed({})  // Verify fix without running all tests
```

### Run Specific Tests
```
run_tests({ files: ['src/auth.test.ts'] })
run_tests({ testNamePattern: 'should validate' })
```

### Targeted Testing After Edits
```
// Edited server.ts? Find and run its tests:
run_related_tests({ source_file: 'src/server.ts' })
```

## Integration

Run `run_tests` after using `syntax.edit_symbol` and `types.get_diagnostics` to verify behavior unchanged.

## Supports
Vitest, Jest (auto-detected)
