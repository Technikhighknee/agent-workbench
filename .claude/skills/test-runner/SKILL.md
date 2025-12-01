---
name: test-runner
description: "MANDATORY: Use INSTEAD of Bash npm test. Structured results, source-mapped failures. NEVER parse test output manually."
allowed-tools: mcp__test-runner__run_tests, mcp__test-runner__get_test_failures, mcp__test-runner__list_test_files, mcp__test-runner__rerun_failed
---

# test-runner

**Structured test results.** Run tests, get pass/fail with source locations. Fast iteration.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Run all tests | `Bash: npm test` | `run_tests({})` |
| Run specific test file | `Bash: npm test -- file` | `run_tests({ files: ['src/foo.test.ts'] })` |
| Run tests by name pattern | `Bash: npm test -- --grep` | `run_tests({ testNamePattern: 'should handle' })` |
| See why tests failed | Parse Bash output | `get_test_failures({})` |
| Re-run only failures | `Bash: npm test` again | `rerun_failed({})` |
| Find test files | `Glob: **/*.test.ts` | `list_test_files({})` |

## WHY MANDATORY

- `run_tests` returns **STRUCTURED results** - pass/fail counts, names, locations
- `get_test_failures` gives **SOURCE-MAPPED stack traces** pointing to exact lines
- `rerun_failed` is **FASTER** - only reruns what failed, not entire suite
- `Bash: npm test` returns **raw text** with ANSI codes requiring manual parsing

## NEGATIVE RULES

- **NEVER** use `Bash: npm test` - use `run_tests`
- **NEVER** parse test output manually - use `get_test_failures`
- **NEVER** re-run full suite after fix - use `rerun_failed`
- **NEVER** use `Glob` for test files - use `list_test_files`

## MANDATORY WORKFLOW

```
1. run_tests({})              // Run all tests
2. get_test_failures({})      // See detailed failures with source locations
3. Fix the code
4. rerun_failed({})           // Verify fix without full suite
5. Repeat 3-4 until green
```

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

**Supports:** Jest, Vitest, Node test runner. Auto-detects framework.
