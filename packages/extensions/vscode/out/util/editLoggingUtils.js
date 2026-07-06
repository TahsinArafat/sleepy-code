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
exports.handleTextDocumentChange = exports.getBeforeCursorPos = exports.clearDocumentContentCache = exports.initDocumentContentCache = exports.updateDocumentContentCache = exports.getPreEditContent = void 0;
const vscode = __importStar(require("vscode"));
// Cache to store the last known content for each file (before edits)
const documentContentCache = new Map();
/**
 * Gets the cached content for a document, or reads the current content if not cached.
 * This should be called BEFORE processing the edit to get the pre-edit state.
 */
const getPreEditContent = (document) => {
    const uri = document.uri.toString();
    const cached = documentContentCache.get(uri);
    if (cached !== undefined) {
        return cached;
    }
    // If not cached, this is the first edit we're seeing - the document's current state
    // in the event is already post-edit, so we can't get the true pre-edit content.
    // Return empty string to indicate no prior content was tracked.
    return "";
};
exports.getPreEditContent = getPreEditContent;
/**
 * Updates the cache with the current document content.
 * This should be called AFTER processing the edit.
 */
const updateDocumentContentCache = (document) => {
    documentContentCache.set(document.uri.toString(), document.getText());
};
exports.updateDocumentContentCache = updateDocumentContentCache;
/**
 * Initializes the cache for a document when it's opened.
 */
const initDocumentContentCache = (document) => {
    documentContentCache.set(document.uri.toString(), document.getText());
};
exports.initDocumentContentCache = initDocumentContentCache;
/**
 * Removes a document from the cache when it's closed.
 */
const clearDocumentContentCache = (uri) => {
    documentContentCache.delete(uri);
};
exports.clearDocumentContentCache = clearDocumentContentCache;
const getBeforeCursorPos = (range, activePos) => {
    // whichever side of the range isn't active is the before position
    if (range.start.line === activePos.line &&
        range.start.character === activePos.character) {
        return range.end;
    }
    else {
        return range.start;
    }
};
exports.getBeforeCursorPos = getBeforeCursorPos;
const getWorkspaceDirUri = async (event) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(event.document.uri);
    if (!workspaceFolder) {
        return false;
    }
    const workspaceDirUri = workspaceFolder.uri.toString();
    return workspaceDirUri;
};
const handleTextDocumentChange = async (event, configHandler, ide, completionProvider, getDefinitionsFromLsp) => {
    const changes = event.contentChanges;
    const editor = vscode.window.activeTextEditor;
    const { config } = await configHandler.loadConfig();
    // if (!config?.experimental?.logEditingData) return;
    if (!editor)
        return;
    if (event.contentChanges.length === 0)
        return;
    // Ensure that logging will only happen in the open-source continue repo
    const workspaceDirUri = await getWorkspaceDirUri(event);
    if (!workspaceDirUri)
        return;
    // Get the pre-edit content from our cache BEFORE updating it
    const fileContentsBefore = (0, exports.getPreEditContent)(event.document);
    const activeCursorPos = editor.selection.active;
    const editActions = changes.map((change) => ({
        filepath: event.document.uri.toString(),
        range: {
            start: change.range.start,
            end: change.range.end,
        },
        fileContents: event.document.getText(),
        fileContentsBefore,
        editText: change.text,
        beforeCursorPos: (0, exports.getBeforeCursorPos)(change.range, activeCursorPos),
        afterCursorPos: activeCursorPos,
        workspaceDir: workspaceDirUri,
    }));
    // Update the cache with the new content AFTER capturing the edit
    (0, exports.updateDocumentContentCache)(event.document);
    let recentlyEditedRanges = [];
    let recentlyVisitedRanges = [];
    if (completionProvider) {
        recentlyEditedRanges =
            await completionProvider.recentlyEditedTracker.getRecentlyEditedRanges();
        recentlyVisitedRanges =
            completionProvider.recentlyVisitedRanges.getSnippets();
    }
    return {
        actions: editActions,
        configHandler: configHandler,
        getDefsFromLspFunction: getDefinitionsFromLsp,
        recentlyEditedRanges,
        recentlyVisitedRanges,
    };
};
exports.handleTextDocumentChange = handleTextDocumentChange;
//# sourceMappingURL=editLoggingUtils.js.map