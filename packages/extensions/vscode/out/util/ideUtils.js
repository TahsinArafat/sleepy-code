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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VsCodeIdeUtils = void 0;
const constants_1 = require("core/util/constants");
const uri_1 = require("core/util/uri");
const lodash_1 = __importDefault(require("lodash"));
const URI = __importStar(require("uri-js"));
const vscode = __importStar(require("vscode"));
const debug_1 = require("../debug/debug");
const VsCodeExtension_1 = require("../extension/VsCodeExtension");
const suggestions_1 = require("../suggestions");
const vscode_1 = require("./vscode");
const util = require("node:util");
const asyncExec = util.promisify(require("node:child_process").exec);
const NO_FS_PROVIDER_ERROR = "ENOPRO";
const UNSUPPORTED_SCHEMES = new Set();
class VsCodeIdeUtils {
    visibleMessages = new Set();
    async gotoDefinition(uri, position) {
        const locations = await vscode.commands.executeCommand("vscode.executeDefinitionProvider", uri, position);
        return locations;
    }
    async documentSymbol(uri) {
        return await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
    }
    async references(uri, position) {
        return await vscode.commands.executeCommand("vscode.executeReferenceProvider", uri, position);
    }
    async foldingRanges(uri) {
        return await vscode.commands.executeCommand("vscode.executeFoldingRangeProvider", uri);
    }
    _workspaceDirectories = undefined;
    getWorkspaceDirectories() {
        if (this._workspaceDirectories === undefined) {
            this._workspaceDirectories =
                vscode.workspace.workspaceFolders?.map((folder) => folder.uri) || [];
        }
        return this._workspaceDirectories;
    }
    setWokspaceDirectories(dirs) {
        this._workspaceDirectories = dirs;
    }
    getUniqueId() {
        return (0, vscode_1.getUniqueId)();
    }
    showSuggestion(uri, range, suggestion) {
        (0, suggestions_1.showSuggestion)(uri, new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character), suggestion);
    }
    async openFile(uri, range) {
        // vscode has a builtin open/get open files
        return await (0, vscode_1.openEditorAndRevealRange)(uri, range, vscode.ViewColumn.One, false);
    }
    async fileExists(uri) {
        try {
            return (await this.stat(uri)) !== null;
        }
        catch {
            return false;
        }
    }
    /**
     * Read the entire contents of a file from the given URI.
     * If there are unsaved changes in an open editor, returns those instead of the file on disk.
     *
     * @param uri - The URI of the file to read.
     * @param ignoreMissingProviders - Optional flag to ignore missing file system providers for unsupported schemes.
     *                                 Defaults to `true`.
     * @returns A promise that resolves to the file content as a `Uint8Array`, or `null` if the scheme is unsupported
     *          or the provider is missing and `ignoreMissingProviders` is `true`.
     *          If `ignoreMissingProviders` is `false`, it will throw an error for unsupported schemes or missing providers.
     * @throws Will rethrow any error that is not related to missing providers or unsupported schemes.
     */
    async readFile(uri, ignoreMissingProviders = true) {
        // First check if there's an open document with this URI that might have unsaved changes.
        const openDocuments = vscode.workspace.textDocuments;
        for (const document of openDocuments) {
            if (document.uri.toString() === uri.toString()) {
                // Found an open document with this URI.
                // Return its current content (including any unsaved changes) as Uint8Array.
                const docText = document.getText();
                return Buffer.from(docText, "utf8");
            }
        }
        // If no open document found or if it's not dirty, fall back to reading from disk.
        return await this.fsOperation(uri, async (u) => {
            return await vscode.workspace.fs.readFile(u);
        }, ignoreMissingProviders);
    }
    /**
     * Retrieve metadata about a file from the given URI.
     *
     * @param uri - The URI of the file or directory to retrieve metadata about.
     * @param ignoreMissingProviders - Optional. If `true`, missing file system providers will be ignored. Defaults to `true`.
     * @returns A promise that resolves to a `vscode.FileStat` object containing the file metadata,
     *          or `null` if the scheme is unsupported or the provider is missing and `ignoreMissingProviders` is `true`.
     */
    async stat(uri, ignoreMissingProviders = true) {
        return await this.fsOperation(uri, async (u) => {
            return await vscode.workspace.fs.stat(uri);
        }, ignoreMissingProviders);
    }
    /**
     * Retrieve all entries of a directory from the given URI.
     *
     * @param uri - The URI of the directory to read.
     * @param ignoreMissingProviders - Optional. If `true`, missing file system providers will be ignored. Defaults to `true`.
     * @returns A promise that resolves to an array of tuples, where each tuple contains the name of a directory entry
     *          and its type (`vscode.FileType`), or `null` if the scheme is unsupported or the provider is missing and `ignoreMissingProviders` is `true`.
     */
    async readDirectory(uri, ignoreMissingProviders = true) {
        return await this.fsOperation(uri, async (u) => {
            return await vscode.workspace.fs.readDirectory(uri);
        }, ignoreMissingProviders);
    }
    /**
     * Performs a file system operation on the given URI using the provided delegate function.
     *
     * @template T The type of the result returned by the delegate function.
     * @param uri The URI on which the file system operation is to be performed.
     * @param delegate A function that performs the desired operation on the given URI.
     * @param ignoreMissingProviders Whether to ignore errors caused by missing file system providers. Defaults to `true`.
     * @returns A promise that resolves to the result of the delegate function, or `null` if the operation is skipped due to unsupported schemes or missing providers.
     * @throws Re-throws any error encountered during the operation, except for missing provider errors when `ignoreMissingProviders` is `true`.
     */
    async fsOperation(uri, delegate, ignoreMissingProviders = true) {
        const scheme = uri.scheme;
        if (ignoreMissingProviders && UNSUPPORTED_SCHEMES.has(scheme)) {
            return null;
        }
        try {
            return await delegate(uri);
        }
        catch (err) {
            if (ignoreMissingProviders &&
                //see https://github.com/microsoft/vscode/blob/c9c54f9e775e5f57d97bef796797b5bc670c8150/src/vs/workbench/api/common/extHostFileSystemConsumer.ts#L230
                (err.name === NO_FS_PROVIDER_ERROR ||
                    err.message?.includes(NO_FS_PROVIDER_ERROR))) {
                UNSUPPORTED_SCHEMES.add(scheme);
                console.log(`Ignoring missing provider error:`, err.message);
                return null;
            }
            throw err;
        }
    }
    showVirtualFile(name, contents) {
        vscode.workspace
            .openTextDocument(vscode.Uri.parse(`${VsCodeExtension_1.VsCodeExtension.continueVirtualDocumentScheme}:${encodeURIComponent(name)}?${encodeURIComponent(contents)}`))
            .then((doc) => {
            vscode.window.showTextDocument(doc, { preview: false });
        });
    }
    async getUserSecret(key) {
        // Check if secret already exists in VS Code settings (global)
        let secret = vscode.workspace.getConfiguration(constants_1.EXTENSION_NAME).get(key);
        if (typeof secret !== "undefined" && secret !== null) {
            return secret;
        }
        // If not, ask user for secret
        secret = await vscode.window.showInputBox({
            prompt: `Either enter secret for ${key} or press enter to try Continue for free.`,
            password: true,
        });
        // Add secret to VS Code settings
        vscode.workspace
            .getConfiguration(constants_1.EXTENSION_NAME)
            .update(key, secret, vscode.ConfigurationTarget.Global);
        return secret;
    }
    // ------------------------------------ //
    // Initiate Request
    acceptRejectSuggestion(accept, key) {
        if (accept) {
            (0, suggestions_1.acceptSuggestionCommand)(key);
        }
        else {
            (0, suggestions_1.rejectSuggestionCommand)(key);
        }
    }
    // ------------------------------------ //
    // Respond to request
    // Checks to see if the editor is a code editor.
    // In some cases vscode.window.visibleTextEditors can return non-code editors
    // e.g. terminal editors in side-by-side mode
    documentIsCode(uri) {
        return uri.scheme === "file" || uri.scheme === "vscode-remote";
    }
    getOpenFiles() {
        return vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .filter((tab) => tab.input instanceof vscode.TabInputText &&
            this.documentIsCode(tab.input.uri))
            .map((tab) => tab.input.uri);
    }
    saveFile(uri) {
        vscode.window.visibleTextEditors
            .filter((editor) => this.documentIsCode(editor.document.uri))
            .forEach((editor) => {
            if (URI.equal(editor.document.uri.toString(), uri.toString())) {
                editor.document.save();
            }
        });
    }
    async readRangeInFile(uri, range) {
        const buffer = await this.readFile(uri);
        if (buffer === null) {
            return "";
        }
        const contents = new TextDecoder().decode(buffer);
        const lines = contents.split("\n");
        return `${lines
            .slice(range.start.line, range.end.line)
            .join("\n")}\n${lines[range.end.line < lines.length - 1 ? range.end.line : lines.length - 1].slice(0, range.end.character)}`;
    }
    async getTerminalContents(commands = -1) {
        const tempCopyBuffer = await vscode.env.clipboard.readText();
        if (commands < 0) {
            await vscode.commands.executeCommand("workbench.action.terminal.selectAll");
        }
        else {
            for (let i = 0; i < commands; i++) {
                await vscode.commands.executeCommand("workbench.action.terminal.selectToPreviousCommand");
            }
        }
        await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
        await vscode.commands.executeCommand("workbench.action.terminal.clearSelection");
        let terminalContents = (await vscode.env.clipboard.readText()).trim();
        await vscode.env.clipboard.writeText(tempCopyBuffer);
        if (tempCopyBuffer === terminalContents) {
            // This means there is no terminal open to select text from
            return "";
        }
        // Sometimes the above won't successfully separate by command, so we attempt manually
        const lines = terminalContents.split("\n");
        const lastLine = lines.pop()?.trim();
        if (lastLine) {
            let i = lines.length - 1;
            while (i >= 0 && !lines[i].trim().startsWith(lastLine)) {
                i--;
            }
            terminalContents = lines.slice(Math.max(i, 0)).join("\n");
        }
        return terminalContents;
    }
    async _getThreads(session) {
        const threadsResponse = await session.customRequest("threads");
        const threads = threadsResponse.threads.filter((thread) => debug_1.threadStopped.get(thread.id));
        threads.sort((a, b) => a.id - b.id);
        threadsResponse.threads = threads;
        return threadsResponse;
    }
    async getAvailableThreads() {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            return [];
        }
        const threadsResponse = await this._getThreads(session);
        return threadsResponse.threads;
    }
    async getDebugLocals(threadIndex = 0) {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showWarningMessage("No active debug session found, therefore no debug context will be provided for the llm.");
            return "";
        }
        const variablesResponse = await session
            .customRequest("stackTrace", {
            threadId: threadIndex,
            startFrame: 0,
        })
            .then((traceResponse) => session.customRequest("scopes", {
            frameId: traceResponse.stackFrames[0].id,
        }))
            .then((scopesResponse) => session.customRequest("variables", {
            variablesReference: scopesResponse.scopes[0].variablesReference,
        }));
        const variableContext = variablesResponse.variables
            .filter((variable) => variable.type !== "global")
            .reduce((acc, variable) => `${acc}\nname: ${variable.name}, type: ${variable.type}, ` +
            `value: ${variable.value}`, "");
        return variableContext;
    }
    async getTopLevelCallStackSources(threadIndex, stackDepth = 3) {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            return [];
        }
        const sourcesPromises = await session
            .customRequest("stackTrace", {
            threadId: threadIndex,
            startFrame: 0,
        })
            .then((traceResponse) => traceResponse.stackFrames
            .slice(0, stackDepth)
            .map(async (stackFrame) => {
            const scopeResponse = await session.customRequest("scopes", {
                frameId: stackFrame.id,
            });
            const scope = scopeResponse.scopes[0];
            return await this.retrieveSource(scope.source && !lodash_1.default.isEmpty(scope.source) ? scope : stackFrame);
        }));
        return Promise.all(sourcesPromises);
    }
    async retrieveSource(sourceContainer) {
        if (!sourceContainer.source) {
            return "";
        }
        const sourceRef = sourceContainer.source.sourceReference;
        if (sourceRef && sourceRef > 0) {
            // according to the spec, source might be ony available in a debug session
            // not yet able to test this branch
            const sourceResponse = await vscode.debug.activeDebugSession?.customRequest("source", {
                source: sourceContainer.source,
                sourceReference: sourceRef,
            });
            return sourceResponse.content;
        }
        else if (sourceContainer.line && sourceContainer.endLine) {
            return await this.readRangeInFile(sourceContainer.source.path, new vscode.Range(sourceContainer.line - 1, // The line number from scope response starts from 1
            sourceContainer.column, sourceContainer.endLine - 1, sourceContainer.endColumn));
        }
        else if (sourceContainer.line) {
            // fall back to 5 line of context
            return await this.readRangeInFile(sourceContainer.source.path, new vscode.Range(Math.max(0, sourceContainer.line - 3), 0, sourceContainer.line + 2, 0));
        }
        else {
            return "unavailable";
        }
    }
    async _getRepo(forDirectory) {
        // Use the native git extension to get the branch name
        const extension = vscode.extensions.getExtension("vscode.git");
        if (typeof extension === "undefined" ||
            !extension.isActive ||
            typeof vscode.workspace.workspaceFolders === "undefined") {
            return undefined;
        }
        try {
            const git = extension.exports.getAPI(1);
            return git.getRepository(forDirectory) ?? undefined;
        }
        catch (e) {
            this._repoWasNone = true;
            console.warn("Git not found: ", e);
            return undefined;
        }
    }
    _getRepositories() {
        const extension = vscode.extensions.getExtension("vscode.git");
        if (typeof extension === "undefined" ||
            !extension.isActive ||
            typeof vscode.workspace.workspaceFolders === "undefined") {
            return undefined;
        }
        try {
            const git = extension.exports.getAPI(1);
            return git.repositories;
        }
        catch (e) {
            this._repoWasNone = true;
            console.warn("Git not found: ", e);
            return undefined;
        }
    }
    _repoWasNone = false;
    repoCache = new Map();
    static secondsToWaitForGitToLoad = process.env.NODE_ENV === "test" ? 1 : 20;
    async getRepo(forDirectory) {
        const workspaceDirs = this.getWorkspaceDirectories().map((dir) => dir.toString());
        const { foundInDir } = (0, uri_1.findUriInDirs)(forDirectory.toString(), workspaceDirs);
        if (foundInDir) {
            // Check if the repository is already cached
            const cachedRepo = this.repoCache.get(foundInDir);
            if (cachedRepo) {
                return cachedRepo;
            }
        }
        let repo = await this._getRepo(forDirectory);
        let i = 0;
        while (!repo?.state?.HEAD?.name) {
            if (this._repoWasNone) {
                return undefined;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
            i++;
            if (i >= VsCodeIdeUtils.secondsToWaitForGitToLoad) {
                this._repoWasNone = true;
                return undefined;
            }
            repo = await this._getRepo(forDirectory);
        }
        if (foundInDir) {
            // Cache the repository for the parent directory
            this.repoCache.set(foundInDir, repo);
        }
        return repo;
    }
    async getGitRoot(forDirectory) {
        const repo = await this.getRepo(forDirectory);
        return repo?.rootUri;
    }
    async getBranch(forDirectory) {
        const repo = await this.getRepo(forDirectory);
        if (repo?.state?.HEAD?.name === undefined) {
            try {
                const { stdout } = await asyncExec("git rev-parse --abbrev-ref HEAD", {
                    cwd: forDirectory.fsPath,
                });
                return stdout?.trim() || "NONE";
            }
            catch (e) {
                return "NONE";
            }
        }
        return repo?.state?.HEAD?.name || "NONE";
    }
    splitDiff(diffString) {
        const fileDiffHeaderRegex = /(?=diff --git a\/.* b\/.*)/;
        const diffs = diffString.split(fileDiffHeaderRegex);
        if (diffs[0].trim() === "") {
            diffs.shift();
        }
        return diffs;
    }
    async getDiff(includeUnstaged) {
        const diffs = [];
        const repos = this._getRepositories();
        try {
            if (repos) {
                for (const repo of repos) {
                    const staged = await repo.diff(true);
                    diffs.push(staged);
                    if (includeUnstaged) {
                        const unstaged = await repo.diff(false);
                        diffs.push(unstaged);
                    }
                }
            }
            return diffs.flatMap((diff) => this.splitDiff(diff));
        }
        catch (e) {
            console.error(e);
            return [];
        }
    }
}
exports.VsCodeIdeUtils = VsCodeIdeUtils;
//# sourceMappingURL=ideUtils.js.map