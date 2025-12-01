# @agent-workbench/test-runner

Run tests and get structured results with source-mapped failures.

## When to Use

- After making code changes to verify nothing broke
- When debugging test failures - get exact source locations
- To iterate on fixes with `rerun_failed`

## Tools

### run_tests
Run tests and get structured results.

```
# Run all tests
run_tests()

# Run specific files
run_tests(files=["src/utils.test.ts"])

# Filter by test name
run_tests(testNamePattern="should handle errors")
```

### get_test_failures
Get detailed failure info from the last run.

Returns:
- Error message
- Expected vs actual values
- Stack trace with source locations

### rerun_failed
Rerun only failing tests. Faster iteration on fixes.

### list_test_files
List all test files in the project.

## Workflow

1. `run_tests()` - Run suite, get overview
2. `get_test_failures()` - See detailed failure info
3. Fix the code
4. `rerun_failed()` - Verify fix without full suite

## Framework Support

- **Vitest** - Detected via vitest in package.json
- **Jest** - Detected via jest in package.json
- **Node test runner** - Fallback for npm test script

JSON reporters used when available for structured output.
