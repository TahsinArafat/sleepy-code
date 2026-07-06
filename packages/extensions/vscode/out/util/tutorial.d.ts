import { IDE } from "core";
import * as vscode from "vscode";
export declare function getTutorialUri(): vscode.Uri;
export declare function isTutorialFile(uri: vscode.Uri): boolean;
export declare function showTutorial(ide: IDE): Promise<void>;
