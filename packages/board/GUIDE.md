---
name: board
tagline: "Track work across sessions. Persistent kanban for agents."
---

# board

**Remember what you're working on.** Tasks persist across sessions.

## Start Here

```
board_list({})
```

## Why This Package

| Problem | Old Way | This Package |
|---------|---------|--------------|
| Track complex tasks | TodoWrite (session only) | `board` persists to disk |
| Resume after restart | Lost context | Cards survive restarts |
| Prioritize work | Mental notes | Priority + labels + lists |

## Quick Reference

| Task | Tool |
|------|------|
| See all cards | `board_list` |
| Create card | `board_add` |
| Update card | `board_update` |
| Move to list | `board_move` |
| Get card details | `board_get` |
| Delete card | `board_delete` |

## Workflows

### Start a Session
```
board_list({})  // See what's in progress
board_list({ list: 'in_progress' })  // Focus on current work
```

### Track New Work
```
board_add({
  title: 'Implement auth',
  description: 'Add OAuth2 with Google',
  list: 'todo',
  priority: 'high',
  labels: ['feature']
})
```

### Move Through Workflow
```
board_move({ id: 'abc123', list: 'in_progress' })
// ... do work ...
board_move({ id: 'abc123', list: 'done' })
```

## Lists

| List | Purpose |
|------|---------|
| `backlog` | Future work |
| `todo` | Ready to start |
| `in_progress` | Currently working |
| `blocked` | Waiting on something |
| `done` | Completed |
