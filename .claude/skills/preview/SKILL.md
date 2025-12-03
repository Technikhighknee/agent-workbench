---
name: preview
description: "See what breaks BEFORE you edit. Type errors, affected callers, required tests."
allowed-tools: mcp__preview__preview_edit
---

# preview

**Know the consequences of your changes before you make them. The ultimate safety net.**

## The Problem

You're about to change a function. Will it break types? Who calls it? What tests need to run?

Without preview:
1. Make the change
2. Run type checker - find errors
3. Fix errors
4. Run tests - more failures
5. Fix those too
6. Repeat...

**With preview - know all this BEFORE you edit.**

## First: preview_edit

```
preview_edit({
  file_path: 'src/api.ts',
  symbol_name: 'fetchUser',
  new_code: 'async function fetchUser(id: string, options?: RequestOptions): Promise<User> { ... }'
})
```

Returns:
- **Type errors** - Will this break the build?
- **Affected callers** - Who calls this function?
- **Related tests** - What tests should you run?
- **Impact summary** - How risky is this change?

## Why This Wins

| Without preview | With preview |
|-----------------|--------------|
| Edit → type errors → fix → more errors | See all errors before editing |
| "Who calls this?" → search → maybe miss some | All callers shown upfront |
| "What tests?" → guess → run wrong ones | Tests discovered automatically |
| Risky refactoring → hope it works | Know exactly what breaks |

## When to Use

### Before Risky Changes
```
// Changing a widely-used function? Preview first.
preview_edit({
  file_path: 'src/core/utils.ts',
  symbol_name: 'formatDate',
  new_code: '...',
  check_types: true,
  find_callers: true
})
```

### Before Signature Changes
```
// Adding a required parameter? See who breaks.
preview_edit({
  file_path: 'src/api.ts',
  symbol_name: 'createUser',
  new_code: 'async function createUser(data: UserData, options: CreateOptions) { ... }'
})
```

### Before Refactoring
```
// Want to simplify a function? Know the impact.
preview_edit({
  file_path: 'src/handlers.ts',
  symbol_name: 'processRequest',
  new_code: '...',
  find_tests: true
})
```

## What You Get

### Type Errors (Predicted)
```
- src/routes.ts:45 - Argument of type '{}' is not assignable to parameter 'options'
- src/handlers.ts:23 - Property 'timeout' is missing in type 'RequestOptions'
```

### Affected Callers
```
- handleLogin (src/auth.ts:34) - uses fetchUser
- getUserProfile (src/profile.ts:12) - uses fetchUser
- testUserFetch (tests/api.test.ts:45) - uses fetchUser
```

### Related Tests
```
- tests/api.test.ts (high confidence - naming convention)
- tests/integration/user.test.ts (high confidence - imports source)
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| check_types | true | Run TypeScript type checking |
| find_callers | true | Find all code that calls this symbol |
| find_tests | true | Discover related test files |

## The Workflow

1. **Think** - "I want to change this function"
2. **Preview** - `preview_edit({ ... })` - see consequences
3. **Decide** - Is this change safe? What needs updating?
4. **Edit** - Make the change with confidence
5. **Verify** - Run the tests you now know to run

## Integration

Use with other tools:
- After preview → `syntax.edit_symbol` to make the change
- After preview → `test-runner.run_related_tests` to verify
- After preview → `types.get_diagnostics` to confirm no errors

## Not a Replacement

Preview shows you consequences. You still need to:
- `syntax.edit_symbol` - actually make the change
- `types.get_diagnostics` - verify after editing
- `test-runner.run_tests` - run the tests

**Preview is your pre-flight check. The other tools are the flight.**
