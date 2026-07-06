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
exports.RemovedLineDecorationManager = exports.AddedLineDecorationManager = exports.belowIndexDecorationType = exports.indexDecorationType = void 0;
const vscode = __importStar(require("vscode"));
const removedLineDecorationType = (line) => vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: { id: "diffEditor.removedLineBackground" },
    outlineWidth: "1px",
    outlineStyle: "solid",
    outlineColor: { id: "diffEditor.removedTextBorder" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    after: {
        contentText: line,
        color: "#808080",
        textDecoration: "none; white-space: pre",
    },
    // NOTE this has the effect of hiding text the user enters into a red line, which may cause linting errors
    // But probably worth saving the ugly effect of having the ghost text after entered text
    // And resolved upon accept/reject when line deleted anyways
    textDecoration: "none; display: none",
});
const addedLineDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: { id: "diffEditor.insertedLineBackground" },
    outlineWidth: "1px",
    outlineStyle: "solid",
    outlineColor: { id: "diffEditor.insertedTextBorder" },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});
exports.indexDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});
exports.belowIndexDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});
function translateRange(range, lineOffset) {
    return new vscode.Range(range.start.translate(lineOffset), range.end.translate(lineOffset));
}
// Class for managing highlight decorations for added lines (e.g. GREEN)
class AddedLineDecorationManager {
    editor;
    constructor(editor) {
        this.editor = editor;
    }
    ranges = [];
    decorationType = addedLineDecorationType;
    applyToNewEditor(newEditor) {
        this.editor = newEditor;
        this.editor.setDecorations(this.decorationType, this.ranges);
    }
    addLines(startIndex, numLines) {
        const lastRange = this.ranges[this.ranges.length - 1];
        if (lastRange && lastRange.end.line === startIndex - 1) {
            this.ranges[this.ranges.length - 1] = lastRange.with(undefined, lastRange.end.translate(numLines));
        }
        else {
            this.ranges.push(new vscode.Range(startIndex, 0, startIndex + numLines - 1, Number.MAX_SAFE_INTEGER));
        }
        this.editor.setDecorations(this.decorationType, this.ranges);
    }
    addLine(index) {
        this.addLines(index, 1);
    }
    clear() {
        this.ranges = [];
        this.editor.setDecorations(this.decorationType, this.ranges);
    }
    shiftDownAfterLine(afterLine, offset) {
        for (let i = 0; i < this.ranges.length; i++) {
            if (this.ranges[i].start.line >= afterLine) {
                this.ranges[i] = translateRange(this.ranges[i], offset);
            }
        }
        this.editor.setDecorations(this.decorationType, this.ranges);
    }
    deleteRangeStartingAt(line) {
        for (let i = 0; i < this.ranges.length; i++) {
            if (this.ranges[i].start.line === line) {
                return this.ranges.splice(i, 1)[0];
            }
        }
        this.editor.setDecorations(this.decorationType, this.ranges);
    }
}
exports.AddedLineDecorationManager = AddedLineDecorationManager;
// Class for managing ghost-text decorations for removed lines (e.g. RED)
// Behavior is slightly different all around
// because each line will have a unique decoration type
class RemovedLineDecorationManager {
    editor;
    constructor(editor) {
        this.editor = editor;
    }
    ranges = [];
    applyToNewEditor(newEditor) {
        this.editor = newEditor;
        this.applyDecorations();
    }
    addLines(startIndex, lines) {
        let i = 0;
        for (const line of lines) {
            this.ranges.push({
                line,
                range: new vscode.Range(startIndex + i, 0, startIndex + i, Number.MAX_SAFE_INTEGER),
                decoration: removedLineDecorationType(line),
            });
            i++;
        }
        this.applyDecorations();
    }
    addLine(index, line) {
        this.addLines(index, [line]);
    }
    applyDecorations() {
        this.ranges.forEach((r) => {
            this.editor.setDecorations(r.decoration, [r.range]);
        });
    }
    // Removed decorations are always unique, so we'll always dispose
    clear() {
        this.ranges.forEach((r) => {
            r.decoration.dispose();
        });
        this.ranges = [];
    }
    shiftDownAfterLine(afterLine, offset) {
        for (let i = 0; i < this.ranges.length; i++) {
            if (this.ranges[i].range.start.line >= afterLine) {
                this.ranges[i].range = translateRange(this.ranges[i].range, offset);
            }
        }
        this.applyDecorations();
    }
    // Red ranges are always single-line, so to delete group, delete sequential ranges
    deleteRangesStartingAt(line) {
        for (let i = 0; i < this.ranges.length; i++) {
            if (this.ranges[i].range.start.line === line) {
                let sequential = 0;
                while (i + sequential < this.ranges.length &&
                    this.ranges[i + sequential].range.start.line === line + sequential) {
                    this.ranges[i + sequential].decoration.dispose();
                    sequential++;
                }
                return this.ranges.splice(i, sequential);
            }
        }
    }
}
exports.RemovedLineDecorationManager = RemovedLineDecorationManager;
//# sourceMappingURL=decorations.js.map