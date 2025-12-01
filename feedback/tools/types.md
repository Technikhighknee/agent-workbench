# types MCP Feedback

## get_diagnostics

**Works well:**
- Returns structured data with file/line/column - easy to navigate to issues
- Severity levels (error, warning, hint) help prioritize
- Summary counts are useful for progress tracking

**Pain points:**
- Hints can be noisy (39 hints obscure actual errors)
- No way to filter by code (e.g., only TS6133 unused imports)
- Stale after file edits until reload

**Suggestions:**
- Add `codes` filter parameter to focus on specific diagnostic codes
- Add `errors_only` as default true (currently need to specify)

---

## reload

**Works well:**
- Essential for monorepos - picks up new tsconfig.json without restart
- Returns useful info (project count, file count)

**Pain points:**
- None observed

---

## get_type_at_position

**Works well:**
- Hover info is accurate and detailed
- Shows full type signatures

**Pain points:**
- Need to know exact line/column - no fuzzy matching
- Would be useful to accept symbol name instead of position

---

## go_to_definition

**Works well:**
- Finds definitions across packages correctly

**Pain points:**
- Returns single result - sometimes want all definitions (overloads)
