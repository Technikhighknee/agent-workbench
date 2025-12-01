---
name: test-runner
description: "MANDATORY: Use INSTEAD of Bash npm test. Structured results, source-mapped failures. NEVER parse test output manually."
allowed-tools: mcp__test-runner__run_tests, mcp__test-runner__get_test_failures, mcp__test-runner__list_test_files, mcp__test-runner__rerun_failed
---

# test-runner

**Structured test execution.** Pass/fail status. Source-mapped stack traces.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Run all tests | `npm test` in Bash | `run_tests({})` |
| Run specific file | `npm test -- file.test.ts` | `run_tests({ files: ['file.test.ts'] })` |
| Run by pattern | `npm test -- -t "pattern"` | `run_tests({ testNamePattern: 'pattern' })` |
| See failure details | Parse Bash output | `get_test_failures({})` |
| Find test files | `Glob: **/*.test.ts` | `list_test_files({})` |
| Retry failures | Manual re-run | `rerun_failed({})` |

## WHY MANDATORY

1. **Structured results** - Pass/fail counts, not text parsing
2. **Source-mapped traces** - Real file locations, not compiled JS
3. **Better failures** - Expected vs actual values
4. **No timeout issues** - Runs until completion

## NEGATIVE RULES

- **NEVER** `Bash: npm test` - use `run_tests`
- **NEVER** parse test output with grep - use `get_test_failures`
- **NEVER** `Glob` for test files - use `list_test_files`
- **NEVER** manually re-run failed tests - use `rerun_failed`

## TOOL REFERENCE

| Tool | Purpose | Returns |
|------|---------|---------|
| `run_tests` | Execute tests | Pass/fail counts, failures |
| `get_test_failures` | Failure details | Error messages, locations |
| `list_test_files` | Find test files | Paths to test files |
| `rerun_failed` | Retry failures | Only failed tests |

## COMMON WORKFLOWS

### After Making Changes
```
run_tests({})
// Run all tests, get structured results
```

### Fix Failing Tests
```
run_tests({})
// Find failures
get_test_failures({})
// Get detailed failure info with source locations
// ... fix the code ...
rerun_failed({})
// Verify fix without running all tests
```

### Run Specific Tests
```
list_test_files({})
// See available test files
run_tests({ files: ['src/auth.test.ts'] })
// Run just auth tests
run_tests({ testNamePattern: 'should validate email' })
// Run tests matching pattern
```

### Debugging Test Failures
```
get_test_failures({})
// Returns:
// - Test name and file location
// - Error message
// - Expected vs actual values
// - Source-mapped stack trace
```

**Supports:** Vitest, Jest (auto-detected)
