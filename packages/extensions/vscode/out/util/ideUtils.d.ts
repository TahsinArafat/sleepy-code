import * as vscode from "vscode";
import { Repository } from "../otherExtensions/git";
import { SuggestionRanges } from "../suggestions";
import type { Range, Thread } from "core";
export declare class VsCodeIdeUtils {
    visibleMessages: Set<string>;
    gotoDefinition(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]>;
    documentSymbol(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]>;
    references(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Location[]>;
    foldingRanges(uri: vscode.Uri): Promise<vscode.FoldingRange[]>;
    private _workspaceDirectories;
    getWorkspaceDirectories(): vscode.Uri[];
    setWokspaceDirectories(dirs: vscode.Uri[] | undefined): void;
    getUniqueId(): any;
    showSuggestion(uri: vscode.Uri, range: Range, suggestion: string): void;
    openFile(uri: vscode.Uri, range?: vscode.Range): Promise<vscode.TextEditor>;
    fileExists(uri: vscode.Uri): Promise<boolean>;
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
    readFile(uri: vscode.Uri, ignoreMissingProviders?: boolean): Promise<Uint8Array | null>;
    /**
     * Retrieve metadata about a file from the given URI.
     *
     * @param uri - The URI of the file or directory to retrieve metadata about.
     * @param ignoreMissingProviders - Optional. If `true`, missing file system providers will be ignored. Defaults to `true`.
     * @returns A promise that resolves to a `vscode.FileStat` object containing the file metadata,
     *          or `null` if the scheme is unsupported or the provider is missing and `ignoreMissingProviders` is `true`.
     */
    stat(uri: vscode.Uri, ignoreMissingProviders?: boolean): Promise<vscode.FileStat | null>;
    /**
     * Retrieve all entries of a directory from the given URI.
     *
     * @param uri - The URI of the directory to read.
     * @param ignoreMissingProviders - Optional. If `true`, missing file system providers will be ignored. Defaults to `true`.
     * @returns A promise that resolves to an array of tuples, where each tuple contains the name of a directory entry
     *          and its type (`vscode.FileType`), or `null` if the scheme is unsupported or the provider is missing and `ignoreMissingProviders` is `true`.
     */
    readDirectory(uri: vscode.Uri, ignoreMissingProviders?: boolean): Promise<[string, vscode.FileType][] | null>;
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
    private fsOperation;
    showVirtualFile(name: string, contents: string): void;
    getUserSecret(key: string): Promise<unknown>;
    acceptRejectSuggestion(accept: boolean, key: SuggestionRanges): void;
    private documentIsCode;
    getOpenFiles(): vscode.Uri[];
    saveFile(uri: vscode.Uri): void;
    readRangeInFile(uri: vscode.Uri, range: vscode.Range): Promise<string>;
    getTerminalContents(commands?: number): Promise<string>;
    private _getThreads;
    getAvailableThreads(): Promise<Thread[]>;
    getDebugLocals(threadIndex?: number): Promise<string>;
    getTopLevelCallStackSources(threadIndex: number, stackDepth?: number): Promise<string[]>;
    private retrieveSource;
    private _getRepo;
    private _getRepositories;
    private _repoWasNone;
    private repoCache;
    private static secondsToWaitForGitToLoad;
    getRepo(forDirectory: vscode.Uri): Promise<Repository | undefined>;
    getGitRoot(forDirectory: vscode.Uri): Promise<vscode.Uri | undefined>;
    getBranch(forDirectory: vscode.Uri): Promise<any>;
    private splitDiff;
    getDiff(includeUnstaged: boolean): Promise<string[]>;
}
