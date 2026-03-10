import { spawn, execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DEBUG = false;
const dbg = (...args: unknown[]) => { if (DEBUG) console.log(...args); };

export interface ClaudeStatus {
  installed: boolean;
  authenticated: boolean;
  binaryPath: string;
}

export type Attachment =
  | { kind: "file"; path: string; content: string }
  | { kind: "selection"; path: string; content: string; startLine: number; endLine: number }
  | { kind: "directory"; path: string; files: Array<{ path: string; content: string }> };

export interface ToolInput {
  toolName: string;
  input: Record<string, unknown>;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "tool_use"; toolName: string }
  | { type: "permission_request"; filePath: string; toolInputs: ToolInput[] }
  | { type: "error"; error: string }
  | { type: "done"; sessionId?: string };

export async function checkClaudeStatus(binaryPathOverride = ""): Promise<ClaudeStatus> {
  const notFound: ClaudeStatus = { installed: false, authenticated: false, binaryPath: "" };

  // If override provided, skip auto-detection
  if (binaryPathOverride) {
    if (!existsSync(binaryPathOverride)) return notFound;
    try {
      const config = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf-8"));
      const authenticated = config.oauthAccount != null || !!config.primaryApiKey;
      return { installed: true, authenticated, binaryPath: binaryPathOverride };
    } catch {
      return { installed: true, authenticated: false, binaryPath: binaryPathOverride };
    }
  }

  // Find binary — check common locations first, then PATH via execFile (no shell injection risk)
  const candidates = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    `${homedir()}/.npm-global/bin/claude`,
    `${homedir()}/.local/bin/claude`,
  ];

  let binaryPath = candidates.find(existsSync) ?? "";

  if (!binaryPath) {
    try {
      binaryPath = await new Promise<string>((resolve, reject) => {
        execFile(
          "/usr/bin/which",
          ["claude"],
          { env: { PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH ?? ""}` } },
          (err, stdout) => (err ? reject(err) : resolve(stdout.trim()))
        );
      });
    } catch {
      return notFound;
    }
  }

  // Check auth by reading ~/.claude.json
  try {
    const config = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf-8"));
    // oauthAccount = subscription login; primaryApiKey = API key users
    const authenticated = config.oauthAccount != null || !!config.primaryApiKey;
    return { installed: true, authenticated, binaryPath };
  } catch {
    return { installed: true, authenticated: false, binaryPath };
  }
}

export function buildPrompt(userText: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return userText;

  const parts = attachments.map((att) => {
    if (att.kind === "file") {
      return `<file path="${att.path}">\n${att.content}\n</file>`;
    } else if (att.kind === "selection") {
      return `<selection path="${att.path}" lines="${att.startLine}-${att.endLine}">\n${att.content}\n</selection>`;
    } else {
      const fileBlocks = att.files
        .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
        .join("\n");
      return `<directory path="${att.path}">\n${fileBlocks}\n</directory>`;
    }
  });

  return parts.join("\n") + "\n\n" + userText;
}

export function spawnClaude(
  prompt: string,
  vaultPath: string,
  binaryPath: string,
  sessionId: string | null,
  onEvent: (event: StreamEvent) => void,
): () => void {
  const args = [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--include-partial-messages",
  ];

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  args.push(prompt);

  // Strip CLAUDECODE to avoid nested-session rejection
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CLAUDECODE;
  env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH ?? ""}`;

  dbg("[SideChat] spawning:", binaryPath, args.slice(0, -1), "cwd:", vaultPath);

  // CWD = vault path. The trust dialog may still appear for new directories;
  // auto-answer it by writing Enter (option 1 "Yes, I trust this folder" is pre-selected).
  const proc = spawn(binaryPath, args, { env, cwd: vaultPath });
  proc.stdin?.write("\n");
  proc.stdin?.end();

  let buffer = "";
  let capturedSessionId: string | undefined;
  let doneFired = false;
  let streamingText = "";  // accumulated from deltas

  // Tool input accumulation
  let pendingToolInputs: ToolInput[] = [];
  let currentTool: { name: string; jsonBuf: string } | null = null;

  const fireDone = () => {
    if (doneFired) return;
    doneFired = true;
    dbg("[SideChat] done, sessionId:", capturedSessionId);
    onEvent({ type: "done", sessionId: capturedSessionId });
  };

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      dbg("[SideChat] stdout line:", line.slice(0, 120));
      try {
        const ev = JSON.parse(line);

        if (ev.type === "system" && ev.subtype === "init") {
          capturedSessionId = ev.session_id;

        } else if (ev.type === "stream_event") {
          const inner = ev.event;
          if (inner?.type === "content_block_start" && inner.content_block?.type === "tool_use") {
            currentTool = { name: inner.content_block.name as string, jsonBuf: "" };
            onEvent({ type: "tool_use", toolName: inner.content_block.name as string });

          } else if (inner?.type === "content_block_delta") {
            if (inner.delta?.type === "text_delta") {
              streamingText += inner.delta.text as string;
              onEvent({ type: "text", text: streamingText });
            } else if (inner.delta?.type === "thinking_delta") {
              onEvent({ type: "thinking" });
            } else if (inner.delta?.type === "input_json_delta" && currentTool) {
              currentTool.jsonBuf += inner.delta.partial_json as string;
            }

          } else if (inner?.type === "content_block_stop" && currentTool) {
            try {
              const input = JSON.parse(currentTool.jsonBuf || "{}") as Record<string, unknown>;
              pendingToolInputs.push({ toolName: currentTool.name, input });
            } catch { /* ignore */ }
            currentTool = null;
          }

        } else if (ev.type === "user") {
          // Detect permission requests from tool_result blocks
          const content: Array<{ type: string; content?: string }> = ev.message?.content ?? [];
          for (const block of content) {
            if (block.type === "tool_result" && typeof block.content === "string") {
              const match = block.content.match(/Claude requested permissions? to (?:write|edit|create|modify|read|delete|execute|run)\s+(.+)/i);
              if (match) {
                onEvent({ type: "permission_request", filePath: match[1].trim(), toolInputs: [...pendingToolInputs] });
                pendingToolInputs = []; // reset for next round
              }
            }
          }

        } else if (ev.type === "assistant") {
          // Final complete message — use as authoritative text and catch any tool use
          const content: Array<{ type: string; text?: string; name?: string }> =
            ev.message?.content ?? [];
          let finalText = "";
          for (const block of content) {
            if (block.type === "text" && block.text) finalText += block.text;
            else if (block.type === "tool_use" && block.name) {
              onEvent({ type: "tool_use", toolName: block.name });
            }
          }
          if (finalText) {
            streamingText = finalText; // sync in case deltas diverged
            onEvent({ type: "text", text: finalText });
          }

        } else if (ev.type === "result") {
          fireDone();
        }
      } catch {
        // non-JSON line, ignore
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    dbg("[SideChat] stderr:", chunk.toString().trim());
  });

  proc.on("close", (code) => {
    dbg("[SideChat] process closed, exit code:", code);
    fireDone();
  });
  proc.on("error", (err) => {
    onEvent({ type: "error", error: err.message });
    fireDone();
  });

  return () => proc.kill("SIGTERM");
}

export function launchClaudeAuth(binaryPath: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CLAUDECODE;
  env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH ?? ""}`;

  // spawn with no shell (safe) — args are fixed strings
  const proc = spawn(binaryPath, ["auth", "login"], {
    env,
    detached: true,
    stdio: "ignore",
  });
  proc.unref();
}
