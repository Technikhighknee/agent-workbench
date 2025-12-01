# syntax MCP Feedback

## list_symbols

**Works well:**
- Hierarchical view shows class/method relationships
- Kind filtering is useful (functions, classes)

**Pain points:**
- None observed

---

## read_symbol

**Works well:**
- Name paths like `MyClass/myMethod` are intuitive
- Context parameter helps see surrounding code

**Pain points:**
- None observed

---

## edit_symbol

**Works well:**
- Much more reliable than text-based Edit tool
- No need to match exact whitespace/formatting
- Handles indentation automatically

**Pain points:**
- Requires knowing exact symbol name path

**Suggestions:**
- This is the preferred way to edit code - should be emphasized in skill

---

## search_symbols

**Works well:**
- Regex pattern matching is powerful
- Kind filtering reduces noise

**Pain points:**
- Requires index_project first (not auto-indexed)

---

## find_references

**Works well:**
- Text-based search with word boundaries
- Distinguishes definitions from usages

**Pain points:**
- Can have false positives for common names
- Not type-aware (finds all `get` not just `MyClass.get`)
