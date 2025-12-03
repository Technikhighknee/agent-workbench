---
name: test-runner
tagline: "Know exactly what failed, where, and why."
---

# test-runner

**Structured test results.** No output parsing needed.

## Start Here

```
run_tests({})
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Run tests | `npm test` (raw output) | `run_tests` structured |
| Find failures | Parse console output | `get_test_failures` exact |
| Test for file | Guess which tests | `find_tests_for` smart |

## Quick Reference

| Task | Tool |
|------|------|
| Run all tests | `run_tests` |
| Run specific file | `run_tests` with files |
| Get failure details | `get_test_failures` |
| Rerun failed only | `rerun_failed` |
| Find tests for file | `find_tests_for` |
| Run related tests | `run_related_tests` |
| List test files | `list_test_files` |

## Workflows

### After Making Changes
```
run_related_tests({ source_file: 'src/auth.ts' })
```

### Fix Failing Tests
```
run_tests({})
get_test_failures({})  // Detailed failure info
// ... fix code ...
rerun_failed({})  // Only run what failed
```

### Find Tests for a File
```
find_tests_for({ source_file: 'src/utils.ts' })
```

## Supports

- Vitest (detected via package.json)
- Jest (detected via package.json)
- Node test runner (fallback)
