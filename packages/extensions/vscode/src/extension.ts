import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SleepyChatProvider } from "./chat/webview-provider";
import { SleepyAutocompleteProvider } from "./completion/provider";
import { SleepyStatusBar } from "./status/status-bar";
import { SleepyAuth } from "./auth/sleepy-auth";
import { ContinueConfigWriter } from "./auth/continue-config";

const GATEWAY_PATH = path.join(os.homedir(), ".config", "sleepy", "gateway.json");

export function activate(context: vscode.ExtensionContext) {
  const auth = new SleepyAuth();
  const statusBar = new SleepyStatusBar(auth);
  const continueCfg = new ContinueConfigWriter(auth);

  // Watch gateway.json for changes (e.g., after 'sleepy login' completes)
  let lastMtime = 0;
  try { lastMtime = fs.statSync(GATEWAY_PATH).mtimeMs; } catch {}
  const watcher = setInterval(() => {
    try {
      const mtime = fs.statSync(GATEWAY_PATH).mtimeMs;
      if (mtime > lastMtime) {
        lastMtime = mtime;
        auth.recheck();
        statusBar.update();
        vscode.commands.executeCommand("sleepy.refreshModels");
        continueCfg.sync();
      }
    } catch {
      // gateway.json deleted
    }
  }, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(watcher) });

  // Register chat sidebar
  const chatProvider = new SleepyChatProvider(context.extensionUri, auth);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("sleepy.chat", chatProvider)
  );

  // Register autocomplete
  const completionProvider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    new SleepyAutocompleteProvider(auth)
  );
  context.subscriptions.push(completionProvider);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("sleepy.chat", () => {
      vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar");
    }),
    vscode.commands.registerCommand("sleepy.login", () => {
      if (auth.isAuthenticated) {
        vscode.window.showInformationMessage(
          "Already logged in" + (auth.gateway?.email ? " as " + auth.gateway.email : "")
        );
        return;
      }
      auth.loginViaTerminal();
    }),
    vscode.commands.registerCommand("sleepy.logout", async () => {
      continueCfg.removeSleepyModels();
      auth.recheck();
      statusBar.update();
      vscode.window.showInformationMessage("Sleepy session removed from Continue config.");
    }),
    vscode.commands.registerCommand("sleepy.syncContinue", () => {
      const ok = continueCfg.sync();
      if (ok) {
        vscode.window.showInformationMessage(
          auth.models.length > 0
            ? `Synced ${auth.models.length} Sleepy models to Continue config`
            : "Synced — no Sleepy models available (login first?)"
        );
      } else {
        vscode.window.showErrorMessage("Failed to sync to Continue config.");
      }
    }),
    vscode.commands.registerCommand("sleepy.autocomplete.toggle", () => {
      auth.toggleAutocomplete();
      statusBar.update();
      vscode.window.showInformationMessage(
        "Autocomplete " + (auth.isAutocompleteEnabled ? "enabled" : "disabled")
      );
    }),
    vscode.commands.registerCommand("sleepy.refreshModels", async () => {
      await auth.refreshModels();
      statusBar.update();
      continueCfg.sync();
      vscode.window.showInformationMessage(
        auth.models.length > 0 ? `Loaded ${auth.models.length} models` : "No models loaded"
      );
    })
  );

  // Initial sync to Continue
  continueCfg.sync();
  statusBar.update();
}
