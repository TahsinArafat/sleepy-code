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
exports.ApplyManager = void 0;
const applyCodeBlock_1 = require("core/edit/lazy/applyCodeBlock");
const uri_1 = require("core/util/uri");
const vscode = __importStar(require("vscode"));
const myers_1 = require("core/diff/myers");
const util_1 = require("core/diff/util");
const applyAbortManager_1 = require("core/edit/applyAbortManager");
const streamDiffLines_1 = require("core/edit/streamDiffLines");
const countTokens_1 = require("core/llm/countTokens");
const util_2 = require("core/util");
/**
 * Handles applying text/code to files including diff generation and streaming
 */
class ApplyManager {
    ide;
    webviewProtocol;
    verticalDiffManager;
    configHandler;
    constructor(ide, webviewProtocol, verticalDiffManager, configHandler) {
        this.ide = ide;
        this.webviewProtocol = webviewProtocol;
        this.verticalDiffManager = verticalDiffManager;
        this.configHandler = configHandler;
    }
    async applyToFile({ streamId, filepath, text, toolCallId, isSearchAndReplace, }) {
        if (filepath) {
            await this.ensureFileOpen(filepath);
        }
        const { activeTextEditor } = vscode.window;
        if (!activeTextEditor) {
            void vscode.window.showErrorMessage("No active editor to apply edits to");
            return;
        }
        // Capture the original file content before applying changes
        const originalFileContent = activeTextEditor.document.getText();
        await this.webviewProtocol.request("updateApplyState", {
            streamId,
            status: "streaming",
            fileContent: text,
            originalFileContent,
            toolCallId,
        });
        const hasExistingDocument = !!activeTextEditor.document.getText().trim();
        if (hasExistingDocument) {
            // Currently `isSearchAndReplace` will always provide a full file rewrite
            // as the contents of `text`, so we can just instantly apply
            if (isSearchAndReplace) {
                await this.verticalDiffManager.instantApplyDiff(originalFileContent, text, streamId, toolCallId);
            }
            else {
                await this.handleExistingDocument(activeTextEditor, text, streamId, toolCallId);
            }
        }
        else {
            await this.handleEmptyDocument(activeTextEditor, text, streamId, toolCallId);
        }
    }
    async ensureFileOpen(filepath) {
        const fileExists = await this.ide.fileExists(filepath);
        if (!fileExists) {
            await this.ide.writeFile(filepath, "");
            await this.ide.openFile(filepath);
        }
        await this.ide.openFile(filepath);
    }
    modelIsTooFastForStreaming(model) {
        return [/mercury/].some((r) => r.test(model));
    }
    async handleEmptyDocument(editor, text, streamId, toolCallId) {
        await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), text));
        await this.webviewProtocol.request("updateApplyState", {
            streamId,
            status: "closed",
            numDiffs: 0,
            fileContent: text,
            toolCallId,
        });
    }
    async handleExistingDocument(editor, text, streamId, toolCallId) {
        const { config } = await this.configHandler.loadConfig();
        if (!config) {
            void vscode.window.showErrorMessage("Config not loaded");
            return;
        }
        const llm = config.selectedModelByRole.apply ?? config.selectedModelByRole.chat;
        if (!llm) {
            void vscode.window.showErrorMessage(`No model with roles "apply" or "chat" found in config.`);
            return;
        }
        const fileUri = editor.document.uri.toString();
        const abortManager = applyAbortManager_1.ApplyAbortManager.getInstance();
        const abortController = abortManager.get(fileUri);
        const { isInstantApply, diffLinesGenerator } = await (0, applyCodeBlock_1.applyCodeBlock)(editor.document.getText(), text, (0, uri_1.getUriPathBasename)(fileUri), llm, abortController);
        if (isInstantApply) {
            await this.verticalDiffManager.streamDiffLines(diffLinesGenerator, isInstantApply, streamId, toolCallId);
        }
        else {
            await this.handleNonInstantDiff(editor, text, llm, streamId, this.verticalDiffManager, toolCallId, !this.modelIsTooFastForStreaming(llm.model));
        }
    }
    /**
     * Creates a prompt for applying code edits
     */
    getApplyPrompt(text) {
        return `The following code was suggested as an edit:\n\`\`\`\n${text}\n\`\`\`\nPlease apply it to the previous code. Leave existing comments in place unless changes require modifying them.`;
    }
    /**
     * Calculates prefix and suffix for a given range, shared between streaming and non-streaming modes
     */
    calculatePrefixSuffix(editor, range, llm) {
        const rangeContent = editor.document.getText(range);
        const prefix = (0, countTokens_1.pruneLinesFromTop)(editor.document.getText(new vscode.Range(new vscode.Position(0, 0), range.start)), llm.contextLength / 4, llm.model);
        const suffix = (0, countTokens_1.pruneLinesFromBottom)(editor.document.getText(new vscode.Range(range.end, new vscode.Position(editor.document.lineCount, 0))), llm.contextLength / 4, llm.model);
        return { prefix, suffix, rangeContent };
    }
    async handleNonInstantDiff(editor, text, llm, streamId, verticalDiffManager, toolCallId, streaming = true) {
        const { config } = await this.configHandler.loadConfig();
        if (!config) {
            void vscode.window.showErrorMessage("Config not loaded");
            return;
        }
        const prompt = this.getApplyPrompt(text);
        const fullEditorRange = new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length);
        const rangeToApplyTo = editor.selection.isEmpty
            ? fullEditorRange
            : editor.selection;
        if (streaming) {
            await verticalDiffManager.streamEdit({
                input: prompt,
                llm,
                streamId,
                range: rangeToApplyTo,
                newCode: text,
                toolCallId,
                rulesToInclude: undefined, // No rules for apply
                isApply: true,
            });
        }
        else {
            // Non-streaming: accumulate LLM output, then apply via Myers diff
            const finalContent = await this.generateAppliedContent(editor, prompt, llm, rangeToApplyTo, text);
            if (finalContent) {
                const diffLinesGenerator = (0, util_1.generateLines)((0, myers_1.myersDiff)(editor.document.getText(), finalContent));
                await verticalDiffManager.streamDiffLines(diffLinesGenerator, true, // Apply instantly since we accumulated all content
                streamId, toolCallId);
            }
        }
    }
    /**
     * Generates the final applied content by accumulating all LLM output
     * Similar to streamEdit but collects all output before applying
     */
    async generateAppliedContent(editor, prompt, llm, range, newCode) {
        const fileUri = editor.document.uri.toString();
        const { prefix, suffix, rangeContent } = this.calculatePrefixSuffix(editor, range, llm);
        const abortManager = applyAbortManager_1.ApplyAbortManager.getInstance();
        const abortController = abortManager.get(fileUri);
        try {
            const streamedLines = [];
            // Use streamDiffLines to get the LLM output
            const stream = (0, streamDiffLines_1.streamDiffLines)({
                highlighted: rangeContent,
                prefix,
                suffix,
                input: prompt,
                language: (0, util_2.getMarkdownLanguageTagForFile)(fileUri),
                type: "apply",
                newCode,
                includeRulesInSystemMessage: false,
                modelTitle: llm.title ?? llm.model,
            }, llm, abortController, undefined, undefined);
            // Accumulate all the streamed content
            for await (const line of stream) {
                if (abortController.signal.aborted) {
                    return undefined;
                }
                if (line.type === "new" || line.type === "same") {
                    streamedLines.push(line.line);
                }
            }
            // Return the complete file content
            return `${prefix}${streamedLines.join("\n")}${suffix}`;
        }
        catch (error) {
            console.error("Error generating applied content:", error);
            return undefined;
        }
    }
}
exports.ApplyManager = ApplyManager;
//# sourceMappingURL=ApplyManager.js.map