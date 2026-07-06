import { DiffLine, IDE, ILLM, RuleWithSource } from "core";
import * as vscode from "vscode";
import EditDecorationManager from "../../quickEdit/EditDecorationManager";
import { VsCodeWebviewProtocol } from "../../webviewProtocol";
import { VerticalDiffHandler, VerticalDiffHandlerOptions } from "./handler";
export interface VerticalDiffCodeLens {
    start: number;
    numRed: number;
    numGreen: number;
}
export declare class VerticalDiffManager {
    private readonly webviewProtocol;
    private readonly editDecorationManager;
    private readonly ide;
    refreshCodeLens: () => void;
    private fileUriToHandler;
    fileUriToCodeLens: Map<string, VerticalDiffCodeLens[]>;
    private userChangeListener;
    logDiffs: DiffLine[] | undefined;
    constructor(webviewProtocol: VsCodeWebviewProtocol, editDecorationManager: EditDecorationManager, ide: IDE);
    createVerticalDiffHandler(fileUri: string, startLine: number, endLine: number, options: VerticalDiffHandlerOptions): VerticalDiffHandler | undefined;
    getHandlerForFile(fileUri: string): VerticalDiffHandler | undefined;
    getStreamIdForFile(fileUri: string): string | undefined;
    private enableDocumentChangeListener;
    disableDocumentChangeListener(): void;
    private handleDocumentChange;
    clearForfileUri(fileUri: string | undefined, accept: boolean): void;
    acceptRejectVerticalDiffBlock(accept: boolean, fileUri?: string, index?: number): Promise<void>;
    streamDiffLines(diffStream: AsyncGenerator<DiffLine>, instant: boolean, streamId: string, toolCallId?: string): Promise<void>;
    instantApplyDiff(oldContent: string, newContent: string, streamId: string, toolCallId?: string): Promise<void>;
    streamEdit({ input, llm, streamId, quickEdit, range, newCode, toolCallId, rulesToInclude, isApply, }: {
        input: string;
        llm: ILLM;
        streamId?: string;
        quickEdit?: string;
        range?: vscode.Range;
        newCode?: string;
        toolCallId?: string;
        rulesToInclude: undefined | RuleWithSource[];
        isApply: boolean;
    }): Promise<string | undefined>;
    trackEditInteraction({ model, filepath, prompt, fileAfterEdit, }: {
        model: ILLM;
        filepath: string;
        prompt: string;
        fileAfterEdit: string | undefined;
    }): Promise<void>;
}
