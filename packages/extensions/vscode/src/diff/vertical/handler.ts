import * as vscode from "vscode";

export interface DiffLine {
  type: "new" | "same" | "old";
  line: string;
}

export class VerticalDiffHandler {
  private decorations: vscode.TextEditorDecorationType[] = [];
  private _prevEditor: vscode.TextEditor | undefined;
  private _prevLines: number = 0;
  private _removedLines: number[] = [];

  clear(accept: boolean) {
    this.decorations.forEach((d) => d.dispose());
    this.decorations = [];
    this._removedLines = [];
    this._prevLines = 0;
  }

  async run(editor: vscode.TextEditor, diffLines: DiffLine[]) {
    this._prevEditor = editor;
    let lineIdx = Math.max(0, editor.selection.active.line - 2);
    const edits: { line: number; text?: string }[] = [];

    for (const diff of diffLines) {
      if (diff.type === "same") {
        lineIdx++;
      } else if (diff.type === "old") {
        this._removedLines.push(lineIdx);
        edits.push({ line: lineIdx });
        lineIdx++;
      } else if (diff.type === "new") {
        edits.push({ line: lineIdx, text: diff.line });
      }
    }

    await editor.edit((editBuilder) => {
      // Apply in reverse order to preserve line numbers
      const sortedEdits = edits.map((e, i) => ({ ...e, origIdx: i })).sort((a, b) => b.line - a.line);
      for (const edit of sortedEdits) {
        if (edit.text !== undefined) {
          editBuilder.insert(new vscode.Position(edit.line, 0), edit.text + "\n");
        } else {
          const range = new vscode.Range(edit.line, 0, edit.line, editor.document.lineAt(edit.line).text.length);
          editBuilder.delete(range);
        }
      }
    });

    // Apply green/red decorations
    const added = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: { id: "diffEditor.insertedLineBackground" },
    });
    const removed = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: { id: "diffEditor.removedLineBackground" },
    });

    const addedRanges = edits.filter(e => e.text !== undefined).map(e => new vscode.Range(e.line, 0, e.line, 0));
    const removedRanges = this._removedLines.map(l => new vscode.Range(l, 0, l, 0));

    editor.setDecorations(added, addedRanges);
    editor.setDecorations(removed, removedRanges);
    this.decorations.push(added, removed);
    this._prevLines = lineIdx;
  }

  async clearForFileUri(accept: boolean) {
    this.clear(accept);
  }

  acceptRejectBlock(accept: boolean, start: number, numGreen: number, numRed: number) {
    this.clear(true);
  }
}
