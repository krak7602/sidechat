## Why

ObsiClaude is feature-complete for a first public release but is missing the scaffolding required by Obsidian's community plugin submission process and several polish items that reviewers and users will expect. This change prepares the plugin for submission to the Obsidian community plugin list.

## What Changes

- Add `README.md` with feature overview and all policy-required disclosures (paid account requirement, Anthropic API connection, `~/.claude.json` access, vault path sharing)
- Add `LICENSE` file (MIT)
- Add `versions.json` for Obsidian version compatibility mapping
- Fix `manifest.json` — populate `author` and `authorUrl` fields
- Remove/gate `console.log` calls throughout `ClaudeRunner.ts` and `ChatView.ts`
- Fix stderr-to-UI noise: `--verbose` flag causes internal Claude output to surface as UI errors; remove `--verbose` or filter stderr
- Switch the "Approve" permission flow to use `applyToolInputs()` (direct vault API apply) instead of re-running with `--dangerously-skip-permissions`
- Add a Settings tab with a manual binary path override field for non-standard Claude CLI installs

## Capabilities

### New Capabilities

- `plugin-settings`: Settings tab allowing users to configure the Claude binary path manually, used when auto-detection fails (non-standard installs via nvm, volta, fnm, etc.)

### Modified Capabilities

- None — no existing spec-level behavior changes

## Impact

- `main.ts`: Add `PluginSettingTab`, expose `binaryPath` override in plugin data
- `src/ClaudeRunner.ts`: Remove `--verbose` flag; remove/gate `console.log` calls; remove `--dangerously-skip-permissions` support (or leave for internal use only)
- `src/ChatView.ts`: Wire Approve to call `applyToolInputs()` directly; read binary path from plugin settings
- New files: `README.md`, `LICENSE`, `versions.json`
- Modified files: `manifest.json`
