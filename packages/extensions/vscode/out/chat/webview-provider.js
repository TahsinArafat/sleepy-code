"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepyChatProvider = void 0;
class SleepyChatProvider {
    _extensionUri;
    _auth;
    static viewType = "sleepy.chat";
    _view;
    constructor(_extensionUri, _auth) {
        this._extensionUri = _extensionUri;
        this._auth = _auth;
    }
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtml();
        webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));
        this._auth.onAuthChange(() => this._postAuthState());
    }
    _postAuthState() {
        this._postMessage({
            type: "authState",
            authenticated: this._auth.isAuthenticated,
            email: this._auth.gateway?.email || null,
        });
    }
    _getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-sideBar-background);overflow:hidden;height:100vh;display:flex;flex-direction:column}

#header{display:flex;align-items:center;padding:8px 12px;gap:8px;border-bottom:1px solid var(--vscode-panel-border);min-height:40px}
#header .brand{font-weight:600;font-size:13px;flex:1}
#header .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot.on{background:#4ade80}.dot.off{background:#a1a1aa}.dot.busy{background:#fbbf24;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

#login-view{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px;text-align:center}
#login-view h2{font-size:16px;font-weight:600}
#login-view p{color:var(--vscode-descriptionForeground);font-size:13px;max-width:260px;line-height:1.5}
#login-view button{padding:8px 24px;font-size:13px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;cursor:pointer;font-weight:500}
#login-view button:hover{opacity:.9}
#login-view .sub{font-size:11px;color:var(--vscode-descriptionForeground)}
#login-view .sub code{font-size:11px;background:var(--vscode-textBlockQuote-background);padding:1px 5px;border-radius:3px}

#chat-view{flex:1;display:none;flex-direction:column;overflow:hidden}

#messages{flex:1;overflow-y:auto;padding:8px 12px}
.msgs-empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--vscode-descriptionForeground);font-size:12px;text-align:center;padding:32px;line-height:1.6}

.msg{padding:8px 12px;margin:4px 0;line-height:1.6;font-size:13px}
.msg.user{background:var(--vscode-textBlockQuote-background);border-radius:8px;margin-left:16px}
.msg.assistant{background:transparent;margin-right:16px}

.msg .header{font-size:11px;font-weight:600;margin-bottom:4px;opacity:.8}
.msg.user .header{color:var(--vscode-focusBorder)}
.msg.assistant .header{color:var(--vscode-editorInfo-foreground)}

.msg .body{word-wrap:break-word}
.msg .body p{margin:4px 0}
.msg .body ul,.msg .body ol{padding-left:20px;margin:4px 0}
.msg .body code{font-size:12px;background:var(--vscode-textBlockQuote-background);padding:1px 4px;border-radius:3px;font-family:var(--vscode-editor-font-family)}
.msg .body pre{margin:8px 0;border-radius:6px;overflow-x:auto;position:relative}
.msg .body pre code{display:block;padding:12px;background:var(--vscode-textBlockQuote-background);font-size:12px;line-height:1.5;overflow-x:auto}
.msg .body pre .copy-btn{position:absolute;top:4px;right:4px;padding:2px 6px;font-size:10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;cursor:pointer;opacity:0;transition:opacity .15s}
.msg .body pre:hover .copy-btn{opacity:.8}
.msg .body pre .copy-btn:active{opacity:1}

.cursor{display:inline-block;width:6px;height:15px;background:var(--vscode-editor-foreground);animation:blink 1s step-end infinite;vertical-align:text-bottom;margin-left:1px}
@keyframes blink{0%,100%{opacity:0}50%{opacity:1}}

#input-row{display:flex;gap:6px;padding:8px 12px;border-top:1px solid var(--vscode-panel-border);align-items:flex-end}
#input-row textarea{flex:1;padding:8px 10px;font-size:13px;font-family:inherit;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:8px;resize:none;min-height:36px;max-height:120px;outline:none}
#input-row textarea:focus{border-color:var(--vscode-focusBorder)}
#input-row textarea:disabled{opacity:.4}
#input-row button{padding:6px 14px;font-size:13px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:8px;cursor:pointer;min-height:36px;font-weight:500}
#input-row button:disabled{opacity:.4;cursor:default}
#input-row button:not(:disabled):hover{opacity:.9}

