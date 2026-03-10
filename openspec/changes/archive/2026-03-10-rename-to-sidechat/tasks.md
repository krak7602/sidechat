## 1. Metadata Files

- [x] 1.1 `manifest.json`: set `id` → `"sidechat"`, `name` → `"SideChat"`
- [x] 1.2 `package.json`: set `name` → `"sidechat"`, `description` → `"Claude Code sidebar chat for Obsidian"`
- [x] 1.3 `LICENSE`: update copyright line to `SideChat`

## 2. README

- [x] 2.1 Replace all `ObsiClaude` occurrences with `SideChat` in `README.md`
- [x] 2.2 Update install path reference (`.obsidian/plugins/obsiclaude/` → `.obsidian/plugins/sidechat/`)

## 3. CSS Prefix Rename

- [x] 3.1 `styles.css`: replace all `oc-` prefixes → `sc-` (replace_all)
- [x] 3.2 `styles.css`: replace `body.oc-chat-open` → `body.sc-chat-open`

## 4. TypeScript Renames

- [x] 4.1 `main.ts`: rename class `ObsiClaudePlugin` → `SideChatPlugin`
- [x] 4.2 `main.ts`: rename class `ObsiClaudeSettingTab` → `SideChatSettingTab`
- [x] 4.3 `src/ChatView.ts`: update `VIEW_TYPE_CHAT` value → `"sidechat-chat"`
- [x] 4.4 `src/ChatView.ts`: replace all `oc-` class strings → `sc-` (replace_all)
- [x] 4.5 `src/ChatView.ts`: replace `oc-chat-open` → `sc-chat-open`
- [x] 4.6 `src/ChatView.ts`: update import type reference `ObsiClaudePlugin` → `SideChatPlugin`
- [x] 4.7 `src/ClaudeRunner.ts`: replace `[ObsiClaude]` debug prefix → `[SideChat]`

## 5. Verify & Build

- [x] 5.1 Grep for remaining `obsiclaude`, `ObsiClaude`, `oc-` in source files — confirm zero hits
- [x] 5.2 Run `npm run build` — confirm clean
