import * as vscode from "vscode";
import type { ApplyState, DiffLine } from "core";
import type { VerticalDiffCodeLens } from "./manager";
export interface VerticalDiffHandlerOptions {
    input?: string;
    instant?: boolean;
    onStatusUpdate: (status?: ApplyState["status"], numDiffs?: ApplyState["numDiffs"], fileContent?: ApplyState["fileContent"]) => void;
    streamId?: string;
}
export declare class VerticalDiffHandler implements vscode.Disposable {
    private startLine;
    private endLine;
    private editor;
    private readonly editorToVerticalDiffCodeLens;
    private readonly clearForFileUri;
    private readonly refreshCodeLens;
    options: VerticalDiffHandlerOptions;
    insertedInCurrentBlock: number;
    streamId?: string;
    disposables: vscode.Disposable[];
    private currentLineIndex;
    private cancelled;
    private newLinesAdded;
    private deletionBuffer;
    private removedLineDecorations;
    private addedLineDecorations;
    private _diffLinesQueue;
    private _queueLock;
    constructor(startLine: number, endLine: number, editor: vscode.TextEditor, editorToVerticalDiffCodeLens: Map<string, VerticalDiffCodeLens[]>, clearForFileUri: (fileUri: string | undefined, accept: boolean) => void, refreshCodeLens: () => void, options: VerticalDiffHandlerOptions);
    /**  ensures the current target file is open and focused before performing edits*/
    private ensureCurrentFileIsFocused;
    get range(): vscode.Range;
    get isCancelled(): boolean;
    private get fileUri();
    clear(accept: boolean): Promise<void>;
    dispose(): void;
    queueDiffLine(diffLine: DiffLine | undefined): Promise<void>;
    run(diffLineGenerator: AsyncGenerator<DiffLine>): Promise<any[] | undefined>;
    acceptRejectBlock(accept: boolean, startLine: number, numGreen: number, numRed: number, skipStatusUpdate?: boolean): Promise<void>;
    updateLineDelta(fileUri: string, startLine: number, lineDelta: number): void;
    hasDiffForCurrentFile(): boolean;
    clearDecorations(): void;
    /**
     * This method is used to apply diff decorations after the intiial stream.
     * This is to handle scenarios where we miscalculate the original diff blocks,
     * and decide to follow up with a deterministic algorithm like Myers Diff once
     * we have received all of the diff lines.
     */
    reapplyWithMyersDiff(diffLines: DiffLine[]): Promise<any>;
    private insertDeletionBuffer;
    private incrementCurrentLineIndex;
    private insertTextAboveLine;
    private insertLineAboveIndex;
    private deleteLinesAt;
    private deleteRangeLines;
    private updateIndexLineDecorations;
    private clearIndexLineDecorations;
    private _handleDiffLine;
    private shiftCodeLensObjects;
    /**
     * Rejects all diffs in a single edit operation.
     */
    private unifiedRejectAll;
}
