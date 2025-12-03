---
name: insight
tagline: "Understand code in one call."
---

# insight

**Comprehensive understanding.** Structure, relationships, history - all at once.

## Start Here

```
insight({ target: 'src/server.ts' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Understand file | 5+ tool calls | `insight` one call |
| Find dependencies | Manual search | Included in insight |
| Recent changes | Separate git call | Included in insight |

## Quick Reference

| Task | Tool |
|------|------|
| Understand anything | `insight` |
| Suggest improvements | `suggest_refactoring` |

## Workflows

### Understand a File
```
insight({ target: 'src/server.ts' })
```
Returns: symbols, imports, exports, who imports it, git history

### Understand a Directory
```
insight({ target: 'src/utils' })
```
Returns: entry points, all files, key symbols, dependencies

### Understand a Symbol
```
insight({ target: 'UserService' })
```
Returns: code, signature, callers, callees, git history

### Find Improvements
```
suggest_refactoring({ target: 'src/handlers.ts' })
```
Detects: long functions, large files, high coupling, unused code

## Replaces

Multiple tool calls:
- `list_symbols` + `get_imports` + `get_exports` + `file_history` + `find_references`

→ One `insight` call
