# Agent Feedback

Observations, pain points, and improvement ideas gathered while working with agent-workbench.

---

## Session: 2025-12-01

### What Worked Well

1. **MCP Tool Discovery** - The `/mcp` command makes it easy to see available tools
2. **Skills System** - `.claude/skills/*/SKILL.md` provides good context for tool usage
3. **Multi-project TypeScript** - types package correctly handles monorepo structure
4. **Process Host** - `run_process` with no timeout is invaluable for builds/tests

### Pain Points Identified

1. **Cold Start Discovery** - When entering a new codebase, need to manually piece together:
   - What test framework is used
   - What build system is in place
   - Project conventions and patterns
   - The `project` MCP helps but could go deeper

2. **Test Runner Gaps**: ✅ FIXED
   - `list_test_files` returns empty when test patterns don't match (monorepo tests in packages/) → Added `**/test/**/*.ts` patterns
   - Status shows "FAILED" when exit code is non-zero even with 0 failed tests → Now based on `failed === 0`

3. **Types MCP Restart Required**: ✅ FIXED
   - New tsconfig.json files aren't discovered until restart → Added `reload` tool

4. **No Unified Search** - Finding "where is X handled" requires multiple grep/glob operations
   - Would benefit from semantic search or pre-indexed cross-references

### Ideas for Enhancement

#### High Value
- [x] **Workspace-aware test discovery** - Search packages/*/test for test files ✅
- [ ] **Semantic code search** - "Find error handling" without knowing exact patterns
- [x] **Manual reload** - `reload` tool to re-discover tsconfig.json files ✅
- [ ] **Unified "explain" tool** - Given a concept, find all related code

#### Medium Value
- [ ] **Test coverage integration** - Show which lines are covered
- [ ] **Dependency graph visualization** - Which packages depend on what
- [ ] **Breaking change detection** - Flag API changes that affect callers

#### Experimental
- [ ] **Learning from corrections** - Track when agent makes mistakes and patterns
- [ ] **Conversation context** - Remember findings across sessions
- [ ] **Proactive suggestions** - "You're editing X, did you consider Y?"

---

## Session: 2025-12-01 (Continued)

### Fixes Implemented

1. **test-runner: Monorepo test discovery** (commit 1fc6e0f)
   - Added patterns: `**/test/**/*.ts`, `**/tests/**/*.ts`, `**/__tests__/**/*.ts`
   - Now finds `packages/*/test/smoke.ts` files

2. **test-runner: Success status logic** (commit d58225c)
   - Changed from `success: exitCode === 0` to `success: failed === 0`
   - Exit code can be non-zero for skipped tests, warnings

3. **types: Reload capability** (commit 7009e91)
   - Added `reload()` method to re-discover tsconfig.json files
   - No restart needed when adding new packages

4. **test-runner: Skill file standardization** (commit f4693d7)
   - Added YAML frontmatter with allowed-tools
   - Consistent format with other skills

### Observations

- **MCP syntax tools are powerful** - `edit_symbol` is much more reliable than string matching
- **Skills with examples are essential** - Quick examples section helps understand tool usage
- **Result<T,E> pattern is duplicated** - 6 implementations across packages, could be shared

### Next Enhancement Candidates

1. **Shared core package** - Factor out Result<T,E>, common types
2. **Semantic search** - Index code for concept-based queries
3. **Health check tool** - Combined types + tests + git status

---

## Contributing Feedback

As you work with agent-workbench, add observations here:

```markdown
## Session: YYYY-MM-DD

### What Worked Well
- ...

### Pain Points Identified
- ...

### Ideas for Enhancement
- ...
```
