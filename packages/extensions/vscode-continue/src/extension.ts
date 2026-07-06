import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

interface GatewayConfig {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  dashboard_url?: string;
}

class SleepyAuth {
  cfg: GatewayConfig | null = null;
  private _onChange = new Set<() => void>();
  constructor() { this.read(); }

  private configPath() { return path.join(os.homedir(), ".config", "sleepy", "gateway.json"); }
  read() { try { this.cfg = JSON.parse(fs.readFileSync(this.configPath(), "utf-8")); } catch { this.cfg = null; } }
  get token() { return this.cfg?.access_token; }
  get url() { return this.cfg?.dashboard_url || "https://www.sleepyai.org"; }
  get authed() { return !!this.token; }
  onChange(cb: () => void) { this._onChange.add(cb); return () => this._onChange.delete(cb); }
}

export function activate(context: vscode.ExtensionContext) {
  const auth = new SleepyAuth();
  const provider = new SleepyWebview(context.extensionUri, auth);

  // Poll gateway.json for login changes
  let lastMtime = 0;
  try { lastMtime = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs; } catch {}
  const watcher = setInterval(() => {
    try {
      const mtime = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs;
      if (mtime > lastMtime) { lastMtime = mtime; auth.read(); provider.postMsg({ messageType: "configUpdate", data: configData(auth) }); }
    } catch {}
  }, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(watcher) });

  context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", provider));
  context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () =>
    vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar")
  ));
}

function configData(auth: SleepyAuth) {
  return {
    models: auth.authed ? [
      { title: "Deepseek V4 Pro", provider: "openai", model: "deepseek-v4-pro", apiKey: auth.token, apiBase: `${auth.url}/api/v1`, completionOptions: { maxTokens: 4096 } },
      { title: "Deepseek V4 Flash", provider: "openai", model: "deepseek-v4-flash", apiKey: auth.token, apiBase: `${auth.url}/api/v1`, completionOptions: { maxTokens: 4096 } },
      { title: "Deepseek V3 R1", provider: "openai", model: "deepseek-v3-r1", apiKey: auth.token, apiBase: `${auth.url}/api/v1`, completionOptions: { maxTokens: 4096 } },
    ] : [],
    slashCommands: [],
    contextProviders: [],
    systemMessage: "",
    allowAnonymousTelemetry: false,
  };
}

