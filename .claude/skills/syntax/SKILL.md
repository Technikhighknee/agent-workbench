---
name: syntax
description: "MANDATORY: Use INSTEAD of Read/Edit/Grep for code. Edit by symbol name, not string matching. NEVER use Edit for functions."
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__get_imports, mcp__syntax__get_exports, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol, mcp__syntax__get_callers, mcp__syntax__get_callees, mcp__syntax__analyze_deps
---

# syntax

**Semantic code operations.** Read/write by symbol name. Never match text strings.

## MANDATORY SUBSTITUTIONS

| WHEN you want to... | NEVER use... | ALWAYS use... |
|---------------------|--------------|---------------|
| Read a function | `Read file.ts` then find it | `read_symbol({ file_path, name_path })` |
| Edit a function | `Edit` with string matching | `edit_symbol({ file_path, name_path, new_body })` |
| Find function definition | `Grep: function foo` | `search_symbols({ pattern: 'foo' })` |
| See file structure | `Read` entire file | `list_symbols({ file_path })` |
| Find all usages | `Grep` for symbol name | `find_references({ symbol_name })` |
| Rename across codebase | Multiple `Edit` calls | `rename_symbol({ old_name, new_name })` |

## WHY MANDATORY

1. **No string matching errors** - `edit_symbol` finds by name, not text
2. **Preserves formatting** - Tree-sitter parses properly
3. **Full context** - `read_symbol` gives the whole function, not partial
4. **Reliable refactoring** - `rename_symbol` handles all references

## NEGATIVE RULES

- **NEVER** `Read` a file just to find one function - use `list_symbols` then `read_symbol`
- **NEVER** `Edit` with `old_string` being function code - use `edit_symbol`
- **NEVER** `Grep` for "function foo" - use `search_symbols`
- **NEVER** manually rename across files - use `rename_symbol`

## TOOL REFERENCE

| Tool | Purpose | When to use |
|------|---------|-------------|
| `list_symbols` | See file structure | Before reading/editing - know what's there |
| `read_symbol` | Get one symbol's code | Need to understand a specific function/class |
| `edit_symbol` | Replace symbol body | Modifying any function, method, or class |
| `edit_lines` | Replace by line range | Non-symbol edits (comments, imports) |
| `get_imports` | List file imports | Understand dependencies |
| `get_exports` | List file exports | Understand module API |
| `search_symbols` | Find symbols by pattern | Locate functions across codebase |
| `find_references` | Find all usages | Before refactoring - understand impact |
| `rename_symbol` | Rename across codebase | Safe renaming with all references |
| `get_callers` | Who calls this? | Impact analysis |
| `get_callees` | What does this call? | Understand dependencies |
| `analyze_deps` | Circular imports? | Architecture analysis |

## WORKFLOW EXAMPLES

### Modify a Function
```
1. list_symbols({ file_path: 'src/utils.ts' })     // See what's there
2. read_symbol({ file_path: 'src/utils.ts', name_path: 'formatDate' })  // Read it
3. edit_symbol({ file_path: 'src/utils.ts', name_path: 'formatDate', new_body: '...' })  // Change it
```

### Find and Fix a Bug
```
1. search_symbols({ pattern: 'validate' })         // Find all validators
2. read_symbol({ file_path, name_path })           // Read the broken one
3. find_references({ symbol_name: 'validateEmail' }) // See where it's used
4. edit_symbol({ file_path, name_path, new_body }) // Fix it
```

### Safe Refactoring
```
1. find_references({ symbol_name: 'oldName' })     // See all usages
2. rename_symbol({ old_name: 'oldName', new_name: 'newName', dry_run: true })  // Preview
3. rename_symbol({ old_name: 'oldName', new_name: 'newName' })  // Execute
```

### Understand Architecture
```
1. analyze_deps({})                                // Check for circular deps
2. get_callers({ symbol_name: 'saveUser' })        // Who depends on this?
3. get_callees({ file_path, symbol_name_path })    // What does this depend on?
```

## COMPLEMENT TO GRAPH

| If you need... | Use... |
|----------------|--------|
| Edit code | `mcp__syntax__*` tools |
| Trace call chains across files | `mcp__graph__*` tools |
| Local callers/callees | `mcp__syntax__get_callers/get_callees` |
| Deep call chain analysis | `mcp__graph__graph_trace` |

**Supports:** TypeScript, JavaScript, Python (more languages coming)
