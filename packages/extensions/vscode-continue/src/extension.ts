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
  constructor() { this.read(); }

  private configPath() { return path.join(os.homedir(), ".config", "sleepy", "gateway.json"); }
  read() { try { this.cfg = JSON.parse(fs.readFileSync(this.configPath(), "utf-8")); } catch { this.cfg = null; } }
  get token() { return this.cfg?.access_token; }
  get url() { return this.cfg?.dashboard_url || "https://www.sleepyai.org"; }
  get authed() { return !!this.token; }
}

export function activate(context: vscode.ExtensionContext) {
  const auth = new SleepyAuth();
  const provider = new SleepyWebview(context.extensionUri, auth);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", provider));
  context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () =>
    vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar")
  ));
}

class SleepyWebview implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  constructor(private _uri: vscode.Uri, private _auth: SleepyAuth) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this._uri] };
    view.webview.html = this._html();
  }

  private _html(): string {
    try {
      const distPath = vscode.Uri.joinPath(this._uri, "gui", "dist", "index.html");
      let html = fs.readFileSync(distPath.fsPath, "utf-8");
      const webviewUri = this._view!.webview.asWebviewUri(vscode.Uri.joinPath(this._uri, "gui", "dist")).toString();
      // Patch asset paths from absolute (/assets/...) to webview URIs
      html = html.replace(/(href|src)="\/assets\//g, `$1="${webviewUri}/assets/`);
      // Inject auth info
      html = html.replace("</head>", `<script>window.__SLEEPY_AUTH__=${JSON.stringify({ token: this._auth.token, url: this._auth.url })}</script></head>`);
      return html;
    } catch {
      return `<!DOCTYPE html><html><body style="padding:20px;font-family:system-ui"><h2>Sleepy Code</h2><p>Build the GUI first: <code>cd gui && npm install && npm run build</code></p></body></html>`;
    }
  }
}

export function deactivate() {}
