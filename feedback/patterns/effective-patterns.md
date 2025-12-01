# Effective Patterns

Patterns that work well when using agent-workbench MCPs.

## 1. Project Orientation

```
1. mcp__project__get_project_info  → understand project type
2. mcp__project__find_configs      → find configuration
3. mcp__types__get_diagnostics     → check code health
```

## 2. Code Exploration

```
1. mcp__syntax__list_symbols       → understand file structure
2. mcp__syntax__read_symbol        → read specific functions
3. mcp__types__go_to_definition    → follow dependencies
```

## 3. Safe Code Changes

```
1. Read file with Read tool
2. mcp__syntax__edit_symbol        → modify by name (not string match)
3. mcp__types__get_diagnostics     → verify no new errors
4. mcp__test-runner__run_tests     → run affected tests
```

## 4. Test-Driven Fixes

```
1. mcp__test-runner__run_tests     → find failures
2. mcp__test-runner__get_test_failures → get details
3. Fix code
4. mcp__test-runner__rerun_failed  → verify fix
```

## 5. PR Preparation

```
1. mcp__history__branch_diff       → understand scope
2. mcp__types__get_diagnostics     → no type errors
3. mcp__test-runner__run_tests     → tests pass
```

## Anti-Patterns

1. **Don't use Edit for function changes** - Use edit_symbol instead
2. **Don't skip diagnostics after edits** - Type errors sneak in
3. **Don't forget to reload types** - After adding new files
