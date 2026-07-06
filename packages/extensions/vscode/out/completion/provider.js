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
exports.SleepyAutocompleteProvider = void 0;
const vscode = __importStar(require("vscode"));
class SleepyAutocompleteProvider {
    _auth;
    _debounceTimer = null;
    _abortController = null;
    constructor(_auth) {
        this._auth = _auth;
    }
    async provideInlineCompletionItems(document, position, _context, token) {
        if (!this._auth.isAutocompleteEnabled || !this._auth.isAuthenticated)
            return undefined;
        // Get context: current line text before cursor
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character).trim();
        // Only trigger on meaningful input (3+ chars, not just whitespace)
        if (prefix.length < 3 || /^[\s{}()\[\];,]+$/.test(prefix))
            return undefined;
        // Cancel any pending request
        if (this._abortController)
            this._abortController.abort();
        this._abortController = new AbortController();
        const languageId = document.languageId;
        // Debounce 300ms
        return new Promise((resolve) => {
            if (this._debounceTimer)
                clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(async () => {
                if (token.isCancellationRequested) {
                    resolve(undefined);
                    return;
                }
                const model = this._auth.models.find(m => m.id.includes("flash") || m.id.includes("mini")) || this._auth.models[0];
                if (!model) {
                    resolve(undefined);
                    return;
                }
                try {
                    const res = await fetch(`${this._auth.dashboardUrl}/api/v1/chat/completions`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this._auth.token}`,
                        },
                        body: JSON.stringify({
                            model: model.id,
                            messages: [
                                {
                                    role: "system",
                                    content: `You are a code completion engine for ${languageId}. Complete the code at the cursor. ` +
                                        `Respond with ONLY the completion text — no explanation, no markdown. ` +
                                        `Match the existing indentation and style.`,
                                },
                                { role: "user", content: lineText.substring(0, position.character) },
                            ],
                            max_tokens: 48,
                            temperature: 0.1,
                            stream: false,
                            stop: ["\n\n", "\n}", "\n]", "\n)"],
                        }),
                        signal: this._abortController.signal,
                    });
                    if (res.status === 401) {
                        const refreshed = await this._auth.refreshToken();
                        if (!refreshed) {
                            resolve(undefined);
                            return;
                        }
                    }
                    if (!res.ok) {
                        resolve(undefined);
                        return;
                    }
                    const data = await res.json();
                    const text = data.choices?.[0]?.message?.content;
                    if (text && text.trim()) {
                        resolve([new vscode.InlineCompletionItem(text.trim())]);
                        return;
                    }
                }
                catch {
                    // abort or network error — silently ignore
                }
                resolve(undefined);
            }, 300);
        });
    }
}
exports.SleepyAutocompleteProvider = SleepyAutocompleteProvider;
//# sourceMappingURL=provider.js.map