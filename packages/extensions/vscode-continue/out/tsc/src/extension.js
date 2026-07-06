"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class SleepyAuth {
    cfg = null;
    constructor() { this.read(); }
    configPath() { return path.join(os.homedir(), ".config", "sleepy", "gateway.json"); }
    read() { try {
        this.cfg = JSON.parse(fs.readFileSync(this.configPath(), "utf-8"));
    }
    catch {
        this.cfg = null;
    } }
    get token() { return this.cfg?.access_token; }
    get url() { return this.cfg?.dashboard_url || "https://www.sleepyai.org"; }
    get authed() { return !!this.token; }
}
function activate(context) {
    const auth = new SleepyAuth();
    const provider = new SleepyWebview(context.extensionUri, auth);
    let lastMtime = 0;
    try {
        lastMtime = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs;
    }
    catch { }
    const watcher = setInterval(() => {
        try {
            const mtime = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs;
            if (mtime > lastMtime) {
                lastMtime = mtime;
                auth.read();
            }
        }
        catch { }
    }, 5000);
    context.subscriptions.push({ dispose: () => clearInterval(watcher) });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", provider));
    context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () => vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar")));
}
class SleepyWebview {
    _uri;
    _auth;
    _view;
    _abort = new AbortController();
    constructor(_uri, _auth) {
        this._uri = _uri;
        this._auth = _auth;
    }
    resolveWebviewView(view) {
        this._view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this._uri, "gui", "dist")] };
        view.webview.html = this._html();
        view.webview.onDidReceiveMessage((msg) => this._handle(msg));
    }
    _html() {
        const distPath = vscode.Uri.joinPath(this._uri, "gui", "dist", "index.html");
        if (!fs.existsSync(distPath.fsPath)) {
            return `<!DOCTYPE html><html><body style="padding:12px;font-family:system-ui"><h2>Sleepy Code</h2><p>GUI not built yet. Run: cd gui && npm install && npm run build</p></body></html>`;
        }
        let html = fs.readFileSync(distPath.fsPath, "utf-8");
        const assetsUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._uri, "gui", "dist")).toString();
        html = html.replace(/(href|src)="\/assets\//g, `$1="${assetsUri}/assets/`);
        // The Continue GUI expects a global `vscode` object via declare const vscode: any
        const bridge = `<script>const vscode = acquireVsCodeApi();</script>`;
        html = html.replace("</body>", `${bridge}</body>`);
        return html;
    }
    async _handle(msg) {
        const method = msg.messageType || msg.type;
        if (!method)
            return;
        // onLoad is sent when the GUI first mounts — push config immediately
        if (method === "onLoad") {
            this._pushConfig();
            return;
        }
        try {
            const result = await this._route(method, msg.data || msg);
            if (msg.messageId)
                this._view?.webview.postMessage({ messageType: method, data: result, messageId: msg.messageId });
        }
        catch (e) {
            if (msg.messageId)
                this._view?.webview.postMessage({ messageType: method, data: e.message, messageId: msg.messageId, status: "error" });
        }
    }
    _pushConfig() {
        const models = this._auth.authed ? [
            { title: "Deepseek V4 Pro", provider: "openai", model: "deepseek-v4-pro", apiKey: this._auth.token, apiBase: `${this._auth.url}/api/v1`, completionOptions: { maxTokens: 4096 } },
            { title: "Deepseek V4 Flash", provider: "openai", model: "deepseek-v4-flash", apiKey: this._auth.token, apiBase: `${this._auth.url}/api/v1`, completionOptions: { maxTokens: 4096 } },
        ] : [];
        const data = { models, slashCommands: [], contextProviders: [], systemMessage: "", allowAnonymousTelemetry: false };
        this._view?.webview.postMessage({ messageType: "configUpdate", data });
    }
    async _route(method, data) {
        switch (method) {
            case "config/getSerializedProfileInfo":
            case "config/reload":
                return { result: { models: this._auth.authed ? [
                            { title: "Deepseek V4 Pro", provider: "openai", model: "deepseek-v4-pro", apiKey: this._auth.token, apiBase: `${this._auth.url}/api/v1` },
                            { title: "Deepseek V4 Flash", provider: "openai", model: "deepseek-v4-flash", apiKey: this._auth.token, apiBase: `${this._auth.url}/api/v1` },
                        ] : [] }, profileId: "sleepy", profileTitle: "Sleepy" };
            case "config/listProfiles":
                return { profiles: [{ id: "sleepy", title: "Sleepy" }], selectedProfileId: "sleepy" };
            case "llm/streamChat": {
                this._abort = new AbortController();
                const res = await fetch(`${this._auth.url}/api/v1/chat/completions`, {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this._auth.token}` },
                    body: JSON.stringify({ model: data.title || "deepseek-v4-pro", messages: data.messages, stream: true, max_tokens: data.completionOptions?.maxTokens || 4096 }),
                    signal: this._abort.signal,
                });
                if (!res.ok)
                    throw new Error(`API ${res.status}: ${res.statusText}`);
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (reader) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        const t = line.trim();
                        if (!t.startsWith("data: "))
                            continue;
                        const d = t.slice(6);
                        if (d === "[DONE]")
                            continue;
                        try {
                            const p = JSON.parse(d);
                            const delta = p.choices?.[0]?.delta?.content;
                            if (delta)
                                this._view?.webview.postMessage({ messageType: "streamResponse", data: { content: delta, done: false } });
                        }
                        catch { }
                    }
                }
                this._view?.webview.postMessage({ messageType: "streamResponse", data: { content: "", done: true } });
                return;
            }
            case "abort":
                this._abort.abort();
                return;
            case "ping": return "pong";
            case "getIdeInfo": return { ide: "vscode", name: "VS Code", version: vscode.version, extensionVersion: "0.1.0" };
            case "getWorkspaceDirs": return vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
            case "getCurrentFile": {
                const e = vscode.window.activeTextEditor;
                return e ? { isUntitled: e.document.isUntitled, path: e.document.uri.fsPath, contents: e.document.getText() } : undefined;
            }
            case "readFile": return fs.readFileSync(data.filepath, "utf-8");
            case "openFile":
                await vscode.window.showTextDocument(vscode.Uri.file(data.path));
                return;
            case "history/list": return [];
            case "history/load": return { title: "Session", sessionId: "new", workspaceDir: "", history: [] };
            case "context/getContextItems": return [];
            case "context/loadSubmenuItems": return [];
            default: return undefined;
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map