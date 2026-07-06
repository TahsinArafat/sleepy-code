import { ConfigHandler } from "core/config/ConfigHandler";
import { ApplyToFilePayload } from "core";
import { VerticalDiffManager } from "../diff/vertical/manager";
import { VsCodeIde } from "../VsCodeIde";
import { VsCodeWebviewProtocol } from "../webviewProtocol";
/**
 * Handles applying text/code to files including diff generation and streaming
 */
export declare class ApplyManager {
    private readonly ide;
    private readonly webviewProtocol;
    private readonly verticalDiffManager;
    private readonly configHandler;
    constructor(ide: VsCodeIde, webviewProtocol: VsCodeWebviewProtocol, verticalDiffManager: VerticalDiffManager, configHandler: ConfigHandler);
    applyToFile({ streamId, filepath, text, toolCallId, isSearchAndReplace, }: ApplyToFilePayload): Promise<void>;
    private ensureFileOpen;
    private modelIsTooFastForStreaming;
    private handleEmptyDocument;
    private handleExistingDocument;
    /**
     * Creates a prompt for applying code edits
     */
    private getApplyPrompt;
    /**
     * Calculates prefix and suffix for a given range, shared between streaming and non-streaming modes
     */
    private calculatePrefixSuffix;
    private handleNonInstantDiff;
    /**
     * Generates the final applied content by accumulating all LLM output
     * Similar to streamEdit but collects all output before applying
     */
    private generateAppliedContent;
}
