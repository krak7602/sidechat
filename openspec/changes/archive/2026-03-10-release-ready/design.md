## Context

ObsiClaude wraps the Claude Code CLI in an Obsidian sidebar. It currently works well as a dev plugin but lacks submission requirements (README, LICENSE, versions.json), has debug noise in logs, and has a permission approval flow with a security smell (`--dangerously-skip-permissions` re-run). The settings gap means users with non-standard Claude CLI installs (via nvm, volta, fnm, pnpm global, custom PATH) can't use the plugin at all without knowing to patch the binary path list manually.

## Goals / Non-Goals

**Goals:**
- Pass Obsidian's community plugin review checklist
- Comply with all developer policies (disclosures, no telemetry, LICENSE)
- Clean up debug output so no internal chatter appears in the UI
- Make permission approval safe and deterministic (apply exactly what was previewed)
- Unblock users with non-standard Claude installs via a settings UI

**Non-Goals:**
- New chat features or UI redesigns
- Multi-vault support
- Windows support (plugin is already `isDesktopOnly: true` and targets macOS paths)

## Decisions

### D1: Approve via `applyToolInputs()` only, remove `bypassPermissions`

**Decision:** When a user clicks Approve, call `applyToolInputs()` directly via the Obsidian vault API. Remove (or make private/internal) the `--dangerously-skip-permissions` re-run path.

**Why:** The re-run approach is non-deterministic — Claude may produce different edits on the second run, meaning the preview shown to the user may not match what actually gets applied. Direct vault API apply is exactly what was previewed.

**Alternatives considered:** Keep `--dangerously-skip-permissions` as a fallback — rejected because it undermines the purpose of the preview and is a flag that will draw scrutiny in Obsidian's review.

---

### D2: Remove `--verbose` flag, suppress stderr-to-UI forwarding

**Decision:** Remove `--verbose` from the spawn args. Gate stderr output — only emit `error` events for lines that look like actual errors (non-empty, not internal Claude debug lines), or suppress stderr forwarding entirely.

**Why:** `--verbose` causes Claude's internal tool orchestration messages to flow through stderr into the UI as red error text, confusing users. These are not errors.

**Alternatives considered:** Parse stderr for known patterns — fragile and maintenance-heavy. Simpler to just remove `--verbose`.

---

### D3: Settings tab with binary path override

**Decision:** Add an Obsidian `PluginSettingTab` with a single text field: "Claude binary path". If non-empty, use it instead of auto-detection. Store in plugin data.

**Why:** The hardcoded candidate list (`/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, etc.) misses many valid install locations. A manual override handles any case.

**Shape:**
```
Plugin Settings
├── Claude binary path
│   [/path/to/claude          ] ← text input
│   Auto-detected if left blank. Use this if Claude is installed via nvm, volta, etc.
```

---

### D4: Console.log gating

**Decision:** Wrap all `console.log` calls in a `DEBUG` constant (set to `false` in production build). A single `const DEBUG = false` at the top of each file gates all debug output.

**Why:** Clean production output. Easy to re-enable for debugging by flipping the constant. Avoids stripping lines entirely (useful for contributors).

---

### D5: README structure

Per Obsidian developer policies, these disclosures are mandatory:
- Paid account required (Claude subscription)
- Remote service connection (Anthropic API via CLI)
- Files accessed outside vault (`~/.claude.json`)
- Vault path shared with external process

README will include: feature overview, requirements, installation steps, how-to-use, and a "Privacy & Permissions" section covering all four disclosures.

---

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `applyToolInputs()` path has edge cases (new file creation, path resolution) | Already implemented and tested in prior session; reviewed during this change |
| Removing `--verbose` may hide useful diagnostic info for bug reports | `DEBUG` constant can be flipped; errors still surface via process exit codes |
| Settings tab adds complexity to `main.ts` | Minimal — single text field, no reactive state |
| Obsidian review takes weeks | Nothing to mitigate — just submit correctly the first time |

## Open Questions

- What author name / GitHub URL should go in `manifest.json`? (Need from user before submitting)
- What GitHub repo name? (Needed for `community-plugins.json` PR)
