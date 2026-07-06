import { IDE, Position, Range } from "core";
import { GetLspDefinitionsFunction } from "core/autocomplete/types";
import { ConfigHandler } from "core/config/ConfigHandler";
import * as vscode from "vscode";
import { ContinueCompletionProvider } from "../autocomplete/completionProvider";
/**
 * Gets the cached content for a document, or reads the current content if not cached.
 * This should be called BEFORE processing the edit to get the pre-edit state.
 */
export declare const getPreEditContent: (document: vscode.TextDocument) => string;
/**
 * Updates the cache with the current document content.
 * This should be called AFTER processing the edit.
 */
export declare const updateDocumentContentCache: (document: vscode.TextDocument) => void;
/**
 * Initializes the cache for a document when it's opened.
 */
export declare const initDocumentContentCache: (document: vscode.TextDocument) => void;
/**
 * Removes a document from the cache when it's closed.
 */
export declare const clearDocumentContentCache: (uri: string) => void;
export declare const getBeforeCursorPos: (range: Range, activePos: Position) => Position;
export declare const handleTextDocumentChange: (event: vscode.TextDocumentChangeEvent, configHandler: ConfigHandler, ide: IDE, completionProvider: ContinueCompletionProvider, getDefinitionsFromLsp: GetLspDefinitionsFunction) => Promise<{
    actions: RangeInFileWithNextEditInfo[];
    configHandler: ConfigHandler;
    getDefsFromLspFunction: GetLspDefinitionsFunction;
    recentlyEditedRanges: RecentlyEditedRange[];
    recentlyVisitedRanges: AutocompleteCodeSnippet[];
} | undefined>;
