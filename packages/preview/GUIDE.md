---
name: preview
tagline: "See what breaks BEFORE you edit."
---

# preview

**Impact prediction.** Type errors, affected callers, required tests.

## Start Here

```
preview_edit({ file: 'src/api.ts', symbol: 'fetchUser', new_content: '...' })
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Will this break? | Edit, check, undo | `preview_edit` predicts |
| What tests to run? | Guess | Included in preview |
| Who calls this? | Separate tool | Included in preview |

## Quick Reference

| Task | Tool |
|------|------|
| Preview any edit | `preview_edit` |

## Workflows

### Before Changing a Function
```
preview_edit({
  file: 'src/api.ts',
  edit_type: 'symbol',
  symbol: 'fetchUser',
  new_content: 'async function fetchUser(id: string, options?: Options) {...}'
})
```

Returns:
- Type errors that would result
- Callers that might need updates
- Tests to run after the change
- Risk assessment

### Preview Without Content
```
preview_edit({
  file: 'src/api.ts',
  edit_type: 'symbol',
  symbol: 'fetchUser'
})
```
Just shows impact analysis without predicting type errors.

## Avoid

The edit → check → undo → re-edit cycle. Preview first.
