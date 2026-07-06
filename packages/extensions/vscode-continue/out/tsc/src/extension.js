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
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", provider));
    context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () => vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar")));
}
class SleepyWebview {
    _uri;
    _auth;
    _view;
    constructor(_uri, _auth) {
        this._uri = _uri;
        this._auth = _auth;
    }
    resolveWebviewView(view) {
        this._view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [this._uri] };
        view.webview.html = this._html();
    }
    _html() {
        try {
            const distPath = vscode.Uri.joinPath(this._uri, "gui", "dist", "index.html");
            let html = fs.readFileSync(distPath.fsPath, "utf-8");
            const webviewUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._uri, "gui", "dist")).toString();
            // Patch asset paths from absolute (/assets/...) to webview URIs
            html = html.replace(/(href|src)="\/assets\//g, `$1="${webviewUri}/assets/`);
            // Inject auth info
            html = html.replace("</head>", `<script>window.__SLEEPY_AUTH__=${JSON.stringify({ token: this._auth.token, url: this._auth.url })}</script></head>`);
            return html;
        }
        catch {
            return `<!DOCTYPE html><html><body style="padding:20px;font-family:system-ui"><h2>Sleepy Code</h2><p>Build the GUI first: <code>cd gui && npm install && npm run build</code></p></body></html>`;
        }
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map