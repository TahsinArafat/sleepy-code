import { RangeInFileWithContents } from "core";
import * as vscode from "vscode";
import { VsCodeIdeUtils } from "./ideUtils";
import type { VsCodeWebviewProtocol } from "../webviewProtocol";
export declare function getRangeInFileWithContents(allowEmpty?: boolean, range?: vscode.Range): RangeInFileWithContents | null;
export declare function addHighlightedCodeToContext(webviewProtocol: VsCodeWebviewProtocol | undefined): Promise<void>;
export declare function addEntireFileToContext(uri: vscode.Uri, webviewProtocol: VsCodeWebviewProtocol | undefined, ideUtils: VsCodeIdeUtils): Promise<void>;
export declare function isEmptyFile(document: vscode.TextDocument): boolean;
export declare function addCodeToContextFromRange(range: vscode.Range, webviewProtocol: VsCodeWebviewProtocol, prompt?: string): void;
