## Context

Pure rename — no functional changes. The main risk is missing an occurrence and ending up with a mix of `oc-` and `sc-` classes, or a stale "ObsiClaude" string somewhere visible to users.

## Goals / Non-Goals

**Goals:**
- Zero remaining "ObsiClaude" / "obsiclaude" / `oc-` references in user-facing files
- Clean build after rename

**Non-Goals:**
- Any functional or UI changes
- Renaming the repository folder or git history

## Decisions

### D1: CSS prefix `oc-` → `sc-`
Replace all occurrences globally in `styles.css` and `ChatView.ts`. Both files have ~70–90 occurrences so replace_all is the right tool.

### D2: Class name `ObsiClaudePlugin` → `SideChatPlugin`
Rename in `main.ts` (definition) and anywhere it's imported/typed in `ChatView.ts`.

### D3: `VIEW_TYPE_CHAT` value stays as-is
The string value `"obsiclaude-chat"` is used as a Workspace view type key — changing it would break existing user installs (their layout data references this ID). Change it to `"sidechat-chat"` only since this is a new release and no users have the old ID persisted yet.

### D4: Body class `oc-chat-open` → `sc-chat-open`
Used in both `styles.css` and `ChatView.ts` — rename both.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Missing a reference | Grep for "obsiclaude", "ObsiClaude", "oc-" after all changes |
| Build breaks from missed type rename | TypeScript will catch it |
