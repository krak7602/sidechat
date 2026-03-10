import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  TFolder,
  MarkdownRenderer,
  Component,
  setIcon,
  Notice,
  FuzzySuggestModal,
  Modal,
  App,
} from "obsidian";
import type SideChatPlugin from "../main";
import type { StoredSession, PersistedMessage } from "../main";
import {
  checkClaudeStatus,
  spawnClaude,
  buildPrompt,
  launchClaudeAuth,
  ClaudeStatus,
  Attachment,
  ToolInput,
} from "./ClaudeRunner";

export const VIEW_TYPE_CHAT = "sidechat-chat";

// Runtime message (includes full attachment objects during a live session)
interface Message {
  role: "user" | "assistant";
  text: string;
  attachments?: Attachment[];
  attachmentLabels?: string[]; // used when restoring from history
  isStreaming?: boolean;
}

// ── Session list modal ────────────────────────────────────────────────────

class SessionListModal extends Modal {
  private plugin: SideChatPlugin;
  private onSelect: (index: number) => void;
  private onNew: () => void;

  constructor(app: App, plugin: SideChatPlugin, onSelect: (i: number) => void, onNew: () => void) {
    super(app);
    this.plugin = plugin;
    this.onSelect = onSelect;
    this.onNew = onNew;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sc-session-modal");

    // Hide Obsidian's default close button; we put ours inline with the title
    this.modalEl.querySelector(".modal-close-button")?.remove();

    const header = contentEl.createDiv("sc-session-modal-header");
    header.createEl("h3", { text: "Sessions" });
    const closeBtn = header.createEl("button", { cls: "sc-session-modal-close" });
    setIcon(closeBtn, "x");
    closeBtn.onclick = () => this.close();

    const newBtn = contentEl.createEl("button", { text: "+ New session", cls: "sc-btn-primary sc-session-new-btn" });
    newBtn.onclick = () => { this.close(); this.onNew(); };

    const list = contentEl.createDiv("sc-session-list");

    if (this.plugin.sessions.length === 0) {
      list.createEl("p", { text: "No sessions yet.", cls: "sc-muted" });
      return;
    }

    // Newest first
    [...this.plugin.sessions]
      .map((s, i) => ({ s, i }))
      .reverse()
      .forEach(({ s, i }) => {
        const isActive = i === this.plugin.activeSessionIndex;
        const item = list.createDiv(`sc-session-item${isActive ? " sc-session-active" : ""}`);

        const info = item.createDiv("sc-session-info");
        info.createEl("span", { text: s.name, cls: "sc-session-name" });
        info.createEl("span", { text: " · ", cls: "sc-session-sep" });
        info.createEl("span", { text: formatDate(s.createdAt), cls: "sc-session-date" });

        const del = item.createEl("button", { text: "✕", cls: "sc-session-del" });
        del.title = "Delete session";
        del.onclick = (e) => {
          e.stopPropagation();
          this.plugin.deleteSession(i);
          void this.plugin.savePluginData();
          this.close();
          this.onSelect(this.plugin.activeSessionIndex);
        };

        item.onclick = () => { this.close(); this.onSelect(i); };
      });
  }

  onClose() { this.contentEl.empty(); }
}

// ── File picker ───────────────────────────────────────────────────────────

class FilePicker extends FuzzySuggestModal<TFile> {
  private onPick: (file: TFile) => void;
  constructor(app: App, onPick: (file: TFile) => void) {
    super(app);
    this.onPick = onPick;
    this.setPlaceholder("Pick a file to attach...");
  }
  getItems(): TFile[] { return this.app.vault.getFiles(); }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.onPick(f); }
}

// ── Permission preview modal ──────────────────────────────────────────────

class PermissionPreviewModal extends Modal {
  private toolInputs: ToolInput[];
  private currentIndex = 0;
  private activeTab: "before" | "after" | "content" = "after";
  private bodyEl!: HTMLElement;
  private navEl!: HTMLElement;
  private tabBarEl!: HTMLElement;

