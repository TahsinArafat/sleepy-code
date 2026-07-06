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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
class Auth {
    cfg = null;
    models = [];
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
    async fetchModels() {
        if (!this.token)
            return;
        try {
            const r = await fetch(`${this.url}/api/v1/models`, { headers: { Authorization: `Bearer ${this.token}` } });
            if (r.ok) {
                const j = await r.json();
                this.models = (j.data ?? []).map((m) => ({ id: m.modelId ?? m.id, name: m.name ?? m.id, contextWindow: m.contextWindow ?? 128000 }));
            }
        }
        catch { }
    }
}
// ── Webview Provider ──────────────────────────────────────────────────────────
class SleepyWebview {
    _uri;
    _auth;
    _v;
    _abort = new AbortController();
    constructor(_uri, _auth) {
        this._uri = _uri;
        this._auth = _auth;
    }
    resolveWebviewView(view) {
        this._v = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = H(this._auth);
        view.webview.onDidReceiveMessage(m => this.handle(m));
        this.push({ t: "auth", authed: this._auth.authed, models: this._auth.models });
    }
    push(d) { this._v?.webview.postMessage(d); }
    async handle(m) {
        switch (m.t) {
            case "init":
                this.push({ t: "auth", authed: this._auth.authed, models: this._auth.models });
                break;
            case "chat":
                await this.chat(m.text, m.model);
                break;
            case "abort":
                this._abort.abort();
                break;
        }
    }
    async chat(text, modelId) {
        if (!this._auth.token) {
            this.push({ t: "err", msg: "Not logged in. Run: sleepy login" });
            return;
        }
        const model = modelId || this._auth.models[0]?.id || "deepseek-v4-pro";
        this._abort = new AbortController();
        this.push({ t: "streamStart" });
        try {
            const r = await fetch(`${this._auth.url}/api/v1/chat/completions`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this._auth.token}` },
                body: JSON.stringify({ model, messages: [{ role: "user", content: text }], stream: true }),
                signal: this._abort.signal,
            });
            if (!r.ok) {
                this.push({ t: "err", msg: `API ${r.status}: ${r.statusText}` });
                return;
            }
            const reader = r.body?.getReader();
            const dec = new TextDecoder();
            let buf = "";
            while (reader) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() || "";
                for (const l of lines) {
                    const t = l.trim();
                    if (!t.startsWith("data: "))
                        continue;
                    const d = t.slice(6);
                    if (d === "[DONE]")
                        continue;
                    try {
                        const p = JSON.parse(d);
                        const dt = p.choices?.[0]?.delta?.content;
                        if (dt)
                            this.push({ t: "stream", text: dt });
                    }
                    catch { }
                }
            }
            this.push({ t: "streamEnd" });
        }
        catch (e) {
            if (e.name !== "AbortError")
                this.push({ t: "err", msg: e.message || "Request failed" });
        }
    }
}
// ── HTML ──────────────────────────────────────────────────────────────────────
function H(auth) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:var(--vscode-sideBar-background);--fg:var(--vscode-editor-foreground);--muted:var(--vscode-descriptionForeground);--border:var(--vscode-panel-border);--input-bg:var(--vscode-input-background);--input-fg:var(--vscode-input-foreground);--btn-bg:var(--vscode-button-background);--btn-fg:var(--vscode-button-foreground);--accent:var(--vscode-focusBorder);--bubble:var(--vscode-textBlockQuote-background)}
body{font:13px/1.5 system-ui,-apple-system,sans-serif;color:var(--fg);background:var(--bg);height:100vh;display:flex;flex-direction:column}
.h{display:flex;align-items:center;padding:6px 10px;gap:6px;border-bottom:1px solid var(--border)}
.h .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot.on{background:#4ade80}.dot.off{background:#a1a1aa}
.h select{flex:1;font-size:12px;padding:2px 4px;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--border);border-radius:4px}
.m{flex:1;overflow-y:auto;padding:6px 10px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:92%;padding:8px 12px;border-radius:8px;line-height:1.55;font-size:13px;white-space:pre-wrap;word-break:break-word}
.msg.u{background:var(--bubble);align-self:flex-end;border-bottom-right-radius:2px}
.msg.a{align-self:flex-start;border-bottom-left-radius:2px}
.msg .lbl{font-size:10px;font-weight:600;margin-bottom:2px;opacity:.7}
.msg .lbl.u{color:var(--accent)}
.msg .lbl.a{color:#8b5cf6}
.empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;padding:20px}
.inp{display:flex;gap:4px;padding:6px 10px;border-top:1px solid var(--border)}
.inp textarea{flex:1;padding:6px 8px;font-size:13px;font-family:inherit;background:var(--input-bg);color:var(--input-fg);border:1px solid var(--border);border-radius:6px;resize:none;min-height:32px;max-height:100px;outline:none}
.inp textarea:focus{border-color:var(--accent)}
.inp button{padding:4px 12px;font-size:13px;background:var(--btn-bg);color:var(--btn-fg);border:none;border-radius:6px;cursor:pointer;min-height:32px}
.inp button:disabled{opacity:.4}
.login{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px}
.login h2{font-size:16px;font-weight:600}
.login p{color:var(--muted);font-size:12px;text-align:center}
.login button{padding:8px 20px;font-size:13px;background:var(--btn-bg);color:var(--btn-fg);border:none;border-radius:6px;cursor:pointer}
</style></head><body>
<div class="h"><span class="dot off" id="dot"></span><select id="msel"><option value="">Loading models...</option></select></div>
<div class="m" id="msg"><div class="empty">Send a message to start.</div></div>
<div class="inp"><textarea id="prompt" rows="1" placeholder="Message... (Enter to send)"></textarea><button id="send">Send</button></div>
<div class="login" id="login" style="display:none"><h2>Not logged in</h2><p>Run <code>sleepy login</code> in your terminal to get started.</p><button id="loginbtn">Open Terminal</button></div>
<script>
const V=acquireVsCodeApi();const $=id=>document.getElementById(id);
const dot=$('dot'),msel=$('msel'),msg=$('msg'),prompt=$('prompt'),send=$('send'),login=$('login');
let models=[],selectedModel="";
prompt.oninput=()=>{prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,100)+'px'};
prompt.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend()}};
send.onclick=doSend;$('loginbtn').onclick=()=>V.postMessage({t:'login'});
function doSend(){const t=prompt.value.trim();if(!t||send.disabled)return;addMsg('u',t);V.postMessage({t:'chat',text:t,model:selectedModel});prompt.value='';prompt.style.height='auto';send.disabled=prompt.disabled=true}
function addMsg(role,content){const d=document.createElement('div');d.className='msg '+role;d.innerHTML='<div class="lbl '+role+'">'+(role==='u'?'You':'Assistant')+'</div>'+esc(content);msg.appendChild(d);msg.querySelector('.empty')?.remove();d.scrollIntoView({behavior:'smooth',block:'end'});return d}
function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function setAuth(a,ml){dot.className='dot '+(a?'on':'off');if(a){login.style.display='none';msel.innerHTML=ml.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join('');if(ml.length){msel.selectedIndex=0;selectedModel=ml[0].id;}}else{login.style.display='flex';msel.innerHTML='<option value="">Login required</option>';}}
msel.onchange=()=>selectedModel=msel.value;
let streamTarget=null;
window.addEventListener('message',e=>{const m=e.data;switch(m.t){case'auth':setAuth(m.authed,m.models);break;case'streamStart':streamTarget=addMsg('a','');break;case'stream':if(streamTarget)streamTarget.innerHTML=streamTarget.innerHTML.replace(/<span class="cur".*<\/span>/g,'')+esc(m.text)+'<span class="cur" style="display:inline-block;width:6px;height:14px;background:var(--fg);animation:blink 1s step-end infinite;vertical-align:text-bottom"></span>';break;case'streamEnd':send.disabled=prompt.disabled=false;if(streamTarget){const c=streamTarget.querySelector('.cur');if(c)c.remove();streamTarget=null}break;case'err':send.disabled=prompt.disabled=false;addMsg('a','⚠ '+esc(m.msg));break}});
V.postMessage({t:'init'});
</script></body></html>`;
}
// ── Extension Entry ───────────────────────────────────────────────────────────
function activate(context) {
    const auth = new Auth();
    const provider = new SleepyWebview(context.extensionUri, auth);
    // Watch gateway.json
    let lastMtime = 0;
    try {
        lastMtime = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs;
    }
    catch { }
    const w = setInterval(async () => {
        try {
            const mt = fs.statSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json")).mtimeMs;
            if (mt > lastMtime) {
                lastMtime = mt;
                auth.read();
                await auth.fetchModels();
            }
        }
        catch { }
    }, 3000);
    context.subscriptions.push({ dispose: () => clearInterval(w) });
    // Fetch models on startup
    auth.fetchModels().then(() => { });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", provider));
    context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () => vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar")));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map