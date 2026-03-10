## 1. Repo & Metadata Files

- [x] 1.1 Add `LICENSE` file (MIT)
- [x] 1.2 Add `versions.json` mapping `"0.1.0"` to `"1.4.0"`
- [x] 1.3 Fix `manifest.json` — update `author` and `authorUrl` fields

## 2. README

- [x] 2.1 Write `README.md` with feature overview, requirements, and installation steps
- [x] 2.2 Add "Privacy & Permissions" section with all four required disclosures (paid account, Anthropic API, `~/.claude.json` access, vault path sharing)

## 3. Code Cleanup

- [x] 3.1 Remove `--verbose` flag from `spawnClaude()` args in `ClaudeRunner.ts`
- [x] 3.2 Gate or remove `console.log` calls in `ClaudeRunner.ts` (add `const DEBUG = false` guard)
- [x] 3.3 Gate or remove `console.log` calls in `ChatView.ts`
- [x] 3.4 Suppress or filter stderr-to-UI forwarding so internal Claude output doesn't appear as UI errors

## 4. Permission Approval Flow

- [x] 4.1 Remove `bypassPermissions` / `--dangerously-skip-permissions` re-run from the Approve button handler
- [x] 4.2 Wire Approve directly to `applyToolInputs()` — apply the previewed changes via vault API only
- [x] 4.3 Remove `bypassPermissions` param from `spawnClaude()` (or keep private and unused)

## 5. Settings Tab

- [x] 5.1 Add `binaryPath` field to `PluginData` interface and `DEFAULT_DATA` in `main.ts`
- [x] 5.2 Implement `ObsiClaudeSettingTab` extending `PluginSettingTab` with a single text field for binary path
- [x] 5.3 Register the settings tab in `onload()` via `this.addSettingTab(...)`
- [x] 5.4 Thread `binaryPath` override through to `checkClaudeStatus()` and `spawnClaude()` calls in `ChatView.ts`
- [x] 5.5 Update `checkClaudeStatus()` in `ClaudeRunner.ts` to accept an optional `binaryPathOverride` param; if set, skip auto-detection

## 6. Build & Release Prep

- [x] 6.1 Run `npm run build` and verify clean output with no TypeScript errors
- [x] 6.2 Verify `main.js`, `manifest.json`, `styles.css` are present and up to date
- [x] 6.3 Confirm `manifest.json` version matches `versions.json` and intended GitHub release tag
