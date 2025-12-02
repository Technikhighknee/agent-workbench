---
name: syntax
description: "MANDATORY: Use INSTEAD of Read/Edit/Grep for code. Edit by symbol name, not string matching. NEVER use Edit for functions."
allowed-tools: mcp__syntax__list_symbols, mcp__syntax__read_symbol, mcp__syntax__edit_symbol, mcp__syntax__edit_lines, mcp__syntax__get_imports, mcp__syntax__get_exports, mcp__syntax__add_import, mcp__syntax__remove_unused_imports, mcp__syntax__organize_imports, mcp__syntax__search_symbols, mcp__syntax__find_references, mcp__syntax__rename_symbol, mcp__syntax__get_callers, mcp__syntax__get_callees, mcp__syntax__analyze_deps, mcp__syntax__move_file, mcp__syntax__move_symbol, mcp__syntax__extract_function, mcp__syntax__inline_function, mcp__syntax__find_unused_exports, mcp__syntax__apply_edits, mcp__syntax__trace, mcp__syntax__find_paths, mcp__syntax__find_dead_code
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
| Move file | Manual move + fix imports | `move_file({ source, destination })` |
| Move function to another file | Manual copy/paste + fix imports | `move_symbol({ source_file, symbol_name, destination_file })` |
| Extract code to function | Manual refactoring | `extract_function({ file_path, start_line, end_line, function_name })` |
| Find dead code | Manual search | `find_unused_exports({})` |
| Edit multiple files atomically | Multiple `Edit` calls | `apply_edits({ edits: [...] })` |

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
| `add_import` | Add/merge import | After moving/creating code |
| `remove_unused_imports` | Clean up imports | After refactoring |
| `organize_imports` | Sort and group imports | Clean up messy files |
| `search_symbols` | Find symbols by pattern | Locate functions across codebase |
| `find_references` | Find all usages | Before refactoring - understand impact |
| `rename_symbol` | Rename across codebase | Safe renaming with all references |
| `get_callers` | Who calls this? | Impact analysis |
| `get_callees` | What does this call? | Understand dependencies |
| `analyze_deps` | Circular imports? | Architecture analysis |
| `move_file` | Move file + update imports | Reorganize codebase safely |
| `move_symbol` | Move function/class to another file | Extract to separate module |
| `extract_function` | Extract lines into new function | Reduce complexity |
| `inline_function` | Replace call with function body | Eliminate indirection |
| `find_unused_exports` | Find unused exports | Clean up dead code |
| `apply_edits` | Multi-file atomic edits | Batch changes with rollback |
| `trace` | Follow call chains | Trace forward/backward from any symbol |
| `find_paths` | All paths A→B | Security audits, data flow analysis |
| `find_dead_code` | Find unreachable functions | Deep dead code detection via call graph |

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

### Move/Reorganize Files
```
1. move_file({ source: 'src/utils.ts', destination: 'src/lib/utils.ts', dry_run: true })  // Preview
2. move_file({ source: 'src/utils.ts', destination: 'src/lib/utils.ts' })  // Execute (updates all imports)
```

### Move Function to Another File
```
1. move_symbol({ source_file: 'src/utils.ts', symbol_name: 'formatDate', destination_file: 'src/dateUtils.ts', dry_run: true })  // Preview
2. move_symbol({ source_file: 'src/utils.ts', symbol_name: 'formatDate', destination_file: 'src/dateUtils.ts' })  // Execute
```

### Extract Code to New Function
```
1. extract_function({ file_path: 'src/handler.ts', start_line: 45, end_line: 60, function_name: 'validateInput', dry_run: true })  // Preview
2. extract_function({ file_path: 'src/handler.ts', start_line: 45, end_line: 60, function_name: 'validateInput' })  // Execute
```

### Inline a Function Call
```
1. inline_function({ file_path: 'src/handler.ts', line: 23, dry_run: true })  // Preview
2. inline_function({ file_path: 'src/handler.ts', line: 23 })  // Execute (replaces call with body)
```

### Find Dead Code
```
1. find_unused_exports({})  // Find all unused exports across codebase
2. find_unused_exports({ file_pattern: 'src/**/*.ts' })  // Limit to specific files
```

### Clean Up Imports After Refactoring
```
1. remove_unused_imports({ file_path: 'src/handler.ts', dry_run: true })  // Preview
2. remove_unused_imports({ file_path: 'src/handler.ts' })  // Remove unused
3. organize_imports({ file_path: 'src/handler.ts' })  // Sort and group
```

### Add an Import
```
add_import({ file_path: 'src/handler.ts', source: './utils', names: ['formatDate', 'parseDate'] })
```

### Apply Multiple Edits Atomically
```
apply_edits({
  edits: [
    { file_path: 'src/api.ts', old_string: 'oldName', new_string: 'newName' },
    { file_path: 'src/types.ts', old_string: 'oldName', new_string: 'newName' },
    { file_path: 'src/tests.ts', old_string: 'oldName', new_string: 'newName', replace_all: true }
  ],
  dry_run: true  // Preview first
})
// All validated before apply, rollback on failure
```

## CALL GRAPH ANALYSIS

| Tool | Purpose | When to use |
|------|---------|-------------|
| `get_callers` | Who calls this? | Impact analysis before changes |
| `get_callees` | What does this call? | Understand function dependencies |
| `trace` | Follow call chains | Trace data/control flow through codebase |
| `find_paths` | All paths A→B | Security audits, understand how code connects |
| `find_dead_code` | Find unreachable functions | Clean up after refactoring |

### Trace Call Chains
```
trace({ symbol: 'handleRequest', direction: 'backward', depth: 3 })  // Who calls this?
trace({ symbol: 'saveToDb', direction: 'forward', depth: 5 })  // What does this call?
```

### Find Paths Between Symbols
```
find_paths({ from: 'parseInput', to: 'executeQuery', max_depth: 10 })  // Security audit
```

### Find Dead Code
```
find_dead_code({})  // Find all unreachable functions
find_dead_code({ file_pattern: 'src/.*\\.ts' })  // Limit scope
```

**Supports:** TypeScript, JavaScript, Python (more languages coming)
