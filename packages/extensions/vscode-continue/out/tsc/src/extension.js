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
function activate(context) {
    console.log("[Sleepy] activating extension");
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("sleepy.chat", {
        resolveWebviewView(view) {
            view.webview.options = { enableScripts: true };
            view.webview.html = `<!DOCTYPE html><html><body style="padding:12px;font-family:system-ui;color:var(--vscode-editor-foreground)"><h2>Sleepy Code</h2><p>Connected.</p></body></html>`;
        },
    }));
    context.subscriptions.push(vscode.commands.registerCommand("sleepy.chat", () => {
        vscode.commands.executeCommand("workbench.view.extension.sleepy-sidebar");
    }));
    console.log("[Sleepy] activation complete");
}
function deactivate() { }
//# sourceMappingURL=extension.js.map