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
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
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
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:var(--vscode-editor-foreground);background:var(--vscode-sideBar-background);overflow-x:hidden}
#header{padding:8px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--vscode-panel-border);min-height:36px}
#header .brand{font-weight:600;font-size:13px;flex:1}
#status-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
#status-dot.online{background:#4ade80}
#status-dot.offline{background:#f87171}
#status-dot.loading{background:#fbbf24;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
#models-bar{padding:6px 10px;border-bottom:1px solid var(--vscode-panel-border);display:flex;gap:4px;align-items:center}
#models-bar select{flex:1;padding:3px 6px;font-size:12px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px}
#models-bar button{padding:3px 8px;font-size:11px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:3px;cursor:pointer}
#login-prompt{padding:20px 16px;text-align:center;display:none}
#login-prompt p{margin-bottom:12px;color:var(--vscode-descriptionForeground);font-size:13px}
#login-prompt button{padding:8px 20px;font-size:13px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:5px;cursor:pointer}
#messages{padding:8px 10px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px}
.msg{padding:8px 10px;border-radius:6px;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-size:13px}
.msg.user{background:var(--vscode-textBlockQuote-background);margin-left:16px;border-left:3px solid var(--vscode-focusBorder)}
.msg.assistant{background:var(--vscode-textBlockQuote-background);margin-right:16px}
.msg .label{font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:4px;font-weight:500}
.msg .model-tag{font-size:10px;color:var(--vscode-descriptionForeground);margin-top:4px;opacity:.7}
.msg .streaming-cursor{animation:blink 1s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
#input-area{padding:8px 10px;border-top:1px solid var(--vscode-panel-border);display:flex;gap:6px;align-items:flex-end}
#input-area textarea{flex:1;padding:6px 8px;font-size:13px;font-family:inherit;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;resize:none;min-height:32px;max-height:120px}
#input-area textarea:disabled{opacity:.5}
#input-area button{padding:6px 14px;font-size:13px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;cursor:pointer;min-height:32px}
#input-area button:disabled{opacity:.5;cursor:default}
.empty-state{text-align:center;padding:32px 16px;color:var(--vscode-descriptionForeground);font-size:12px;flex:1;display:flex;align-items:center;justify-content:center}
</style>
</head>
<body>
<div id="header">
  <span class="brand">Sleepy Code</span>
  <span id="status-dot" class="offline"></span>
</div>
<div id="models-bar" style="display:none">
  <select id="model-select"></select>
  <button id="refresh-models" title="Refresh models">↻</button>
</div>
<div id="login-prompt">
  <p>Sign in to use Sleepy Code in VS Code.</p>
  <button id="login-btn">Login with Browser</button>
</div>
<div id="messages-container" style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
  <div id="messages">
    <div class="empty-state">Send a message to start chatting.</div>
  </div>
  <div id="input-area">
    <textarea id="prompt" placeholder="Type a message..." rows="1" disabled></textarea>
    <button id="send" disabled>Send</button>
  </div>
</div>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const promptEl = document.getElementById('prompt');
  const sendBtn = document.getElementById('send');
  const modelSelect = document.getElementById('model-select');
  const loginPrompt = document.getElementById('login-prompt');
  const msgContainer = document.getElementById('messages-container');
  const statusDot = document.getElementById('status-dot');
  const modelsBar = document.getElementById('models-bar');
  const loginBtn = document.getElementById('login-btn');
  const refreshBtn = document.getElementById('refresh-models');

  function setOnline(on) { statusDot.className = on ? 'online' : 'offline'; }

  function streamTarget() {
    const msgs = messagesEl.querySelectorAll('.msg.assistant');
    const last = msgs[msgs.length - 1];
    if (last) {
      const content = last.querySelector('.content');
      if (content) return content;
    }
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.innerHTML = '<div class="content"></div>';
    messagesEl.appendChild(div);
    messagesEl.querySelector('.empty-state')?.remove();
    return div.querySelector('.content');
  }

  function addMessage(role, content, model) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    let html = '';
    if (model) html += '<div class="label">' + model + '</div>';
    html += '<div class="content">' + escapeHtml(content) + '</div>';
    if (role === 'assistant' && model) html += '<div class="model-tag">via ' + model + '</div>';
    div.innerHTML = html;
    messagesEl.appendChild(div);
    messagesEl.querySelector('.empty-state')?.remove();
    div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return div;
  }

  function escapeHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  function setInputState(disabled) {
    promptEl.disabled = disabled;
    sendBtn.disabled = disabled;
    if (!disabled) promptEl.focus();
  }

  promptEl.addEventListener('input', () => {
    promptEl.style.height = 'auto';
    promptEl.style.height = Math.min(promptEl.scrollHeight, 120) + 'px';
  });

  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  sendBtn.addEventListener('click', sendMessage);
  loginBtn.addEventListener('click', () => vscode.postMessage({ type: 'login' }));
  refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refreshModels' }));

  function sendMessage() {
    const text = promptEl.value.trim();
    if (!text || promptEl.disabled) return;
    addMessage('user', text);
    vscode.postMessage({ type: 'chat', text, model: modelSelect.value });
    promptEl.value = '';
    promptEl.style.height = 'auto';
    setInputState(true);
  }

  function showAuthState(authenticated, email) {
    if (authenticated) {
      loginPrompt.style.display = 'none';
      msgContainer.style.display = 'flex';
      modelsBar.style.display = 'flex';
      setOnline(true);
      if (!promptEl.disabled) promptEl.focus();
    } else {
      loginPrompt.style.display = 'block';
      msgContainer.style.display = 'none';
      setOnline(false);
    }
    vscode.postMessage({ type: 'ready' });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'authState':
        showAuthState(msg.authenticated, msg.email);
        break;
      case 'setModels':
        modelSelect.innerHTML = '<option value="">Select a model...</option>' +
          msg.models.map(m => '<option value="' + m.id + '">' + escapeHtml(m.name) + '</option>').join('');
        if (msg.models.length > 0) modelSelect.selectedIndex = 1;
        vscode.postMessage({ type: 'ready' });
        break;
      case 'addMessage':
        addMessage(msg.role, msg.content, msg.model);
        setInputState(false);
        break;
      case 'streamChunk':
        const target = streamTarget();
        const cursor = target.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();
        target.innerHTML += escapeHtml(msg.text);
        target.innerHTML += '<span class="streaming-cursor">▊</span>';
        target.closest('.msg').scrollIntoView({ behavior: 'smooth', block: 'end' });
        break;
      case 'streamEnd':
        const last = streamTarget();
        const cur = last.querySelector('.streaming-cursor');
        if (cur) cur.remove();
        setInputState(false);
        break;
      case 'error':
        addMessage('assistant', 'Error: ' + msg.text);
        setInputState(false);
        break;
    }
  });

  // Initial state
  vscode.postMessage({ type: 'ready' });
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
            this._postMessage({ type: "addMessage", role: "assistant", content: "No models found. Check your Sleepy account." });
            return;
        }
        this._postMessage({ type: "setModels", models: this._auth.models.map(m => ({ id: m.id, name: m.name })) });
    }
    async _handleChat(text, modelId) {
        if (!this._auth.token) {
            this._postMessage({ type: "error", text: "Not authenticated. Login first." });
            return;
        }
        const model = modelId || this._auth.models[0]?.id || "deepseek-v4-flash";
        try {
            const res = await fetch(`${this._auth.dashboardUrl}/api/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this._auth.token}`,
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: text }],
                    stream: true,
                }),
            });
            if (res.status === 401) {
                const refreshed = await this._auth.refreshToken();
                if (refreshed) {
                    return this._handleChat(text, modelId);
                }
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
                            this._postMessage({ type: "streamChunk", text: delta });
                        }
                        // Check for x-omniroute-tokens from OmniRoute comment headers
                        // These come as separate SSE comment lines before [DONE]
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
    _postMessage(message) {
        this._view?.webview.postMessage(message);
    }
}
exports.SleepyChatProvider = SleepyChatProvider;
//# sourceMappingURL=webview-provider.js.map