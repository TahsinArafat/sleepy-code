import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
  console.log("[Sleepy] activating extension");
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("sleepy.chat", {
      resolveWebviewView(view) {
        view.webview.options = { enableScripts: true };
        view.webview.html = `<!DOCTYPE html><html><body style="padding:12px;font-family:system-ui;color:var(--vscode-editor-foreground)"><h2>Sleepy Code</h2><p>Connected.</p></body></html>`;
      },
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sleepy.chat", () => {
      vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar");
    })
  );
  console.log("[Sleepy] activation complete");
}

export function deactivate() {}
