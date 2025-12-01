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

2. **Test Runner Gaps**:
   - `list_test_files` returns empty when test patterns don't match (monorepo tests in packages/)
   - Status shows "FAILED" when exit code is non-zero even with 0 failed tests (skipped tests cause non-zero exit)

3. **Types MCP Restart Required** - New tsconfig.json files aren't discovered until restart

4. **No Unified Search** - Finding "where is X handled" requires multiple grep/glob operations
   - Would benefit from semantic search or pre-indexed cross-references

### Ideas for Enhancement

#### High Value
- [ ] **Workspace-aware test discovery** - Search packages/*/test for test files
- [ ] **Semantic code search** - "Find error handling" without knowing exact patterns
- [ ] **Auto-restart/reload** - Watch for tsconfig.json changes
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
