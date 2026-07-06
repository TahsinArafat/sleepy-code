import * as vscode from "vscode";
import { SleepyAuth } from "../auth/sleepy-auth";
export declare class SleepyChatProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly _auth;
    static readonly viewType = "sleepy.chat";
    private _view?;
    constructor(_extensionUri: vscode.Uri, _auth: SleepyAuth);
    resolveWebviewView(webviewView: vscode.WebviewView): void;
    private _postAuthState;
    private _getHtml;
    private _handleMessage;
    private _handleReady;
    private _postModels;
    private _handleChat;
    private _postMessage;
}