  constructor(app: App, toolInputs: ToolInput[]) {
    super(app);
    this.toolInputs = toolInputs;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("sc-preview-modal");
    this.modalEl.querySelector(".modal-close-button")?.remove();

    // Header
    const header = contentEl.createDiv("sc-session-modal-header");
    header.createEl("h3", { text: "Proposed changes" });
    const closeBtn = header.createEl("button", { cls: "sc-session-modal-close" });
    setIcon(closeBtn, "x");
    closeBtn.onclick = () => this.close();

    // Navigation bar
    this.navEl = contentEl.createDiv("sc-preview-nav");

    // Tab bar
    this.tabBarEl = contentEl.createDiv("sc-preview-tabs");

    // Body
    this.bodyEl = contentEl.createDiv("sc-preview-body");

    this.render();
  }

  private render() {
    const tool = this.toolInputs[this.currentIndex];
    const total = this.toolInputs.length;
    const isEdit = tool.toolName === "Edit" || tool.toolName === "str_replace_editor";
    const isWrite = tool.toolName === "Write" || tool.toolName === "create_file";
    const rawPath = (tool.input.file_path ?? tool.input.path) as string ?? "";
    const fileName = rawPath.split("/").pop() ?? rawPath;

    // — Navigation bar —
    this.navEl.empty();
    const prevBtn = this.navEl.createEl("button", { cls: "sc-preview-nav-btn" });
    setIcon(prevBtn, "chevron-left");
    prevBtn.disabled = this.currentIndex === 0;
    prevBtn.onclick = () => { this.currentIndex--; this.activeTab = isEdit ? "after" : "content"; this.render(); };

    const fileInfo = this.navEl.createDiv("sc-preview-nav-info");
    fileInfo.createEl("span", { text: fileName, cls: "sc-preview-nav-name" });
    if (total > 1) fileInfo.createEl("span", { text: `${this.currentIndex + 1} / ${total}`, cls: "sc-preview-nav-count" });

    const nextBtn = this.navEl.createEl("button", { cls: "sc-preview-nav-btn" });
    setIcon(nextBtn, "chevron-right");
    nextBtn.disabled = this.currentIndex === total - 1;
    nextBtn.onclick = () => { this.currentIndex++; this.activeTab = isEdit ? "after" : "content"; this.render(); };

    // — Tab bar —
    this.tabBarEl.empty();
    if (isEdit) {
      for (const tab of ["before", "after"] as const) {
        const t = this.tabBarEl.createEl("button", {
          text: tab === "before" ? "Before" : "After",
          cls: `sc-preview-tab${this.activeTab === tab ? " sc-preview-tab-active" : ""}`,
        });
        t.onclick = () => { this.activeTab = tab; this.render(); };
      }
    }

    // — Body —
    this.bodyEl.empty();
    let codeText = "";
    if (isEdit) {
      codeText = (this.activeTab === "before"
        ? tool.input.old_string
        : tool.input.new_string) as string ?? "";
    } else if (isWrite) {
      codeText = tool.input.content as string ?? "";
    } else {
      codeText = JSON.stringify(tool.input, null, 2);
    }
    const pre = this.bodyEl.createEl("pre", { cls: "sc-preview-code" });
    pre.createEl("code").setText(codeText);
  }

  onClose() { this.contentEl.empty(); }
}

// ── ChatView ──────────────────────────────────────────────────────────────

export class ChatView extends ItemView {
  private plugin: SideChatPlugin;
  private claudeStatus: ClaudeStatus | null = null;
  private messages: Message[] = [];
  private pendingAttachments: Attachment[] = [];
  private isStreaming = false;
  private killProc: (() => void) | null = null;

  // DOM refs
  private messagesEl!: HTMLElement;
  private attachmentsBarEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private sessionNameEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private syncMirrorEl!: HTMLElement;
  private dropdownEl: HTMLElement | null = null;

