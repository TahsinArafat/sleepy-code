import * as vscode from "vscode";
import { SleepyAuth } from "../auth/sleepy-auth";
export declare class SleepyAutocompleteProvider implements vscode.InlineCompletionItemProvider {
    private _auth;
    private _debounceTimer;
    private _abortController;
    constructor(_auth: SleepyAuth);
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, _context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | undefined>;
}
