---
name: syntax
tagline: "Edits that never fail. Find functions by name, not text matching."
---

# syntax

**Edit code by function name, not text matching.** The Edit tool fails when text isn't unique. This never does.

## Start Here

Before any edit, know what's in the file:
```
list_symbols({ file_path: 'src/api.ts' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Edit a function | Edit fails if code appears twice | `edit_symbol` finds by AST |
| Find definition | Grep matches comments/strings | `search_symbols` finds actual symbols |
| Rename everywhere | Miss references, break imports | `rename_symbol` handles all refs |
| Move file | Broken imports everywhere | `move_file` updates all imports |

## Quick Reference

| Task | Tool |
|------|------|
| See file structure | `list_symbols` |
| Read one function | `read_symbol` |
| Change a function | `edit_symbol` |
| Change multiple atomically | `batch_edit_symbols` |
| Find a symbol | `search_symbols` |
| Find all usages | `find_references` |
| Rename everywhere | `rename_symbol` |
| Move file safely | `move_file` |
| Move function | `move_symbol` |
| Who calls this? | `get_callers` |
| What does this call? | `get_callees` |
| Trace call chains | `trace` |
| Find dead code | `find_dead_code` |

## Workflows

### Edit a Function
```
list_symbols({ file_path: 'src/utils.ts' })
read_symbol({ file_path: 'src/utils.ts', name_path: 'formatDate' })
edit_symbol({ file_path: 'src/utils.ts', name_path: 'formatDate', new_body: '...' })
```

### Edit Multiple Symbols Atomically
```
batch_edit_symbols({
  edits: [
    { file_path: 'src/api.ts', name_path: 'fetchUser', new_body: '...' },
    { file_path: 'src/handlers.ts', name_path: 'handleUser', new_body: '...' }
  ],
  dry_run: true  // Preview first
})
```

### Safe Rename
```
rename_symbol({ old_name: 'oldName', new_name: 'newName', dry_run: true })
rename_symbol({ old_name: 'oldName', new_name: 'newName' })
```

### Move File Without Breaking Imports
```
move_file({ source: 'src/utils.ts', destination: 'src/lib/utils.ts', dry_run: true })
```

## After Using

1. `types.check_file()` - verify no type errors
2. `test-runner.run_tests()` - verify behavior unchanged

## Languages

TypeScript, JavaScript, Python, Go, Rust
