---
name: test-runner
description: Run tests with structured results. Parse failures, map to source. Jest/Vitest/Node.
allowed-tools: mcp__test-runner__run_tests, mcp__test-runner__get_test_failures, mcp__test-runner__list_test_files, mcp__test-runner__rerun_failed
---

# test-runner

**Structured test results.** Run tests, get pass/fail with source locations. Fast iteration.

## Tools

| Tool | Purpose |
|------|---------|
| `run_tests` | Run tests, get structured results |
| `get_test_failures` | Detailed failure info with source locations |
| `list_test_files` | Discover test files |
| `rerun_failed` | Re-execute only failing tests |

## Quick Examples

```
run_tests({})                                    // Run all tests
run_tests({ files: ['src/utils.test.ts'] })      // Specific file
run_tests({ testNamePattern: 'should handle' })  // Filter by name

get_test_failures({})                            // After a run
rerun_failed({})                                 // Iterate on fixes
list_test_files({})                              // See what's available
```

## Workflow

1. `run_tests` - Get overview
2. `get_test_failures` - See detailed failures with locations
3. Fix the code
4. `rerun_failed` - Verify without full suite

**Supports:** Jest, Vitest, Node test runner. Auto-detects framework.
