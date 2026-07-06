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
exports.VerticalDiffManager = void 0;
const streamDiffLines_1 = require("core/edit/streamDiffLines");
const countTokens_1 = require("core/llm/countTokens");
const util_1 = require("core/util");
const URI = __importStar(require("uri-js"));
const vscode = __importStar(require("vscode"));
const utils_1 = require("../../apply/utils");
const errorHandling_1 = require("../../util/errorHandling");
const myers_1 = require("core/diff/myers");
const applyAbortManager_1 = require("core/edit/applyAbortManager");
const constants_1 = require("core/edit/constants");
const messageContent_1 = require("core/util/messageContent");
const uri_1 = require("core/util/uri");
const EditOutcomeTracker_1 = require("../../extension/EditOutcomeTracker");
const handler_1 = require("./handler");
const util_2 = require("./util");
class VerticalDiffManager {
    webviewProtocol;
    editDecorationManager;
    ide;
    refreshCodeLens = () => { };
    fileUriToHandler = new Map();
    fileUriToCodeLens = new Map();
    userChangeListener;
    logDiffs;
    constructor(webviewProtocol, editDecorationManager, ide) {
        this.webviewProtocol = webviewProtocol;
        this.editDecorationManager = editDecorationManager;
        this.ide = ide;
        this.userChangeListener = undefined;
    }
    createVerticalDiffHandler(fileUri, startLine, endLine, options) {
        if (this.fileUriToHandler.has(fileUri)) {
            this.fileUriToHandler.get(fileUri)?.clear(false);
            this.fileUriToHandler.delete(fileUri);
        }
        const editor = vscode.window.activeTextEditor;
        if (editor && URI.equal(editor.document.uri.toString(), fileUri)) {
            const handler = new handler_1.VerticalDiffHandler(startLine, endLine, editor, this.fileUriToCodeLens, this.clearForfileUri.bind(this), this.refreshCodeLens, options);
            this.fileUriToHandler.set(fileUri, handler);
            return handler;
        }
        else {
            return undefined;
        }
    }
    getHandlerForFile(fileUri) {
        return this.fileUriToHandler.get(fileUri);
    }
    getStreamIdForFile(fileUri) {
        return this.fileUriToHandler.get(fileUri)?.streamId;
    }
    // Creates a listener for document changes by user.
    enableDocumentChangeListener() {
        if (this.userChangeListener) {
            //Only create one listener per file
            return;
        }
        this.userChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            // Check if there is an active handler for the affected file
            const fileUri = event.document.uri.toString();
            const handler = this.getHandlerForFile(fileUri);
            if (handler) {
                // If there is an active diff for that file, handle the document change
                this.handleDocumentChange(event, handler);
            }
        });
    }
    // Listener for user doc changes is disabled during updates to the text document by continue
    disableDocumentChangeListener() {
        if (this.userChangeListener) {
            this.userChangeListener.dispose();
            this.userChangeListener = undefined;
        }
    }
    handleDocumentChange(event, handler) {
        // Loop through each change in the event
        event.contentChanges.forEach((change) => {
            // Calculate the number of lines added or removed
            const linesAdded = change.text.split("\n").length - 1;
            const linesDeleted = change.range.end.line - change.range.start.line;
            const lineDelta = linesAdded - linesDeleted;
            // Update the diff handler with the new line delta
            handler.updateLineDelta(event.document.uri.toString(), change.range.start.line, lineDelta);
        });
    }
    clearForfileUri(fileUri, accept) {
        if (!fileUri) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            fileUri = activeEditor.document.uri.toString();
        }
        const handler = this.fileUriToHandler.get(fileUri);
        if (handler) {
            handler.clear(accept);
            this.fileUriToHandler.delete(fileUri);
        }
        this.disableDocumentChangeListener();
        void vscode.commands.executeCommand("setContext", "continue.diffVisible", false);
        void this.webviewProtocol.request("focusContinueInputWithoutClear", undefined);
    }
    async acceptRejectVerticalDiffBlock(accept, fileUri, index) {
        if (!fileUri) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            fileUri = activeEditor.document.uri.toString();
        }
        if (typeof index === "undefined") {
            index = 0;
        }
        const blocks = this.fileUriToCodeLens.get(fileUri);
        const block = blocks?.[index];
        if (!blocks || !block) {
            return;
        }
        const handler = this.getHandlerForFile(fileUri);
        if (!handler) {
            return;
        }
        // Disable listening to file changes while continue makes changes
        this.disableDocumentChangeListener();
        // CodeLens object removed from editorToVerticalDiffCodeLens here
        await handler.acceptRejectBlock(accept, block.start, block.numGreen, block.numRed);
        if (blocks.length === 1) {
            this.clearForfileUri(fileUri, true);
        }
        else {
            // Re-enable listener for user changes to file
            this.enableDocumentChangeListener();
        }
        this.refreshCodeLens();
    }
    async streamDiffLines(diffStream, instant, streamId, toolCallId) {
        vscode.commands.executeCommand("setContext", "continue.diffVisible", true);
        // Get the current editor fileUri/range
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const fileUri = editor.document.uri.toString();
        const startLine = 0;
        const endLine = editor.document.lineCount - 1;
        // Check for existing handlers in the same file the new one will be created in
        const existingHandler = this.getHandlerForFile(fileUri);
        if (existingHandler) {
            existingHandler.clear(false);
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 200);
        });
        // Create new handler with determined start/end
        const diffHandler = this.createVerticalDiffHandler(fileUri, startLine, endLine, {
            instant,
            onStatusUpdate: (status, numDiffs, fileContent) => void this.webviewProtocol.request("updateApplyState", {
                streamId,
                status,
                numDiffs,
                fileContent,
                filepath: fileUri,
                toolCallId,
            }),
            streamId,
        });
        if (!diffHandler) {
            console.warn("Issue occurred while creating new vertical diff handler");
            return;
        }
        if (editor.selection) {
            // Unselect the range
            editor.selection = new vscode.Selection(editor.selection.active, editor.selection.active);
        }
        vscode.commands.executeCommand("setContext", "continue.streamingDiff", true);
        try {
            this.logDiffs = await diffHandler.run(diffStream);
            // enable a listener for user edits to file while diff is open
            this.enableDocumentChangeListener();
        }
        catch (e) {
            this.disableDocumentChangeListener();
            const handled = await (0, errorHandling_1.handleLLMError)(e);
            if (!handled) {
                let message = "Error streaming diffs";
                if (e instanceof Error) {
                    message += `: ${e.message}`;
                }
                throw new Error(message);
            }
        }
        finally {
            vscode.commands.executeCommand("setContext", "continue.streamingDiff", false);
        }
    }
    async instantApplyDiff(oldContent, newContent, streamId, toolCallId) {
        vscode.commands.executeCommand("setContext", "continue.diffVisible", true);
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const fileUri = editor.document.uri.toString();
        const myersDiffs = (0, myers_1.myersDiff)(oldContent, newContent);
        const diffHandler = this.createVerticalDiffHandler(fileUri, 0, editor.document.lineCount - 1, {
            instant: true,
            onStatusUpdate: (status, numDiffs, fileContent) => void this.webviewProtocol.request("updateApplyState", {
                streamId,
                status,
                numDiffs,
                fileContent,
                filepath: fileUri,
                toolCallId,
            }),
            streamId,
        });
        if (!diffHandler) {
            console.warn("Issue occurred while creating vertical diff handler");
            return;
        }
        await diffHandler.reapplyWithMyersDiff(myersDiffs);
        const scrollToLine = (0, util_2.getFirstChangedLine)(myersDiffs, 0) ?? 0;
        const range = new vscode.Range(scrollToLine, 0, scrollToLine, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.Default);
        this.enableDocumentChangeListener();
        await this.webviewProtocol.request("updateApplyState", {
            streamId,
            status: "done",
            numDiffs: this.fileUriToCodeLens.get(fileUri)?.length ?? 0,
            fileContent: editor.document.getText(),
            filepath: fileUri,
            toolCallId,
        });
    }
    async streamEdit({ input, llm, streamId, quickEdit, range, newCode, toolCallId, rulesToInclude, isApply, }) {
        void vscode.commands.executeCommand("setContext", "continue.diffVisible", true);
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }
        const fileUri = editor.document.uri.toString();
        let startLine, endLine;
        if (range) {
            startLine = range.start.line;
            endLine = range.end.line;
        }
        else {
            startLine = editor.selection.start.line;
            endLine = editor.selection.end.line;
        }
        // Check for existing handlers in the same file the new one will be created in
        const existingHandler = this.getHandlerForFile(fileUri);
        if (existingHandler) {
            if (quickEdit) {
                // Previous diff was a quickEdit
                // Check if user has highlighted a range
                let rangeBool = startLine !== endLine ||
                    editor.selection.start.character !== editor.selection.end.character;
                // Check if the range is different from the previous range
                let newRangeBool = startLine !== existingHandler.range.start.line ||
                    endLine !== existingHandler.range.end.line;
                if (!rangeBool || !newRangeBool) {
                    // User did not highlight a new range -> use start/end from the previous quickEdit
                    startLine = existingHandler.range.start.line;
                    endLine = existingHandler.range.end.line;
                }
            }
            // Clear the previous handler
            // This allows the user to edit above the changed area,
            // but extra delta was added for each line generated by Continue
            // Before adding this back, we need to distinguish between human and Continue
            // let effectiveLineDelta =
            //   existingHandler.getLineDeltaBeforeLine(startLine);
            // startLine += effectiveLineDelta;
            // endLine += effectiveLineDelta;
            await existingHandler.clear(false);
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 150);
        });
        // Create new handler with determined start/end
        const diffHandler = this.createVerticalDiffHandler(fileUri, startLine, endLine, {
            instant: (0, utils_1.isFastApplyModel)(llm),
            input,
            onStatusUpdate: (status, numDiffs, fileContent) => streamId &&
                void this.webviewProtocol.request("updateApplyState", {
                    streamId,
                    status,
                    numDiffs,
                    fileContent,
                    filepath: fileUri,
                    toolCallId,
                }),
            streamId,
        });
        if (!diffHandler) {
            console.warn("Issue occurred while creating new vertical diff handler");
            return undefined;
        }
        let selectedRange = diffHandler.range;
        // Only if the selection is empty, use exact prefix/suffix instead of by line
        if (selectedRange.isEmpty) {
            selectedRange = new vscode.Range(editor.selection.start.with(undefined, 0), editor.selection.end.with(undefined, Number.MAX_SAFE_INTEGER));
        }
        const rangeContent = editor.document.getText(selectedRange);
        const prefix = (0, countTokens_1.pruneLinesFromTop)(editor.document.getText(new vscode.Range(new vscode.Position(0, 0), selectedRange.start)), llm.contextLength / 4, llm.model);
        const suffix = (0, countTokens_1.pruneLinesFromBottom)(editor.document.getText(new vscode.Range(selectedRange.end, new vscode.Position(editor.document.lineCount, 0))), llm.contextLength / 4, llm.model);
        let overridePrompt;
        if (llm.promptTemplates?.apply) {
            const filepath = (0, uri_1.getLastNPathParts)(fileUri, 1);
            const rendered = llm.renderPromptTemplate(llm.promptTemplates.apply, [], {
                original_code: rangeContent,
                new_code: newCode ?? "",
                filepath,
            });
            overridePrompt =
                typeof rendered === "string"
                    ? [{ role: "user", content: rendered }]
                    : rendered;
        }
        if (editor.selection) {
            // Unselect the range
            editor.selection = new vscode.Selection(editor.selection.active, editor.selection.active);
        }
        void vscode.commands.executeCommand("setContext", "continue.streamingDiff", true);
        this.editDecorationManager.clear();
        const abortManager = applyAbortManager_1.ApplyAbortManager.getInstance();
        const abortController = abortManager.get(fileUri);
        try {
            const streamedLines = [];
            async function* recordedStream() {
                const stream = (0, streamDiffLines_1.streamDiffLines)({
                    highlighted: rangeContent,
                    prefix,
                    suffix,
                    input,
                    language: (0, util_1.getMarkdownLanguageTagForFile)(fileUri),
                    type: isApply ? "apply" : "edit",
                    newCode: newCode ?? "",
                    includeRulesInSystemMessage: !!rulesToInclude && !isApply,
                    modelTitle: llm.title ?? llm.model,
                }, llm, abortController, overridePrompt, rulesToInclude);
                for await (const line of stream) {
                    if (line.type === "new" || line.type === "same") {
                        streamedLines.push(line.line);
                    }
                    yield line;
                }
            }
            this.logDiffs = await diffHandler.run(recordedStream());
            // enable a listener for user edits to file while diff is open
            this.enableDocumentChangeListener();
            if (abortController.signal.aborted) {
                void vscode.commands.executeCommand("continue.rejectDiff");
            }
            const fileAfterEdit = `${prefix}${streamedLines.join("\n")}${suffix}`;
            await this.trackEditInteraction({
                model: llm,
                filepath: fileUri,
                prompt: input,
                fileAfterEdit,
            });
            return fileAfterEdit;
        }
        catch (e) {
            this.disableDocumentChangeListener();
            const handled = await (0, errorHandling_1.handleLLMError)(e);
            if (!handled) {
                let message = "Error streaming edit diffs";
                if (e instanceof Error) {
                    message += `: ${e.message}`;
                }
                throw new Error(message);
            }
        }
        finally {
            void vscode.commands.executeCommand("setContext", "continue.streamingDiff", false);
        }
    }
    async trackEditInteraction({ model, filepath, prompt, fileAfterEdit, }) {
        // Get previous code content for outcome tracking
        const previousCode = await this.ide.readFile(filepath);
        const newCode = fileAfterEdit ?? "";
        const previousCodeLines = previousCode.split("\n").length;
        const newCodeLines = newCode.split("\n").length;
        const lineChange = newCodeLines - previousCodeLines;
        // Store pending edit data for outcome tracking
        EditOutcomeTracker_1.editOutcomeTracker.trackEditInteraction({
            streamId: constants_1.EDIT_MODE_STREAM_ID,
            timestamp: new Date().toISOString(),
            modelProvider: model.underlyingProviderName,
            modelName: model.title ?? "",
            modelTitle: model.title ?? "",
            prompt: (0, messageContent_1.stripImages)(prompt),
            completion: newCode,
            previousCode,
            newCode,
            filepath: filepath,
            previousCodeLines,
            newCodeLines,
            lineChange,
        });
    }
}
exports.VerticalDiffManager = VerticalDiffManager;
//# sourceMappingURL=manager.js.map