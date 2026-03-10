## Why

The name "ObsiClaude" combines Obsidian and Claude trademarks, which violates both Anthropic's and Obsidian's naming policies for community plugins. Renaming to "SideChat" removes all trademark risk and better describes what the plugin does — a sidebar chat interface.

## What Changes

- `manifest.json`: `id` → `sidechat`, `name` → `SideChat`
- `package.json`: `name` → `sidechat`
- `LICENSE`: update copyright name to SideChat
- `README.md`: replace all "ObsiClaude" references with "SideChat"
- `styles.css`: rename all `oc-` CSS class prefixes → `sc-`
- `src/ChatView.ts`: rename all `oc-` class references, `VIEW_TYPE_CHAT` value, and `ObsiClaudePlugin` type references where displayed
- `src/ClaudeRunner.ts`: rename `[ObsiClaude]` debug prefix → `[SideChat]`
- `main.ts`: rename `ObsiClaudePlugin` class → `SideChatPlugin`, `ObsiClaudeSettingTab` → `SideChatSettingTab`
- Body class `oc-chat-open` → `sc-chat-open` (CSS + ChatView.ts)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- None

## Impact

- All source files (`main.ts`, `src/ChatView.ts`, `src/ClaudeRunner.ts`)
- All config/metadata files (`manifest.json`, `package.json`)
- `styles.css` — mass prefix rename
- `README.md`, `LICENSE`
- No functional changes — purely cosmetic/naming
