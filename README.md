# SideChat

Claude Code inside Obsidian — a sidebar chat powered by the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/overview).

Ask Claude questions about your notes, attach files or selections, and let Claude read and edit your vault directly.

---

## Requirements

- **Obsidian** 1.4.0 or later (desktop only)
- **Claude Code CLI** installed (`claude` binary on your system)
- **Claude subscription** — SideChat uses Claude Code's subscription-based auth, not an API key. Sign up at [claude.ai](https://claude.ai) and run `claude auth login` in your terminal to authenticate.

---

## Installation

### From the Community Plugin List
1. Open **Settings → Community plugins → Browse**
2. Search for **SideChat**
3. Click **Install**, then **Enable**

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/krak7602/sidechat/releases)
2. Copy them to `<your vault>/.obsidian/plugins/sidechat/`
3. Enable the plugin in **Settings → Community plugins**

---

## Usage

### Open the chat
- Click the **message icon** in the ribbon, or
- Run the command **"Open Claude chat"** (`Cmd/Ctrl+P`)

### Attach context
| Command | Hotkey | What it does |
|---------|--------|-------------|
| Add current file to Claude | — | Attaches the active file's full content |
| Add selection to Claude | `Cmd+Shift+C` | Attaches your highlighted text with line numbers |
| Attach a file to Claude | — | Fuzzy file picker to attach any vault file |

### Sessions
- Each conversation is a persistent session. Claude remembers the full history within a session.
- Click the session name in the bottom bar to switch or create sessions.
- Click **New** to start a fresh session.

### File edits
When Claude proposes changes to your files, a permission bar appears. You can:
- **View** — preview the exact changes before applying
- **Approve** — apply the changes directly to your vault
- **Reject** — discard the proposed changes

---

## Settings

**Settings → SideChat**

| Setting | Description |
|---------|-------------|
| Claude binary path | Override the path to the `claude` binary. Leave blank for auto-detection. Useful if Claude is installed via nvm, volta, fnm, or a custom location. |

---

## Privacy & Permissions

SideChat is transparent about what it accesses and where data goes:

**Paid account required**
This plugin requires a Claude subscription. It uses the Claude Code CLI which authenticates via your Anthropic account (`claude auth login`). No API key is needed, but a subscription is.

**Connection to Anthropic's API**
All messages are sent to Anthropic's servers via the Claude Code CLI. SideChat itself makes no direct network requests — it spawns the `claude` binary which handles all communication with the Anthropic API.

**Access to `~/.claude.json`**
On startup, SideChat reads `~/.claude.json` to check whether you are authenticated with Claude Code. No data from this file is transmitted — it is read locally only.

**Vault path shared with the Claude process**
SideChat passes your vault's absolute path to the Claude CLI via `--add-dir`. This gives Claude read access to your vault files when answering questions. Files are only read when you explicitly attach them or ask Claude about them. No vault content is stored or transmitted outside of your Claude session.

---

## License

MIT — see [LICENSE](LICENSE)