  // Observers
  private syncObserver: MutationObserver | null = null;
  private sidebarObserver: ResizeObserver | null = null;

  // Mention state
  private mentionItems: MentionItem[] = [];
  private mentionActiveIndex = 0;

  constructor(leaf: WorkspaceLeaf, plugin: SideChatPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return VIEW_TYPE_CHAT; }
  getDisplayText() { return "claude"; }
  getIcon() { return "message-square"; }

  async onOpen() {
    this.contentEl.addClass("sc-view");
    this.claudeStatus = await checkClaudeStatus(this.plugin.binaryPath);

    // Tab switches (layout-change covers most cases)
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncStatusBarVisibility()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncStatusBarVisibility()));

    // Sidebar collapse — layout-change doesn't fire for this, ResizeObserver does
    this.sidebarObserver = new ResizeObserver(() => this.syncStatusBarVisibility());
    this.sidebarObserver.observe(this.containerEl);

    this.syncStatusBarVisibility();

    if (!this.claudeStatus.installed || !this.claudeStatus.authenticated) {
      this.renderSetup();
    } else {
      // Ensure at least one session exists
      if (this.plugin.sessions.length === 0) this.plugin.createSession();
      this.loadAndRender();
    }
  }

  private syncStatusBarVisibility() {
    const rect = this.containerEl.getBoundingClientRect();
    const isVisible = rect.width > 0 && rect.height > 0;
    const wasVisible = document.body.hasClass("sc-chat-open");

    if (isVisible) {
      document.body.addClass("sc-chat-open");
      // Re-mirror on first becoming visible — status bar items may not have been ready at init
      if (!wasVisible) this.mirrorSyncStatus();
    } else {
      document.body.removeClass("sc-chat-open");
    }
  }

  onClose() {
    this.killProc?.();
    document.body.removeClass("sc-chat-open");
    this.syncObserver?.disconnect();
    this.syncObserver = null;
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  private renderSetup() {
    const el = this.contentEl;
    el.empty();
    const wrap = el.createDiv("sc-setup");
    wrap.createEl("h3", { text: "Setup required" });

    if (!this.claudeStatus?.installed) {
      wrap.createEl("p", { text: "Step 1 — Install the claude CLI:" });
      const block = wrap.createDiv("sc-code");
      block.setText("brew install claude-code");
      const copy = wrap.createEl("button", { text: "Copy", cls: "sc-btn-sm" });
      copy.onclick = () => {
        navigator.clipboard.writeText("brew install claude-code");
        copy.setText("Copied!");
        setTimeout(() => copy.setText("Copy"), 2000);
      };
      wrap.createEl("p", { text: "Or: npm install -g @anthropic-ai/claude-code", cls: "sc-muted" });
      wrap.createEl("hr");
    }

    wrap.createEl("p", { text: "Sign in with your claude.ai account:" });
    const loginBtn = wrap.createEl("button", { text: "Sign in", cls: "sc-btn-primary" });
    loginBtn.onclick = () => {
      if (this.claudeStatus?.binaryPath) {
        launchClaudeAuth(this.claudeStatus.binaryPath);
        loginBtn.setText("Browser opened — sign in, then click below");
        loginBtn.disabled = true;
      } else {
        new Notice("Install claude first.");
      }
    };

    const checkBtn = wrap.createEl("button", { text: "Check again", cls: "sc-btn-sm sc-mt" });
    checkBtn.onclick = () => {
      void checkClaudeStatus(this.plugin.binaryPath).then((status) => {
        this.claudeStatus = status;
        if (status.installed && status.authenticated) {
          if (this.plugin.sessions.length === 0) this.plugin.createSession();
          this.loadAndRender();
        } else {
          new Notice(
            !status.installed
              ? "Claude Code not found. Install it and try again."
              : "Not signed in yet. Complete sign-in in the browser."
          );
        }
      });
    };
  }

  // ── Session management ────────────────────────────────────────────────────

  private openSessionList() {
    new SessionListModal(
      this.app,
      this.plugin,
      (index) => {
        this.plugin.setActiveSession(index);
        this.loadAndRender();
        void this.plugin.savePluginData();
      },
      () => {
        this.switchToSession(this.plugin.createSession(), true);
      }
    ).open();
  }

  private switchToSession(session: StoredSession, isNew: boolean) {
    void session; // session index already set in plugin
    void this.plugin.savePluginData();
    this.loadAndRender();
    if (isNew) this.inputEl?.focus();
  }

  /** Load the active session's message history and render the chat UI. */
  private loadAndRender() {
    const session = this.plugin.getActiveSession();
    this.messages = session.messages.map((pm) => ({
      role: pm.role,
      text: pm.text,
      attachmentLabels: pm.attachmentLabels,
    }));
    this.renderChat();
  }

  // ── Chat screen ───────────────────────────────────────────────────────────

  private renderChat() {
    const el = this.contentEl;
    el.empty();
    el.addClass("sc-chat");

    this.messagesEl = el.createDiv("sc-messages");

    if (this.messages.length === 0) {
      this.showEmptyState();
    } else {
      for (const msg of this.messages) {
        if (msg.role === "user") this.appendUserMessage(msg);
        else this.appendAssistantMessage(msg);
      }
    }

    const inputArea = el.createDiv("sc-input-area");

    this.dropdownEl = inputArea.createDiv("sc-mention-dropdown");
    this.dropdownEl.hide();

    this.attachmentsBarEl = inputArea.createDiv("sc-attachments-bar");
    this.attachmentsBarEl.hide();

    const row = inputArea.createDiv("sc-input-row");

    this.inputEl = row.createEl("textarea", {
      cls: "sc-input",
      attr: { placeholder: "Ask claude…", rows: "1" },
    });

    this.inputEl.addEventListener("input", () => {
      this.autoResize();
      this.checkMention();
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (this.dropdownEl && !this.dropdownEl.hasClass("is-hidden") && this.mentionItems.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); this.moveMentionIndex(1); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); this.moveMentionIndex(-1); return; }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          this.confirmMentionItem(this.mentionItems[this.mentionActiveIndex]);
          return;
        }
        if (e.key === "Escape") { this.closeMentionDropdown(); return; }
      }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
    });

    this.inputEl.addEventListener("blur", () => {
      setTimeout(() => this.closeMentionDropdown(), 150);
    });

    this.sendBtn = row.createEl("button", { cls: "sc-send-btn" });
    setIcon(this.sendBtn, "arrow-up");
    this.sendBtn.onclick = () => this.send();

    // Footer bar — centered: session name · New Session
    this.footerEl = el.createDiv("sc-footer");

    this.sessionNameEl = this.footerEl.createSpan("sc-footer-name");
    const session = this.plugin.getActiveSession();
    this.sessionNameEl.setText(session.name === "New session" ? "claude" : session.name);
    this.sessionNameEl.addEventListener("click", () => this.openSessionList());

    this.footerEl.createSpan({ text: " · ", cls: "sc-footer-sep" });

    const newSessionBtn = this.footerEl.createEl("button", { text: "New", cls: "sc-footer-new-session" });
    newSessionBtn.addEventListener("click", () => this.switchToSession(this.plugin.createSession(), true));

    // Sync status mirror — cloned from Obsidian's status bar
    this.syncMirrorEl = this.footerEl.createSpan("sc-footer-sync");
    this.mirrorSyncStatus();
  }

  private mirrorSyncStatus() {
    this.syncObserver?.disconnect();
    this.syncObserver = null;

    const items = Array.from(document.querySelectorAll<HTMLElement>(".status-bar .status-bar-item"));
    // Obsidian Sync is always the rightmost status bar item
    const syncItem = items[items.length - 1];

    if (!syncItem || !this.syncMirrorEl) return;

    const update = () => {
      this.syncMirrorEl.empty();
      this.syncMirrorEl.appendChild(syncItem.cloneNode(true));
    };
    update();

    this.syncObserver = new MutationObserver(update);
    this.syncObserver.observe(syncItem, { childList: true, subtree: true, attributes: true });
  }

  private showEmptyState() {
    const el = this.messagesEl.createDiv("sc-empty");
    el.createEl("p", { text: "Ask claude anything about your vault." });
    el.createEl("p", {
      text: "Type @ to attach a file or folder.",
      cls: "sc-muted",
    });
  }

  // ── @ mention dropdown ────────────────────────────────────────────────────

  private getMentionContext(): { query: string; start: number } | null {
    const val = this.inputEl.value;
    const pos = this.inputEl.selectionStart ?? 0;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = val[i];
      if (ch === "@") return { query: val.slice(i + 1, pos), start: i };
      if (ch === " " || ch === "\n") return null;
    }
    return null;
  }

  private checkMention() {
    const ctx = this.getMentionContext();
    if (!ctx) { this.closeMentionDropdown(); return; }
    this.showMentionDropdown(ctx.query);
  }

  private showMentionDropdown(query: string) {
    const q = query.toLowerCase();
    const items: MentionItem[] = [];
    const seenDirs = new Set<string>();

    for (const file of this.app.vault.getFiles()) {
      const parts = file.path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join("/");
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath);
          if (!q || dirPath.toLowerCase().includes(q) || parts[i - 1].toLowerCase().startsWith(q)) {
            items.push({ kind: "directory", path: dirPath, label: dirPath + "/" });
          }
        }
      }
      if (!q || file.path.toLowerCase().includes(q) || file.name.toLowerCase().startsWith(q)) {
        items.push({ kind: "file", path: file.path, label: file.path });
      }
    }

    items.sort((a, b) => {
      const aName = basename(a.path).toLowerCase();
      const bName = basename(b.path).toLowerCase();
      const aExact = aName.startsWith(q) ? 0 : 1;
      const bExact = bName.startsWith(q) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    const results = items.slice(0, 8);
    if (results.length === 0) { this.closeMentionDropdown(); return; }

    this.mentionItems = results;
    this.mentionActiveIndex = 0;
    this.renderMentionDropdown();
  }

  private renderMentionDropdown() {
    if (!this.dropdownEl) return;
    this.dropdownEl.empty();
    this.dropdownEl.show();
    this.mentionItems.forEach((item, i) => {
      const row = this.dropdownEl!.createDiv(
        `sc-mention-item${i === this.mentionActiveIndex ? " sc-mention-active" : ""}`
      );
      row.createSpan({ text: item.kind === "directory" ? "📁" : "📄", cls: "sc-mention-icon" });
      row.createSpan({ text: item.label, cls: "sc-mention-label" });
      row.addEventListener("mousedown", (e) => { e.preventDefault(); this.confirmMentionItem(item); });
    });
  }

  private moveMentionIndex(delta: number) {
    this.mentionActiveIndex = Math.max(0, Math.min(this.mentionItems.length - 1, this.mentionActiveIndex + delta));
    this.renderMentionDropdown();
  }

  private confirmMentionItem(item: MentionItem) {
    const ctx = this.getMentionContext();
    if (!ctx) { this.closeMentionDropdown(); return; }
    const val = this.inputEl.value;
    const pos = this.inputEl.selectionStart ?? 0;
    this.inputEl.value = val.slice(0, ctx.start) + val.slice(pos);
    this.inputEl.selectionStart = this.inputEl.selectionEnd = ctx.start;
    this.closeMentionDropdown();
    if (item.kind === "file") this.addFile(item.path);
    else void this.addDirectory(item.path);
    this.inputEl.focus();
  }

  private closeMentionDropdown() {
    this.dropdownEl?.hide();
    this.mentionItems = [];
    this.mentionActiveIndex = 0;
  }

  // ── Send / stream ─────────────────────────────────────────────────────────

  private send() {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming || !this.claudeStatus) return;

    const attachments = [...this.pendingAttachments];
    this.pendingAttachments = [];
    this.renderAttachmentsBar();

    this.inputEl.value = "";
    this.autoResize();
    this.messagesEl.querySelector(".sc-empty")?.remove();

    const userMsg: Message = { role: "user", text, attachments };
    this.messages.push(userMsg);
    this.appendUserMessage(userMsg);

    const assistantMsg: Message = { role: "assistant", text: "", isStreaming: true };
    this.messages.push(assistantMsg);
    const { el: msgEl, textEl, toolEl } = this.appendAssistantMessage(assistantMsg);

    this.setStreaming(true);
    this.runClaude(text, attachments, assistantMsg, msgEl, textEl, toolEl);
  }

  private runClaude(
    text: string,
    attachments: Attachment[],
    assistantMsg: Message,
    msgEl: HTMLElement,
    textEl: HTMLElement,
    toolEl: HTMLElement,
  ) {
    const session = this.plugin.getActiveSession();
    const vaultPath = this.getVaultPath();
    const fullPrompt = buildPrompt(text, attachments);
    let permissionRequested = false;
    let capturedToolInputs: ToolInput[] = [];

    this.killProc = spawnClaude(
      fullPrompt,
      vaultPath,
      this.claudeStatus!.binaryPath,
      session.claudeSessionId,
      (event) => {
        if (event.type === "text") {
          assistantMsg.text = event.text;
          textEl.textContent = event.text;
          toolEl.hide();
          this.scrollBottom();

        } else if (event.type === "thinking") {
          if (!assistantMsg.text) {
            toolEl.setText("Thinking…");
            toolEl.show();
          }

        } else if (event.type === "tool_use") {
          toolEl.setText(`Using ${event.toolName}…`);
          toolEl.show();

        } else if (event.type === "permission_request") {
          permissionRequested = true;
          capturedToolInputs.push(...event.toolInputs);

        } else if (event.type === "error") {
          assistantMsg.text = `⚠️ ${event.error}`;
          textEl.textContent = assistantMsg.text;

        } else if (event.type === "done") {
          if (event.sessionId) session.claudeSessionId = event.sessionId;

          if (session.name === "New session" && session.messages.length === 0) {
            session.name = sessionNameFrom(text);
            if (this.sessionNameEl) this.sessionNameEl.setText(session.name);
          }

          session.messages = this.messages.map(messageToPersistedMessage);
          void this.plugin.savePluginData();

          assistantMsg.isStreaming = false;
          toolEl.hide();
          this.setStreaming(false);
          this.killProc = null;

          textEl.removeClass("sc-streaming");
          textEl.textContent = "";
          void MarkdownRenderer.render(
            this.app, assistantMsg.text, textEl, "", this as unknown as Component
          );

          if (permissionRequested) {
            this.appendPermissionButtons(msgEl, textEl, toolEl, assistantMsg, text, attachments, capturedToolInputs);
          }

          this.scrollBottom();
        }
      },
    );
  }

  private appendPermissionButtons(
    msgEl: HTMLElement,
    textEl: HTMLElement,
    toolEl: HTMLElement,
    assistantMsg: Message,
    originalText: string,
    originalAttachments: Attachment[],
    toolInputs: ToolInput[] = []
  ) {
    const bar = msgEl.createDiv("sc-permission-bar");
    bar.createSpan({ text: "claude needs write permission to proceed.", cls: "sc-permission-label" });

    if (toolInputs.length > 0) {
      const viewBtn = bar.createEl("button", { text: "View", cls: "sc-permission-view" });
      viewBtn.onclick = () => new PermissionPreviewModal(this.app, toolInputs).open();
    }

    const approveBtn = bar.createEl("button", { text: "Approve", cls: "sc-permission-approve" });
    const rejectBtn = bar.createEl("button", { text: "Reject", cls: "sc-permission-reject" });

    approveBtn.onclick = () => {
      bar.remove();
      approveBtn.disabled = true;
      void this.applyToolInputs(toolInputs).then((results) => {
        const summary = results.map(r => r.ok ? `✓ ${r.label}` : `✗ ${r.label}: ${r.error}`).join("\n");
        assistantMsg.text = summary;
        textEl.textContent = "";
        void MarkdownRenderer.render(this.app, summary, textEl, "", this as unknown as Component);
        const session = this.plugin.getActiveSession();
        session.messages = this.messages.map(messageToPersistedMessage);
        void this.plugin.savePluginData();
        this.scrollBottom();
      });
    };

    rejectBtn.onclick = () => bar.remove();
  }

  private async applyToolInputs(toolInputs: ToolInput[]): Promise<Array<{ ok: boolean; label: string; error?: string }>> {
    const vaultPath = this.getVaultPath();
    const results = [];
    for (const tool of toolInputs) {
      const rawPath = (tool.input.file_path ?? tool.input.path) as string;
      // Strip absolute vault prefix so Obsidian gets a relative path
      const filePath = rawPath.startsWith(vaultPath)
        ? rawPath.slice(vaultPath.length).replace(/^\//, "")
        : rawPath;
      try {
        if (tool.toolName === "Edit" || tool.toolName === "str_replace_editor") {
          const oldStr = tool.input.old_string as string;
          const newStr = tool.input.new_string as string;
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (!(file instanceof TFile)) throw new Error("File not found");
          const content = await this.app.vault.read(file);
          if (!content.includes(oldStr)) throw new Error("Original text not found in file");
          await this.app.vault.modify(file, content.replace(oldStr, newStr));
          results.push({ ok: true, label: `Edited ${basename(filePath)}` });

        } else if (tool.toolName === "Write" || tool.toolName === "create_file") {
          const content = tool.input.content as string;
          const existing = this.app.vault.getAbstractFileByPath(filePath);
          if (existing instanceof TFile) {
            await this.app.vault.modify(existing, content);
          } else {
            await this.app.vault.create(filePath, content);
          }
          results.push({ ok: true, label: `Wrote ${basename(filePath)}` });

        } else {
          results.push({ ok: false, label: tool.toolName, error: "Unsupported tool" });
        }
      } catch (e) {
        results.push({ ok: false, label: basename(filePath ?? tool.toolName), error: (e as Error).message });
      }
    }
    return results;
  }

  private setStreaming(on: boolean) {
    this.isStreaming = on;
    this.sendBtn.disabled = on;
    if (on) {
      setIcon(this.sendBtn, "square");
      this.sendBtn.onclick = () => { this.killProc?.(); this.setStreaming(false); };
      if (this.sessionNameEl) this.sessionNameEl.setText("thinking…");
    } else {
      setIcon(this.sendBtn, "arrow-up");
      this.sendBtn.onclick = () => this.send();
      const name = this.plugin.getActiveSession().name;
      if (this.sessionNameEl) this.sessionNameEl.setText(name === "New session" ? "Claude" : name);
    }
  }

  // ── Message rendering ─────────────────────────────────────────────────────

  private appendUserMessage(msg: Message): HTMLElement {
    const el = this.messagesEl.createDiv("sc-msg sc-msg-user");

    // Build display labels from either live attachments or persisted labels
    const labels: string[] = msg.attachments
      ? msg.attachments.map(attachmentLabel)
      : (msg.attachmentLabels ?? []);

    if (labels.length > 0) {
      const pills = el.createDiv("sc-pills");
      for (const label of labels) {
        pills.createSpan({ text: label, cls: "sc-pill" });
      }
    }

    el.createDiv("sc-msg-text").setText(msg.text);
    this.scrollBottom();
    return el;
  }

  private appendAssistantMessage(msg: Message): { el: HTMLElement; textEl: HTMLElement; toolEl: HTMLElement } {
    const el = this.messagesEl.createDiv("sc-msg sc-msg-assistant");
    const toolEl = el.createDiv("sc-tool-label");
    toolEl.hide();
    const textEl = el.createDiv("sc-msg-text");
    if (msg.isStreaming) {
      textEl.addClass("sc-streaming");
    } else if (msg.text) {
      void MarkdownRenderer.render(this.app, msg.text, textEl, "", this as unknown as Component);
    }
    this.scrollBottom();
    return { el, textEl, toolEl };
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  public addFile(filePath: string) {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return;
    if (this.pendingAttachments.find((a) => a.path === filePath && a.kind === "file")) return;
    void this.app.vault.read(file).then((content) => {
      this.pendingAttachments.push({ kind: "file", path: filePath, content });
      this.renderAttachmentsBar();
    });
  }

  public async addDirectory(dirPath: string) {
    const folder = this.app.vault.getAbstractFileByPath(dirPath);
    if (!(folder instanceof TFolder)) return;
    if (this.pendingAttachments.find((a) => a.path === dirPath && a.kind === "directory")) return;

    const mdFiles = this.app.vault.getFiles().filter(
      (f) => f.path.startsWith(dirPath + "/") && f.extension === "md"
    );
    if (mdFiles.length === 0) { new Notice(`No markdown files in ${basename(dirPath)}/`); return; }
    if (mdFiles.length > 20) new Notice(`${basename(dirPath)}/ has ${mdFiles.length} files — attaching first 20.`);

    const files = await Promise.all(
      mdFiles.slice(0, 20).map(async (f) => ({ path: f.path, content: await this.app.vault.read(f) }))
    );
    this.pendingAttachments.push({ kind: "directory", path: dirPath, files });
    this.renderAttachmentsBar();
  }

  public addSelection(filePath: string, content: string, startLine: number, endLine: number) {
    this.pendingAttachments.push({ kind: "selection", path: filePath, content, startLine, endLine });
    this.renderAttachmentsBar();
    this.inputEl?.focus();
  }

  public openFilePicker() {
    new FilePicker(this.app, (file) => this.addFile(file.path)).open();
  }

  private renderAttachmentsBar() {
    if (!this.attachmentsBarEl) return;
    this.attachmentsBarEl.empty();
    if (this.pendingAttachments.length === 0) { this.attachmentsBarEl.hide(); return; }
    this.attachmentsBarEl.show();
    this.pendingAttachments.forEach((att, i) => {
      const pill = this.attachmentsBarEl.createDiv("sc-pill sc-pill-pending");
      const label = attachmentLabel(att);
      pill.createSpan({ text: label });
      if (att.kind === "selection") pill.title = att.content.slice(0, 400);
      const rm = pill.createSpan({ text: "×", cls: "sc-pill-rm" });
      rm.onclick = () => { this.pendingAttachments.splice(i, 1); this.renderAttachmentsBar(); };
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    return adapter.getBasePath?.() ?? adapter.basePath ?? "";
  }

  private autoResize() {
    this.inputEl.setCssProps({ "--sc-input-height": "auto" });
    this.inputEl.setCssProps({ "--sc-input-height": `${Math.min(this.inputEl.scrollHeight, 160)}px` });
  }

  private scrollBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface MentionItem { kind: "file" | "directory"; path: string; label: string; }

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function attachmentLabel(att: Attachment): string {
  if (att.kind === "file") return `📄 ${basename(att.path)}`;
  if (att.kind === "selection") return `📄 ${basename(att.path)} :${att.startLine}–${att.endLine}`;
  return `📁 ${basename(att.path)}/ (${att.files.length} files)`;
}

function messageToPersistedMessage(m: Message): PersistedMessage {
  return {
    role: m.role,
    text: m.text,
    attachmentLabels: m.attachments ? m.attachments.map(attachmentLabel) : (m.attachmentLabels ?? []),
  };
}

function sessionNameFrom(firstMessage: string): string {
  const s = firstMessage.trim().replace(/\s+/g, " ");
  if (s.length <= 45) return s;
  // Trim to last word boundary
  return s.slice(0, 45).replace(/\s\S*$/, "") + "…";
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
