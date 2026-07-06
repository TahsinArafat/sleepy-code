import * as vscode from "vscode";
import { SleepyAuth } from "../auth/sleepy-auth";

export class SleepyAutocompleteProvider implements vscode.InlineCompletionItemProvider {
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _abortController: AbortController | null = null;

  constructor(private _auth: SleepyAuth) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!this._auth.isAutocompleteEnabled || !this._auth.isAuthenticated) return undefined;

    // Get context: current line text before cursor
    const lineText = document.lineAt(position.line).text;
    const prefix = lineText.substring(0, position.character).trim();

    // Only trigger on meaningful input (3+ chars, not just whitespace)
    if (prefix.length < 3 || /^[\s{}()\[\];,]+$/.test(prefix)) return undefined;

    // Cancel any pending request
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    const languageId = document.languageId;

    // Debounce 300ms
    return new Promise((resolve) => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(async () => {
        if (token.isCancellationRequested) { resolve(undefined); return; }

        const model = this._auth.models.find(m => m.id.includes("flash") || m.id.includes("mini")) || this._auth.models[0];
        if (!model) { resolve(undefined); return; }

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
            signal: this._abortController!.signal,
          });

          if (res.status === 401) {
            const refreshed = await this._auth.refreshToken();
            if (!refreshed) { resolve(undefined); return; }
          }

          if (!res.ok) { resolve(undefined); return; }
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text && text.trim()) {
            resolve([new vscode.InlineCompletionItem(text.trim())]);
            return;
          }
        } catch {
          // abort or network error — silently ignore
        }
        resolve(undefined);
      }, 300);
    });
  }
}
