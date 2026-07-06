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
exports.addCurrentSelectionToEdit = addCurrentSelectionToEdit;
const vscode = __importStar(require("vscode"));
const addCode_1 = require("../util/addCode");
async function addCurrentSelectionToEdit({ webviewProtocol, verticalDiffManager, args, editDecorationManager, }) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }
    const existingDiff = verticalDiffManager.getHandlerForFile(editor.document.fileName);
    // If there's a diff currently being applied, then we just toggle focus back to the input
    if (existingDiff) {
        webviewProtocol?.request("focusContinueInput", undefined);
        return;
    }
    const startFromCharZero = editor.selection.start.with(undefined, 0);
    const document = editor.document;
    let lastLine, lastChar;
    // If the user selected onto a trailing line but didn't actually include any characters in it
    // they don't want to include that line, so trim it off.
    if (editor.selection.end.character === 0) {
        // This is to prevent the rare case that the previous line gets selected when user
        // is selecting nothing and the cursor is at the beginning of the line
        if (editor.selection.end.line === editor.selection.start.line) {
            lastLine = editor.selection.start.line;
        }
        else {
            lastLine = editor.selection.end.line - 1;
        }
    }
    else {
        lastLine = editor.selection.end.line;
    }
    lastChar = document.lineAt(lastLine).range.end.character;
    const endAtCharLast = new vscode.Position(lastLine, lastChar);
    const range = args?.range ?? new vscode.Range(startFromCharZero, endAtCharLast);
    editDecorationManager.clear();
    editDecorationManager.addDecorations(editor, [range]);
    const rangeInFileWithContents = (0, addCode_1.getRangeInFileWithContents)(true, range);
    if (rangeInFileWithContents) {
        webviewProtocol?.request("setCodeToEdit", rangeInFileWithContents);
        // Un-select the current selection
        editor.selection = new vscode.Selection(editor.selection.anchor, editor.selection.anchor);
    }
}
//# sourceMappingURL=AddCurrentSelection.js.map