class SleepyWebview implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _abort = new AbortController();
  constructor(private _uri: vscode.Uri, private _auth: SleepyAuth) {}

  postMsg(data: any) { this._view?.webview.postMessage(data); }

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this._uri] };
    view.webview.html = this._html();
    view.webview.onDidReceiveMessage((msg) => this._handle(msg));
  }

  private _html(): string {
    try {
      const distPath = vscode.Uri.joinPath(this._uri, "gui", "dist", "index.html");
      let html = fs.readFileSync(distPath.fsPath, "utf-8");
      const webviewUri = this._view!.webview.asWebviewUri(vscode.Uri.joinPath(this._uri, "gui", "dist")).toString();
      html = html.replace(/(href|src)="\/assets\//g, `$1="${webviewUri}/assets/`);
      return html;
    } catch {
      return `<!DOCTYPE html><html><body style="padding:20px;font-family:system-ui"><h2>Sleepy Code</h2><p>Build the GUI first: <code>cd gui && npm install && npm run build</code></p></body></html>`;
    }
  }

  private _callId = 0;
  private _pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

  private _call(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this._callId;
      this._pending.set(id, { resolve, reject });
      this._view?.webview.postMessage({ messageType: method, data: params, messageId: id });
    });
  }

  private async _handle(msg: any) {
    if (msg.messageId && this._pending.has(msg.messageId)) {
      const p = this._pending.get(msg.messageId)!;
      this._pending.delete(msg.messageId);
      if (msg.messageType === "error") p.reject(msg.data);
      else p.resolve(msg.data);
      return;
    }

    const method = msg.messageType || msg.type;
    const data = msg.data || msg;

    try {
      const result = await this._route(method, data);
      if (msg.messageId) this._view?.webview.postMessage({ messageType: method, data: result, messageId: msg.messageId });
    } catch (e: any) {
      if (msg.messageId) this._view?.webview.postMessage({ messageType: method, data: e.message || String(e), messageId: msg.messageId, status: "error" });
    }
  }

  private async _route(method: string, data: any): Promise<any> {
    switch (method) {
      // === Config ===
      case "config/getSerializedProfileInfo":
      case "config/reload":
        return {
          result: configData(this._auth),
          profileId: "sleepy",
          profileTitle: "Sleepy",
        };

      case "config/listProfiles":
        return { profiles: [{ id: "sleepy", title: "Sleepy" }], selectedProfileId: "sleepy" };

      case "config/addModel":
      case "config/addContextProvider":
      case "config/deleteModel":
      case "config/newPromptFile":
      case "config/ideSettingsUpdate":
      case "config/addOpenAiKey":
      case "config/openProfile":
      case "config/updateSelectedModel":
      case "config/refreshProfiles":
      case "config/updateSharedConfig":
      case "context/addDocs":
      case "context/removeDocs":
      case "context/indexDocs":
      case "history/save":
      case "history/delete":
      case "autocomplete/accept":
      case "devdata/log":
        return;

      case "config/deleteContextProvider":
        return false;

      case "getIdeInfo":
        return { ide: "vscode", name: "Visual Studio Code", version: vscode.version, extensionVersion: "0.0.1" };

      case "getWorkspaceDirs":
        return vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) || [];

      case "getCurrentFile":
        const editor = vscode.window.activeTextEditor;
        return editor ? { isUntitled: editor.document.isUntitled, path: editor.document.uri.fsPath, contents: editor.document.getText() } : undefined;

      case "readFile":
        return fs.readFileSync(data.filepath, "utf-8");

      case "fileExists":
        return fs.existsSync(data.filepath);

      case "openFile":
        await vscode.window.showTextDocument(vscode.Uri.file(data.path));
        return;

      case "runCommand":
        const term = vscode.window.createTerminal("Sleepy AI");
        term.show();
        term.sendText(data.command);
        return { status: "started" };

      case "subprocess":
        const { execSync } = require("child_process") as typeof import("child_process");
        const stdout = execSync(data.command, { cwd: data.cwd, encoding: "utf-8", maxBuffer: 1024 * 1024 });
        return [stdout, ""];

      case "getIdeSettings":
        return { remoteConfigServerUrl: undefined, remoteSyncEnabled: false };

      case "getUniqueId":
        return "sleepy-vscode-" + os.hostname();

      case "isTelemetryEnabled":
        return false;

      case "getOpenFiles":
        return vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => t.input && typeof t.input === "object" && "uri" in t.input ? (t.input as any).uri.fsPath : "")).filter(Boolean);

      case "getProblems":
        const diags = vscode.languages.getDiagnostics(vscode.Uri.file(data.filepath));
        return diags.map(d => ({ filepath: data.filepath, message: d.message, severity: d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning", range: { start: { line: d.range.start.line, character: d.range.start.character }, end: { line: d.range.end.line, character: d.range.end.character } } }));

      // === Chat / LLM ===
      case "llm/streamChat": {
        this._abort = new AbortController();
        const { messages, completionOptions, title } = data;
        const modelTitle = completionOptions?.model || data.modelTitle || title || "deepseek-v4-flash";
        const modelId = modelTitle; // Continue sends model title, but our API uses model ID
        try {
          const res = await fetch(`${this._auth.url}/api/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this._auth.token}` },
            body: JSON.stringify({ model: modelId, messages, stream: true, max_tokens: completionOptions?.maxTokens || 4096 }),
            signal: this._abort.signal,
          });
          if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data: ")) continue;
              const d = t.slice(6);
              if (d === "[DONE]") continue;
              try {
                const p = JSON.parse(d);
                const delta = p.choices?.[0]?.delta?.content;
                if (delta) this._view?.webview.postMessage({ messageType: "streamResponse", data: { content: delta, done: false } });
              } catch {}
            }
          }
          this._view?.webview.postMessage({ messageType: "streamResponse", data: { content: "", done: true } });
        } catch (e: any) {
          if (e.name !== "AbortError")
            this._view?.webview.postMessage({ messageType: "streamResponse", data: { content: "", done: true, error: e.message } });
        }
        return;
      }

      case "llm/streamComplete": {
        this._abort = new AbortController();
        const { prompt, completionOptions, title } = data;
        try {
          const res = await fetch(`${this._auth.url}/api/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this._auth.token}` },
            body: JSON.stringify({ model: title || "deepseek-v4-flash", messages: [{ role: "user", content: prompt }], stream: true, max_tokens: completionOptions?.maxTokens || 1024 }),
            signal: this._abort.signal,
          });
          if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let buffer = "", fullText = "";
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data: ")) continue;
              const d = t.slice(6);
              if (d === "[DONE]") continue;
              try {
                const p = JSON.parse(d);
                const delta = p.choices?.[0]?.delta?.content;
                if (delta) fullText += delta;
              } catch {}
            }
          }
          return { completion: fullText };
        } catch (e: any) {
          if (e.name !== "AbortError") throw e;
        }
        return;
      }

      case "command/run": {
        // For agent mode: chat with system context
        return this._route("llm/streamChat", {
          messages: [{ role: "system", content: "You are Sleepy AI, a coding assistant." }, { role: "user", content: data.input }],
          completionOptions: data.completionOptions,
          title: data.modelTitle,
        });
      }

      case "abort":
        this._abort.abort();
        return;

      case "ping":
        return "pong";

      case "llm/listModels":
        return ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v3-r1"];

      case "context/getContextItems":
        return [];

      case "context/loadSubmenuItems":
        return [];

      case "history/list":
        return [];

      case "history/load":
        return { title: "Session", sessionId: "new", workspaceDir: "", history: [] };

      case "autocomplete/complete":
        return [];

      case "autocomplete/cancel":
        return;

      case "chatDescriber/describe":
        return { title: "Chat", description: "" };

      case "stats/getTokensPerDay":
        return [];

      case "stats/getTokensPerModel":
        return [];

      case "getDiff":
        return [];

      case "getWorkspaceConfigs":
        return [];

      case "getTerminalContents":
        return "";

      default:
        console.log("[Sleepy] unhandled:", method);
        return;
    }
  }
}

export function deactivate() {}
