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
exports.VerticalDiffHandler = void 0;
const myers_1 = require("core/diff/myers");
const URI = __importStar(require("uri-js"));
const vscode = __importStar(require("vscode"));
const decorations_1 = require("./decorations");
const util_1 = require("./util");
class VerticalDiffHandler {
    startLine;
    endLine;
    editor;
    editorToVerticalDiffCodeLens;
    clearForFileUri;
    refreshCodeLens;
    options;
    insertedInCurrentBlock = 0;
    streamId;
    disposables = [];
    currentLineIndex;
    cancelled = false;
    newLinesAdded = 0;
    deletionBuffer = [];
    removedLineDecorations;
    addedLineDecorations;
    _diffLinesQueue = [];
    _queueLock = false;
    constructor(startLine, endLine, editor, editorToVerticalDiffCodeLens, clearForFileUri, refreshCodeLens, options) {
        this.startLine = startLine;
        this.endLine = endLine;
        this.editor = editor;
        this.editorToVerticalDiffCodeLens = editorToVerticalDiffCodeLens;
        this.clearForFileUri = clearForFileUri;
        this.refreshCodeLens = refreshCodeLens;
        this.options = options;
        this.currentLineIndex = startLine;
        this.streamId = options.streamId;
        this.removedLineDecorations = new decorations_1.RemovedLineDecorationManager(this.editor);
        this.addedLineDecorations = new decorations_1.AddedLineDecorationManager(this.editor);
        const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (!editor) {
                return;
            }
            // When we switch away and back to this editor, need to re-draw decorations
            if (URI.equal(editor.document.uri.toString(), this.fileUri)) {
                this.editor = editor;
                this.removedLineDecorations.applyToNewEditor(editor);
                this.addedLineDecorations.applyToNewEditor(editor);
                this.updateIndexLineDecorations();
                this.refreshCodeLens();
                // Handle any lines received while editor was closed
                this.queueDiffLine(undefined);
            }
        });
        this.disposables.push(disposable);
    }
    /**  ensures the current target file is open and focused before performing edits*/
    async ensureCurrentFileIsFocused() {
        const targetUri = this.editor.document.uri;
        const active = vscode.window.activeTextEditor;
        if (active &&
            URI.equal(active.document.uri.toString(), targetUri.toString())) {
            this.editor = active;
            return;
        }
        const visible = vscode.window.visibleTextEditors.find((foundEditor) => URI.equal(foundEditor.document.uri.toString(), targetUri.toString()));
        if (visible) {
            await vscode.window.showTextDocument(visible.document, {
                preview: false,
                preserveFocus: false,
                viewColumn: visible.viewColumn,
            });
            this.editor = vscode.window.activeTextEditor ?? visible;
            return;
        }
        const doc = await vscode.workspace.openTextDocument(targetUri);
        const editor = await vscode.window.showTextDocument(doc, {
            preview: false,
            preserveFocus: false,
        });
        this.editor = editor;
    }
    get range() {
        const startLine = Math.min(this.startLine, this.endLine);
        const endLine = Math.max(this.startLine, this.endLine);
        return new vscode.Range(startLine, 0, endLine, Number.MAX_SAFE_INTEGER);
    }
    get isCancelled() {
        return this.cancelled;
    }
    get fileUri() {
        return this.editor.document.uri.toString();
    }
    async clear(accept) {
        vscode.commands.executeCommand("setContext", "continue.streamingDiff", false);
        const removedRanges = this.removedLineDecorations.ranges;
        if (accept) {
            // Accept all: delete all the red ranges and clear green decorations
            await this.deleteRangeLines(removedRanges.map((r) => r.range));
        }
        else {
            await this.unifiedRejectAll();
        }
        this.clearDecorations();
        this.options.onStatusUpdate("closed", this.editorToVerticalDiffCodeLens.get(this.fileUri)?.length ?? 0, this.editor.document.getText());
        this.cancelled = true;
        this.refreshCodeLens();
        this.dispose();
    }
    dispose() {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
    async queueDiffLine(diffLine) {
        if (diffLine) {
            this._diffLinesQueue.push(diffLine);
        }
        if (this._queueLock || this.editor !== vscode.window.activeTextEditor) {
            return;
        }
        this._queueLock = true;
        while (this._diffLinesQueue.length) {
            const line = this._diffLinesQueue.shift();
            if (!line) {
                break;
            }
            try {
                await this._handleDiffLine(line);
            }
            catch (e) {
                // If editor is switched between calling _handleDiffLine and the edit actually being executed
                this._diffLinesQueue.push(line);
                break;
            }
        }
        this._queueLock = false;
    }
    async run(diffLineGenerator) {
        let diffLines = [];
        try {
            // As an indicator of loading
            this.updateIndexLineDecorations();
            for await (const diffLine of diffLineGenerator) {
                if (this.isCancelled) {
                    return;
                }
                diffLines.push(diffLine);
                await this.queueDiffLine(diffLine);
            }
            // Clear deletion buffer
            await this.insertDeletionBuffer();
            const myersDiffs = await this.reapplyWithMyersDiff(diffLines);
            // Scroll to the first diff
            const scrollToLine = (0, util_1.getFirstChangedLine)(myersDiffs, this.startLine) ?? this.startLine;
            const range = new vscode.Range(scrollToLine, 0, scrollToLine, 0);
            this.editor.revealRange(range, vscode.TextEditorRevealType.Default);
            this.options.onStatusUpdate("done", this.editorToVerticalDiffCodeLens.get(this.fileUri)?.length ?? 0, this.editor.document.getText());
            // Reject on user typing
            // const listener = vscode.workspace.onDidChangeTextDocument((e) => {
            //   if (URI.equal(e.document.uri.toString(), this.fileUri)) {
            //     this.clear(false);
            //     listener.dispose();
            //   }
            // });
        }
        catch (e) {
            this.clearForFileUri(this.fileUri, false);
            throw e;
        }
        return diffLines;
    }
    async acceptRejectBlock(accept, startLine, numGreen, numRed, skipStatusUpdate) {
        if (numGreen > 0) {
            // Delete the editor decoration
            this.addedLineDecorations.deleteRangeStartingAt(startLine + numRed);
            if (!accept) {
                // Delete the actual lines
                await this.deleteLinesAt(startLine + numRed, numGreen);
            }
        }
        if (numRed > 0) {
            const deleted = this.removedLineDecorations.deleteRangesStartingAt(startLine);
            await this.deleteLinesAt(startLine, numRed);
            if (deleted && !accept) {
                await this.insertTextAboveLine(startLine, deleted.map((r) => r.line).join("\n"));
            }
        }
        // Shift everything below upward
        const offset = -(accept ? numRed : numGreen);
        this.removedLineDecorations.shiftDownAfterLine(startLine, offset);
        this.addedLineDecorations.shiftDownAfterLine(startLine, offset);
        // Shift the codelens objects
        this.shiftCodeLensObjects(startLine, offset);
        if (!skipStatusUpdate) {
            const numDiffs = this.editorToVerticalDiffCodeLens.get(this.fileUri)?.length ?? 0;
            const status = numDiffs === 0 ? "closed" : undefined;
            this.options.onStatusUpdate(status, numDiffs, this.editor.document.getText());
        }
    }
    updateLineDelta(fileUri, startLine, lineDelta) {
        // Retrieve the diff blocks for the given file
        const blocks = this.editorToVerticalDiffCodeLens.get(fileUri);
        if (!blocks) {
            return;
        }
        // Update decorations
        this.removedLineDecorations.shiftDownAfterLine(startLine, lineDelta);
        this.addedLineDecorations.shiftDownAfterLine(startLine, lineDelta);
        // Update code lens
        this.shiftCodeLensObjects(startLine, lineDelta);
    }
    hasDiffForCurrentFile() {
        const diffBlocks = this.editorToVerticalDiffCodeLens.get(this.fileUri);
        return diffBlocks !== undefined && diffBlocks.length > 0;
    }
    clearDecorations() {
        this.removedLineDecorations.clear();
        this.addedLineDecorations.clear();
        this.clearIndexLineDecorations();
        this.editorToVerticalDiffCodeLens.delete(this.fileUri);
        this.refreshCodeLens();
    }
    /**
     * This method is used to apply diff decorations after the intiial stream.
     * This is to handle scenarios where we miscalculate the original diff blocks,
     * and decide to follow up with a deterministic algorithm like Myers Diff once
     * we have received all of the diff lines.
     */
    async reapplyWithMyersDiff(diffLines) {
        // Diff is messed up without this delay.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await this.ensureCurrentFileIsFocused();
        // First, we reset the original diff by rejecting all pending diff blocks
        const blocks = this.editorToVerticalDiffCodeLens.get(this.fileUri) ?? [];
        for (const block of blocks.reverse()) {
            await this.acceptRejectBlock(false, block.start, block.numGreen, block.numRed, true);
        }
        this.clearDecorations();
        // Then, get our old/new file content based on the original lines
        // We need the input to be "newline terminated" rather than
        // newline separated, because myersDiff() would consider
        // ["A"] => "A" and ["A", ""] => "A\n" to be the same single line.
        // "A\n" and "A\n\n" are unambiguous.
        const oldContentWithoutTrailingNewline = diffLines
            .filter((line) => line.type === "same" || line.type === "old")
            .map((line) => line.line)
            .join("\n");
        const oldFileContent = oldContentWithoutTrailingNewline + "\n";
        const newFileContent = diffLines
            .filter((line) => line.type === "same" || line.type === "new")
            .map((line) => line.line)
            .join("\n") + "\n";
        const myersDiffs = (0, myers_1.myersDiff)(oldFileContent, newFileContent);
        // Preserve the trailing newline behavior by checking the original document content
        const originalDocumentContent = this.editor.document.getText(this.range);
        const originalContentEndsWithNewline = originalDocumentContent.endsWith("\n");
        // Add trailing newline only if the original file had one to prevent line count discrepancies
        const replaceContent = myersDiffs
            .map((diff) => (diff.type === "old" ? "" : diff.line))
            .join("\n") + (originalContentEndsWithNewline ? "\n" : "");
        // Then, we insert our diff lines
        await this.editor.edit((editBuilder) => {
            editBuilder.replace(this.range, replaceContent),
                { undoStopAfter: false, undoStopBefore: false };
        });
        // Lastly, we apply decorations
        let numRed = 0;
        let numGreen = 0;
        const codeLensBlocks = [];
        myersDiffs.forEach((diff, index) => {
            if (diff.type === "old") {
                this.removedLineDecorations.addLine(this.startLine + index, diff.line);
                numRed++;
            }
            else if (diff.type === "new") {
                this.addedLineDecorations.addLine(this.startLine + index);
                numGreen++;
            }
            else if (diff.type === "same" && (numRed > 0 || numGreen > 0)) {
                codeLensBlocks.push({
                    numRed,
                    numGreen,
                    start: this.startLine + index - numRed - numGreen,
                });
                numRed = 0;
                numGreen = 0;
            }
        });
        if (numRed > 0 || numGreen > 0) {
            codeLensBlocks.push({
                numGreen,
                numRed,
                start: this.startLine + myersDiffs.length - numRed - numGreen,
            });
        }
        this.editorToVerticalDiffCodeLens.set(this.fileUri, codeLensBlocks);
        this.refreshCodeLens();
        return myersDiffs;
    }
    async insertDeletionBuffer() {
        if (this.deletionBuffer.length || this.insertedInCurrentBlock > 0) {
            const blocks = this.editorToVerticalDiffCodeLens.get(this.fileUri) || [];
            blocks.push({
                start: this.currentLineIndex - this.insertedInCurrentBlock,
                numRed: this.deletionBuffer.length,
                numGreen: this.insertedInCurrentBlock,
            });
            this.editorToVerticalDiffCodeLens.set(this.fileUri, blocks);
        }
        if (this.deletionBuffer.length === 0) {
            this.insertedInCurrentBlock = 0;
            return;
        }
        // Insert the block of deleted lines as empty new lines
        await this.insertTextAboveLine(this.currentLineIndex - this.insertedInCurrentBlock, "\n".repeat(this.deletionBuffer.length - 1));
        this.removedLineDecorations.addLines(this.currentLineIndex - this.insertedInCurrentBlock, this.deletionBuffer);
        // Shift green decorations downward
        this.addedLineDecorations.shiftDownAfterLine(this.currentLineIndex - this.insertedInCurrentBlock, this.deletionBuffer.length);
        // Update line index, clear buffer
        for (let i = 0; i < this.deletionBuffer.length; i++) {
            this.incrementCurrentLineIndex();
        }
        this.deletionBuffer = [];
        this.insertedInCurrentBlock = 0;
        this.refreshCodeLens();
    }
    incrementCurrentLineIndex() {
        this.currentLineIndex++;
        this.updateIndexLineDecorations();
        const range = new vscode.Range(this.currentLineIndex, 0, this.currentLineIndex, 0);
        this.editor.revealRange(range, vscode.TextEditorRevealType.Default);
    }
    async insertTextAboveLine(index, text) {
        await this.ensureCurrentFileIsFocused();
        await this.editor.edit((editBuilder) => {
            const lineCount = this.editor.document.lineCount;
            if (index >= lineCount) {
                // Append to end of file
                editBuilder.insert(new vscode.Position(lineCount, this.editor.document.lineAt(lineCount - 1).text.length), `\n${text}`);
            }
            else {
                editBuilder.insert(new vscode.Position(index, 0), `${text}\n`);
            }
        }, { undoStopAfter: false, undoStopBefore: false });
    }
    async insertLineAboveIndex(index, line) {
        await this.insertTextAboveLine(index, line);
        this.addedLineDecorations.addLine(index);
        this.newLinesAdded++;
    }
    async deleteLinesAt(index, numLines = 1) {
        const startLine = new vscode.Position(index, 0);
        await this.ensureCurrentFileIsFocused();
        await this.editor.edit((editBuilder) => {
            editBuilder.delete(new vscode.Range(startLine, startLine.translate(numLines)));
        }, { undoStopAfter: false, undoStopBefore: false });
    }
    async deleteRangeLines(ranges) {
        await this.ensureCurrentFileIsFocused();
        await this.editor.edit((editBuilder) => {
            for (const range of ranges) {
                editBuilder.delete(new vscode.Range(range.start, new vscode.Position(range.end.line + 1, 0)));
            }
        }, { undoStopAfter: false, undoStopBefore: false });
    }
    updateIndexLineDecorations() {
        if (this.options.instant) {
            // We don't show progress on instant apply
            return;
        }
        // Highlight the line at the currentLineIndex
        // And lightly highlight all lines between that and endLine
        if (this.currentLineIndex - this.newLinesAdded >= this.endLine) {
            this.editor.setDecorations(decorations_1.indexDecorationType, []);
            this.editor.setDecorations(decorations_1.belowIndexDecorationType, []);
        }
        else {
            const start = new vscode.Position(this.currentLineIndex, 0);
            this.editor.setDecorations(decorations_1.indexDecorationType, [
                new vscode.Range(start, new vscode.Position(start.line, Number.MAX_SAFE_INTEGER)),
            ]);
            const end = new vscode.Position(this.endLine, 0);
            this.editor.setDecorations(decorations_1.belowIndexDecorationType, [
                new vscode.Range(start.translate(1), end.translate(this.newLinesAdded)),
            ]);
        }
    }
    clearIndexLineDecorations() {
        this.editor.setDecorations(decorations_1.belowIndexDecorationType, []);
        this.editor.setDecorations(decorations_1.indexDecorationType, []);
    }
    async _handleDiffLine(diffLine) {
        switch (diffLine.type) {
            case "same":
                await this.insertDeletionBuffer();
                this.incrementCurrentLineIndex();
                break;
            case "old":
                // Add to deletion buffer and delete the line for now
                this.deletionBuffer.push(diffLine.line);
                await this.deleteLinesAt(this.currentLineIndex);
                break;
            case "new":
                await this.insertLineAboveIndex(this.currentLineIndex, diffLine.line);
                this.incrementCurrentLineIndex();
                this.insertedInCurrentBlock++;
                break;
        }
    }
    shiftCodeLensObjects(startLine, offset) {
        // Shift the codelens objects
        const blocks = this.editorToVerticalDiffCodeLens
            .get(this.fileUri)
            ?.filter((x) => x.start !== startLine)
            .map((x) => {
            if (x.start > startLine) {
                return { ...x, start: x.start + offset };
            }
            return x;
        }) || [];
        this.editorToVerticalDiffCodeLens.set(this.fileUri, blocks);
        this.refreshCodeLens();
    }
    /**
     * Rejects all diffs in a single edit operation.
     */
    async unifiedRejectAll() {
        await this.ensureCurrentFileIsFocused();
        const removedRanges = this.removedLineDecorations.ranges;
        const addedRanges = this.addedLineDecorations.ranges;
        const operations = [];
        for (const r of removedRanges) {
            operations.push({
                type: "removed",
                line: r.line,
                range: r.range,
            });
        }
        for (const range of addedRanges) {
            operations.push({
                type: "added",
                range,
            });
        }
        operations.sort((a, b) => b.range.start.line - a.range.start.line);
        const document = this.editor.document;
        const lines = document.getText().split("\n");
        for (const op of operations) {
            const lineNum = op.range.start.line;
            if (op.type === "removed") {
                // Replace the placeholder line with the original content
                lines[lineNum] = op.line;
            }
            else if (op.type === "added") {
                // Delete the added lines
                const startLine = op.range.start.line;
                const endLine = op.range.end.line;
                const numLinesToDelete = endLine - startLine + 1;
                lines.splice(startLine, numLinesToDelete);
            }
        }
        const finalContent = lines.join("\n");
        await this.editor.edit((editBuilder) => {
            const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
            editBuilder.replace(fullRange, finalContent);
        }, { undoStopAfter: false, undoStopBefore: false });
    }
}
exports.VerticalDiffHandler = VerticalDiffHandler;
//# sourceMappingURL=handler.js.map