#model-bar{display:flex;align-items:center;gap:6px;padding:4px 12px 0}
#model-bar select{flex:1;padding:2px 6px;font-size:11px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);border-radius:4px}
#model-bar .hint{font-size:10px;color:var(--vscode-descriptionForeground)}
</style>
</head>
<body>

<div id="header">
  <span class="brand">Sleepy Code</span>
  <span class="dot off" id="dot"></span>
</div>

<div id="login-view">
  <h2>Welcome to Sleepy Code</h2>
  <p>Sign in to start using AI in your editor. Your terminal session is shared — just log in once.</p>
  <button id="login-btn">Login with Browser</button>
  <span class="sub">Or run <code>sleepy login</code> in your terminal</span>
</div>

<div id="chat-view">
  <div id="model-bar"><select id="model-select"></select></div>
  <div id="messages"><div class="msgs-empty">Send a message to start chatting.</div></div>
  <div id="input-row">
    <textarea id="prompt" rows="1" placeholder="Type a message... (Enter to send, Shift+Enter for new line)"></textarea>
    <button id="send-btn">Send</button>
  </div>
</div>

<script>
(function() {
  const api = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const msgEl = $('messages');
  const promptEl = $('prompt');
  const sendBtn = $('send-btn');
  const modelSelect = $('model-select');
  const loginView = $('login-view');
  const chatView = $('chat-view');
  const dot = $('dot');

  let ready = false;

  function esc(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

  function setOnline(on) { dot.className = 'dot ' + (on ? 'on' : 'off'); }
  function setBusy(b) { if(b) dot.className = 'dot busy'; else setOnline(true); }

  function setInput(dis) {
    promptEl.disabled = dis;
    sendBtn.disabled = dis;
    if (!dis) setTimeout(() => promptEl.focus(), 100);
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try { return marked.parse(text, { breaks: true, gfm: true }); } catch {}
    }
    return '<p>' + esc(text).replace(/\\n/g, '<br>') + '</p>';
  }

  // Add copy handlers after render
  function addCopyButtons() {
    msgEl.querySelectorAll('pre .copy-btn').forEach(b => b.remove());
    msgEl.querySelectorAll('pre').forEach(pre => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        const code = pre.querySelector('code');
        navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      };
      pre.appendChild(btn);
    });
  }

  function addMsg(role, content, model) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = '<div class="header">' + (role === 'user' ? 'You' : esc(model || 'Assistant')) + '</div>';
    const body = document.createElement('div');
    body.className = 'body';
    if (role === 'user') {
      body.innerHTML = '<p>' + esc(content) + '</p>';
    } else {
      body.innerHTML = renderMarkdown(content);
    }
    div.appendChild(body);
    msgEl.appendChild(div);
    msgEl.querySelector('.msgs-empty')?.remove();
    addCopyButtons();
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return body;
  }

  function send() {
    const text = promptEl.value.trim();
    if (!text || promptEl.disabled) return;
    addMsg('user', text);
    api.postMessage({ type: 'chat', text, model: modelSelect.value });
    promptEl.value = '';
    promptEl.style.height = 'auto';
    setInput(true);
  }

  function authed(auth, email) {
    if (auth) {
      loginView.style.display = 'none';
      chatView.style.display = 'flex';
      setOnline(true);
      setInput(false);
      if (!ready) { api.postMessage({ type: 'ready' }); ready = true; }
    } else {
      loginView.style.display = 'flex';
      chatView.style.display = 'none';
      setOnline(false);
    }
  }

  // Event handlers
  $('login-btn').onclick = () => api.postMessage({ type: 'login' });

  promptEl.oninput = () => {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 120) + 'px';
  };
  promptEl.onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };
  sendBtn.onclick = send;

  window.addEventListener('message', e => {
    const m = e.data;
    switch (m.type) {
      case 'authState':
        authed(m.authenticated, m.email);
        break;
      case 'setModels':
        modelSelect.innerHTML = m.models.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
        setInput(false);
        break;
      case 'addMsg':
        addMsg(m.role, m.content, m.model);
        setInput(false);
        break;
      case 'streamChunk':
        const last = msgEl.querySelector('.msg.assistant:last-child .body');
        const cursor = last?.querySelector('.cursor');
        if (cursor) cursor.remove();
        if (last) {
          // Not ideal — for streaming we use plain text, not markdown
          const textNode = document.createTextNode(m.text);
          last.appendChild(textNode);
          last.appendChild(document.createTextNode(''));
          const c = document.createElement('span');
          c.className = 'cursor';
          last.appendChild(c);
          last.parentElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        break;
      case 'streamEnd':
        const b = msgEl.querySelector('.msg.assistant:last-child .body');
        if (b) { const c = b.querySelector('.cursor'); if (c) c.remove(); }
        // Re-render the assistant message as markdown
        const lastAssistant = msgEl.querySelector('.msg.assistant:last-child');
        if (lastAssistant) {
          const body = lastAssistant.querySelector('.body');
          if (body) {
            const raw = body.textContent;
            body.innerHTML = renderMarkdown(raw);
            addCopyButtons();
          }
        }
        setInput(false);
        break;
      case 'error':
        addMsg('assistant', '[Error] ' + m.text);
        setInput(false);
        break;
    }
  });

  // Initial load
  api.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
    }
    async _handleMessage(message) {
        switch (message.type) {
            case "ready":
                await this._handleReady();
                break;
            case "chat":
                await this._handleChat(message.text, message.model);
                break;
            case "login":
                this._auth.loginViaTerminal();
                break;
            case "refreshModels":
                await this._auth.refreshModels();
                this._postModels();
                this._postMessage({ type: "authState", authenticated: this._auth.isAuthenticated, email: this._auth.gateway?.email || null });
                break;
        }
    }
    async _handleReady() {
        this._postAuthState();
        if (!this._auth.isAuthenticated)
            return;
        await this._auth.refreshModels();
        this._postModels();
    }
    _postModels() {
        if (this._auth.models.length === 0) {
            this._postMessage({ type: "addMsg", role: "assistant", content: "No models found. Check your Sleepy account." });
            return;
        }
        this._postMessage({ type: "setModels", models: this._auth.models });
    }
    async _handleChat(text, modelId) {
        if (!this._auth.token) {
            this._postMessage({ type: "error", text: "Not authenticated. Login first." });
            return;
        }
        const model = modelId || this._auth.models[0]?.id || "deepseek-v4-flash";
        this._postMessage({ type: "addMsg", role: "assistant", content: "⏳", model });
        try {
            const res = await fetch(`${this._auth.dashboardUrl}/api/v1/chat/completions`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this._auth.token}` },
                body: JSON.stringify({ model, messages: [{ role: "user", content: text }], stream: true }),
            });
            if (res.status === 401) {
                if (await this._auth.refreshToken())
                    return this._handleChat(text, modelId);
                this._postMessage({ type: "error", text: "Session expired. Please login again." });
                return;
            }
            if (!res.ok) {
                this._postMessage({ type: "error", text: `${res.status}: ${res.statusText}` });
                return;
            }
            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let streamStarted = false;
            while (reader) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data: "))
                        continue;
                    const dataStr = trimmed.slice(6);
                    if (dataStr === "[DONE]")
                        continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta?.content;
                        if (delta) {
                            if (!streamStarted) {
                                this._postMessage({ type: "addMsg", role: "assistant", content: "", model });
                                streamStarted = true;
                            }
                            this._postMessage({ type: "streamChunk", text: delta });
                        }
                    }
                    catch { }
                }
            }
            this._postMessage({ type: "streamEnd" });
        }
        catch (err) {
            this._postMessage({
                type: "error",
                text: err.name === "AbortError" ? "Request cancelled" : (err.message || "Request failed"),
            });
        }
    }
    _postMessage(message) { this._view?.webview.postMessage(message); }
}
exports.SleepyChatProvider = SleepyChatProvider;
//# sourceMappingURL=webview-provider.js.map