import * as vscode from "vscode";
export declare const indexDecorationType: vscode.TextEditorDecorationType;
export declare const belowIndexDecorationType: vscode.TextEditorDecorationType;
export declare class AddedLineDecorationManager {
    private editor;
    constructor(editor: vscode.TextEditor);
    ranges: vscode.Range[];
    decorationType: vscode.TextEditorDecorationType;
    applyToNewEditor(newEditor: vscode.TextEditor): void;
    addLines(startIndex: number, numLines: number): void;
    addLine(index: number): void;
    clear(): void;
    shiftDownAfterLine(afterLine: number, offset: number): void;
    deleteRangeStartingAt(line: number): vscode.Range | undefined;
}
export declare class RemovedLineDecorationManager {
    private editor;
    constructor(editor: vscode.TextEditor);
    ranges: {
        line: string;
        range: vscode.Range;
        decoration: vscode.TextEditorDecorationType;
    }[];
    applyToNewEditor(newEditor: vscode.TextEditor): void;
    addLines(startIndex: number, lines: string[]): void;
    addLine(index: number, line: string): void;
    applyDecorations(): void;
    clear(): void;
    shiftDownAfterLine(afterLine: number, offset: number): void;
    deleteRangesStartingAt(line: number): {
        line: string;
        range: vscode.Range;
        decoration: vscode.TextEditorDecorationType;
    }[] | undefined;
}
