import * as vscode from "vscode";
export declare function translate(range: vscode.Range, lines: number): vscode.Range;
export declare function getNonce(): string;
export declare function getExtensionUri(): vscode.Uri;
export declare function getViewColumnOfFile(uri: vscode.Uri): vscode.ViewColumn | undefined;
export declare function getRightViewColumn(): vscode.ViewColumn;
export declare function openEditorAndRevealRange(uri: vscode.Uri, range?: vscode.Range, viewColumn?: vscode.ViewColumn, preview?: boolean): Promise<vscode.TextEditor>;
export declare function getUniqueId(): any;
