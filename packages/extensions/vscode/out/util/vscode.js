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
exports.translate = translate;
exports.getNonce = getNonce;
exports.getExtensionUri = getExtensionUri;
exports.getViewColumnOfFile = getViewColumnOfFile;
exports.getRightViewColumn = getRightViewColumn;
exports.openEditorAndRevealRange = openEditorAndRevealRange;
exports.getUniqueId = getUniqueId;
const node_machine_id_1 = require("node-machine-id");
const URI = __importStar(require("uri-js"));
const vscode = __importStar(require("vscode"));
function translate(range, lines) {
    return new vscode.Range(range.start.line + lines, range.start.character, range.end.line + lines, range.end.character);
}
function getNonce() {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function getExtensionUri() {
    return vscode.extensions.getExtension("Continue.continue").extensionUri;
}
function getViewColumnOfFile(uri) {
    for (const tabGroup of vscode.window.tabGroups.all) {
        for (const tab of tabGroup.tabs) {
            if (tab?.input?.uri &&
                URI.equal(tab.input.uri, uri.toString())) {
                return tabGroup.viewColumn;
            }
        }
    }
    return undefined;
}
function getRightViewColumn() {
    // When you want to place in the rightmost panel if there is already more than one, otherwise use Beside
    let column = vscode.ViewColumn.Beside;
    const columnOrdering = [
        vscode.ViewColumn.One,
        vscode.ViewColumn.Beside,
        vscode.ViewColumn.Two,
        vscode.ViewColumn.Three,
        vscode.ViewColumn.Four,
        vscode.ViewColumn.Five,
        vscode.ViewColumn.Six,
        vscode.ViewColumn.Seven,
        vscode.ViewColumn.Eight,
        vscode.ViewColumn.Nine,
    ];
    for (const tabGroup of vscode.window.tabGroups.all) {
        if (columnOrdering.indexOf(tabGroup.viewColumn) >
            columnOrdering.indexOf(column)) {
            column = tabGroup.viewColumn;
        }
    }
    return column;
}
let showTextDocumentInProcess = false;
function openEditorAndRevealRange(uri, range, viewColumn, preview) {
    return new Promise((resolve, _) => {
        vscode.workspace.openTextDocument(uri).then(async (doc) => {
            try {
                // An error is thrown mysteriously if you open two documents in parallel, hence this
                while (showTextDocumentInProcess) {
                    await new Promise((resolve) => {
                        setInterval(() => {
                            resolve(null);
                        }, 200);
                    });
                }
                showTextDocumentInProcess = true;
                vscode.window
                    .showTextDocument(doc, {
                    viewColumn: getViewColumnOfFile(uri) || viewColumn,
                    preview,
                })
                    .then((editor) => {
                    if (range) {
                        editor.revealRange(range);
                    }
                    resolve(editor);
                    showTextDocumentInProcess = false;
                });
            }
            catch (err) {
                console.log(err);
            }
        });
    });
}
function getUniqueId() {
    const id = vscode.env.machineId;
    if (id === "someValue.machineId") {
        return (0, node_machine_id_1.machineIdSync)();
    }
    return vscode.env.machineId;
}
//# sourceMappingURL=vscode.js.map