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
exports.getTutorialUri = getTutorialUri;
exports.isTutorialFile = isTutorialFile;
exports.showTutorial = showTutorial;
const vscode = __importStar(require("vscode"));
const vscode_1 = require("./vscode");
const TUTORIAL_FILE_NAME = "continue_tutorial.py";
function getTutorialUri() {
    return vscode.Uri.joinPath((0, vscode_1.getExtensionUri)(), TUTORIAL_FILE_NAME);
}
function isTutorialFile(uri) {
    return uri.path.endsWith(TUTORIAL_FILE_NAME);
}
async function showTutorial(ide) {
    const tutorialUri = getTutorialUri();
    // Ensure keyboard shortcuts match OS
    if (process.platform !== "darwin") {
        let tutorialContent = await ide.readFile(tutorialUri.toString());
        tutorialContent = tutorialContent
            .replaceAll("[Cmd + L]", "[Ctrl + L]")
            .replaceAll("[Cmd + Shift + L]", "[Ctrl + Shift + L]")
            .replaceAll("[Cmd + I]", "[Ctrl + I]")
            .replaceAll("⌘", "^");
        await ide.writeFile(tutorialUri.toString(), tutorialContent);
    }
    const doc = await vscode.workspace.openTextDocument(tutorialUri);
    await vscode.window.showTextDocument(doc, {
        preview: false,
    });
}
//# sourceMappingURL=tutorial.js.map