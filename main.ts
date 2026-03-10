import { Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./src/ChatView";

export interface PersistedMessage {
  role: "user" | "assistant";
  text: string;
  attachmentLabels: string[]; // display-only; full content lives in Claude's session file
}

export interface StoredSession {
  claudeSessionId: string | null;
  name: string;
  createdAt: number;
  messages: PersistedMessage[];
}

interface PluginData {
  sessions: StoredSession[];
  activeSessionIndex: number;
  binaryPath: string;
}

const DEFAULT_DATA: PluginData = { sessions: [], activeSessionIndex: 0, binaryPath: "" };

export default class SideChatPlugin extends Plugin {
  sessions: StoredSession[] = [];
  activeSessionIndex = 0;
  binaryPath = "";

  onload() {
    void this.init();
  }

  private async init() {
    const data: PluginData = Object.assign({}, DEFAULT_DATA, await this.loadData());
    this.sessions = data.sessions ?? [];
    this.activeSessionIndex = data.activeSessionIndex ?? 0;
    this.binaryPath = data.binaryPath ?? "";

    // Clamp in case sessions were deleted
    if (this.activeSessionIndex >= this.sessions.length) {
      this.activeSessionIndex = Math.max(0, this.sessions.length - 1);
    }

    this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("message-square", "Open claude", () => void this.activateView());
    this.addSettingTab(new SideChatSettingTab(this.app, this));

    this.addCommand({
      id: "open-chat",
      name: "Open claude chat",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "attach-current-file",
      name: "Add current file to claude",
      editorCallback: (editor, ctx) => {
        const file = ctx.file;
        if (!file) return;
        void this.getOrOpenChat().then((view) => view?.addFile(file.path));
      },
    });

    this.addCommand({
      id: "attach-selection",
      name: "Add selection to claude",
      editorCallback: (editor, ctx) => {
        const file = ctx.file;
        if (!file || !editor.somethingSelected()) return;
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        void this.getOrOpenChat().then((view) =>
          view?.addSelection(file.path, editor.getSelection(), from.line + 1, to.line + 1)
        );
      },
    });

    this.addCommand({
      id: "attach-file-picker",
      name: "Attach a file to claude",
      callback: () => void this.getOrOpenChat().then((view) => view?.openFilePicker()),
    });
  }

  onunload() {
    void this.savePluginData();
  }

  // ── Session helpers ───────────────────────────────────────────────────────

  getActiveSession(): StoredSession {
    if (this.sessions.length === 0) return this.createSession();
    return this.sessions[this.activeSessionIndex] ?? this.sessions[0];
  }

  createSession(): StoredSession {
    const s: StoredSession = {
      claudeSessionId: null,
      name: "New session",
      createdAt: Date.now(),
      messages: [],
    };
    this.sessions.push(s);
    this.activeSessionIndex = this.sessions.length - 1;
    return s;
  }

  setActiveSession(index: number) {
    this.activeSessionIndex = Math.max(0, Math.min(this.sessions.length - 1, index));
  }

  deleteSession(index: number) {
    this.sessions.splice(index, 1);
    if (this.sessions.length === 0) this.createSession();
    this.activeSessionIndex = Math.min(this.activeSessionIndex, this.sessions.length - 1);
  }

  async savePluginData() {
    await this.saveData({
      sessions: this.sessions,
      activeSessionIndex: this.activeSessionIndex,
      binaryPath: this.binaryPath,
    } satisfies PluginData);
  }

  // ── View helpers ──────────────────────────────────────────────────────────

  private async activateView() {
    await this.getOrOpenChat();
  }

  async getOrOpenChat(): Promise<ChatView | null> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

    let leaf: WorkspaceLeaf;
    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
    }

    void workspace.revealLeaf(leaf);
    return leaf.view instanceof ChatView ? leaf.view : null;
  }
}

// ── Settings tab ─────────────────────────────────────────────────────────────

class SideChatSettingTab extends PluginSettingTab {
  private plugin: SideChatPlugin;

  constructor(app: SideChatPlugin["app"], plugin: SideChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Claude binary path")
      .setDesc("Path to the claude binary. Leave blank to auto-detect. Use this if claude is installed via nvm, volta, fnm, or a non-standard location.")
      .addText((text) =>
        text
          .setPlaceholder("/usr/local/bin/claude")
          .setValue(this.plugin.binaryPath)
          .onChange(async (value) => {
            this.plugin.binaryPath = value.trim();
            await this.plugin.savePluginData();
          })
      );
  }
}
