import * as vscode from "vscode";
import { VerticalDiffHandler, DiffLine } from "./handler";

export interface VerticalDiffCodeLens {
  startLine: number;
  numGreen: number;
  numRed: number;
}

export class VerticalDiffManager {
  public handlers: Map<string, VerticalDiffHandler> = new Map();
  public fileUriToCodeLens: Map<string, VerticalDiffCodeLens[]> = new Map();

  getHandler(uri: vscode.Uri): VerticalDiffHandler {
    const key = uri.toString();
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new VerticalDiffHandler());
    }
    return this.handlers.get(key)!;
  }

  addCodeLens(uri: vscode.Uri, startLine: number, numGreen: number, numRed: number) {
    const key = uri.toString();
    if (!this.fileUriToCodeLens.has(key)) {
      this.fileUriToCodeLens.set(key, []);
    }
    this.fileUriToCodeLens.get(key)!.push({ startLine, numGreen, numRed });
  }

  clearForFileUri(uri: vscode.Uri, accept: boolean) {
    const key = uri.toString();
    const handler = this.handlers.get(key);
    if (handler) {
      handler.clearForFileUri(accept);
      this.handlers.delete(key);
    }
    this.fileUriToCodeLens.delete(key);
  }

  async streamEdit(
    editor: vscode.TextEditor,
    prompt: string,
    _fetchStream: () => AsyncGenerator<DiffLine, void, unknown>,
  ): Promise<void> {
    const handler = this.getHandler(editor.document.uri);
    // We accumulate diffs as they come from the stream
    const allDiffs: DiffLine[] = [];
    for await (const diff of _fetchStream()) {
      allDiffs.push(diff);
    }
    if (allDiffs.length > 0) {
      await handler.run(editor, allDiffs);
    }
  }
}
