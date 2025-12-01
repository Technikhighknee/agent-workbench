# test-runner MCP Feedback

## run_tests

**Works well:**
- Structured results with pass/fail counts
- Duration tracking per test
- Failure messages are detailed

**Pain points:**
- Only works with detected framework (Jest/Vitest/Node test)
- No way to pass custom test command

**Suggestions:**
- Add `command` parameter to override auto-detection

---

## list_test_files

**Works well:**
- Finds test files matching common patterns
- Works in monorepos after pattern fix

**Pain points:**
- Initially missed `packages/*/test/` patterns (now fixed)
- Pattern configuration is in adapter, not easily customizable

---

## get_test_failures

**Works well:**
- Detailed failure info with expected/actual
- Stack traces with source mapping
- File locations for quick navigation

**Pain points:**
- None observed

---

## rerun_failed

**Works well:**
- Fast iteration on fixes
- Only runs what failed

**Pain points:**
- None observed
