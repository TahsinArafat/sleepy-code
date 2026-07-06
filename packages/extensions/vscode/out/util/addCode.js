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
exports.getRangeInFileWithContents = getRangeInFileWithContents;
exports.addHighlightedCodeToContext = addHighlightedCodeToContext;
exports.addEntireFileToContext = addEntireFileToContext;
exports.isEmptyFile = isEmptyFile;
exports.addCodeToContextFromRange = addCodeToContextFromRange;
const os = __importStar(require("node:os"));
const vscode = __importStar(require("vscode"));
function getRangeInFileWithContents(allowEmpty, range) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const selection = editor.selection;
        const filepath = editor.document.uri.toString();
        if (range) {
            const contents = editor.document.getText(range);
            return {
                range: {
                    start: {
                        line: range.start.line,
                        character: range.start.character,
                    },
                    end: {
                        line: range.end.line,
                        character: range.end.character,
                    },
                },
                filepath,
                contents,
            };
        }
        if ((selection.isEmpty && !allowEmpty) || isEmptyFile(editor.document)) {
            return null;
        }
        let selectionRange;
        // if the selection is empty and document is not empty, select the whole document
        if (selection.isEmpty) {
            selectionRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).range.end.character));
        }
        if (!selectionRange) {
            selectionRange = new vscode.Range(selection.start, selection.end);
            const document = editor.document;
            // Select the context from the beginning of the selection start line to the selection start position
            const beginningOfSelectionStartLine = selection.start.with(undefined, 0);
            const textBeforeSelectionStart = document.getText(new vscode.Range(beginningOfSelectionStartLine, selection.start));
            // If there are only whitespace before the start of the selection, include the indentation
            if (textBeforeSelectionStart.trim().length === 0) {
                selectionRange = selectionRange.with({
                    start: beginningOfSelectionStartLine,
                });
            }
        }
        const contents = editor.document.getText(selectionRange);
        return {
            filepath,
            contents,
            range: {
                start: {
                    line: selectionRange.start.line,
                    character: selectionRange.start.character,
                },
                end: {
                    line: selectionRange.end.line,
                    character: selectionRange.end.character,
                },
            },
        };
    }
    return null;
}
async function addHighlightedCodeToContext(webviewProtocol) {
    // the passed argument below was set to true in https://github.com/continuedev/continue/pull/6711
    // which would add the entire file contents when selection is empty
    // some of this behaviour is reverted and needs further investigation
    const rangeInFileWithContents = getRangeInFileWithContents(false);
    if (rangeInFileWithContents) {
        webviewProtocol?.request("highlightedCode", {
            rangeInFileWithContents,
        });
    }
}
async function addEntireFileToContext(uri, webviewProtocol, ideUtils) {
    // If a directory, add all files in the directory
    const stat = await ideUtils.stat(uri);
    if (stat?.type === vscode.FileType.Directory) {
        const files = (await ideUtils.readDirectory(uri)); //files can't be null if we reached this point
        for (const [filename, type] of files) {
            if (type === vscode.FileType.File) {
                addEntireFileToContext(vscode.Uri.joinPath(uri, filename), webviewProtocol, ideUtils);
            }
        }
        return;
    }
    // Get the contents of the file
    const contents = (await vscode.workspace.fs.readFile(uri)).toString();
    const rangeInFileWithContents = {
        filepath: uri.toString(),
        contents: contents,
        range: {
            start: {
                line: 0,
                character: 0,
            },
            end: {
                line: contents.split(os.EOL).length - 1,
                character: 0,
            },
        },
    };
    webviewProtocol?.request("highlightedCode", {
        rangeInFileWithContents,
    });
}
function isEmptyFile(document) {
    return document.lineCount === 1 && document.lineAt(0).range.isEmpty;
}
function addCodeToContextFromRange(range, webviewProtocol, prompt) {
    const document = vscode.window.activeTextEditor?.document;
    if (!document) {
        return;
    }
    const rangeInFileWithContents = {
        filepath: document.uri.toString(),
        contents: document.getText(range),
        range: {
            start: {
                line: range.start.line,
                character: range.start.character,
            },
            end: {
                line: range.end.line,
                character: range.end.character,
            },
        },
    };
    webviewProtocol?.request("highlightedCode", {
        rangeInFileWithContents,
        prompt,
        // Assume `true` since range selection is currently only used for quick actions/fixes
        shouldRun: true,
    });
}
//# sourceMappingURL=addCode.js.map