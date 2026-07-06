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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const webview_provider_1 = require("./chat/webview-provider");
const provider_1 = require("./completion/provider");
const status_bar_1 = require("./status/status-bar");
const sleepy_auth_1 = require("./auth/sleepy-auth");
const GATEWAY_PATH = path.join(os.homedir(), ".config", "sleepy", "gateway.json");
function activate(context) {
    const auth = new sleepy_auth_1.SleepyAuth();
    const statusBar = new status_bar_1.SleepyStatusBar(auth);
    // Watch gateway.json for changes (e.g., after 'sleepy login' completes)
    let lastMtime = 0;
    try {
        lastMtime = fs.statSync(GATEWAY_PATH).mtimeMs;
    }
    catch { }
    const watcher = setInterval(() => {
        try {
            const mtime = fs.statSync(GATEWAY_PATH).mtimeMs;
            if (mtime > lastMtime) {
                lastMtime = mtime;
                auth.recheck();
                statusBar.update();
                vscode.commands.executeCommand("sleepy.refreshModels");
            }
        }
        catch {
            // gateway.json deleted
        }
    }, 2000);
    context.subscriptions.push({ dispose: () => clearInterval(watcher) });
    // Register chat sidebar
    const chatProvider = new webview_provider_1.SleepyChatProvider(context.extensionUri, auth);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", chatProvider));
    // Register autocomplete
    const completionProvider = vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, new provider_1.SleepyAutocompleteProvider(auth));
    context.subscriptions.push(completionProvider);
    // Commands
    context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () => {
        vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar");
    }), vscode.commands.registerCommand("sleepy.login", () => {
        if (auth.isAuthenticated) {
            vscode.window.showInformationMessage("Already logged in" + (auth.gateway?.email ? " as " + auth.gateway.email : ""));
            return;
        }
        auth.loginViaTerminal();
    }), vscode.commands.registerCommand("sleepy.autocomplete.toggle", () => {
        auth.toggleAutocomplete();
        statusBar.update();
        vscode.window.showInformationMessage("Autocomplete " + (auth.isAutocompleteEnabled ? "enabled" : "disabled"));
    }), vscode.commands.registerCommand("sleepy.refreshModels", async () => {
        await auth.refreshModels();
        statusBar.update();
        vscode.window.showInformationMessage(auth.models.length > 0 ? `Loaded ${auth.models.length} models` : "No models loaded");
    }));
    statusBar.update();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map