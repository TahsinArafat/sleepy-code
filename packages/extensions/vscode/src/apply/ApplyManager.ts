import * as vscode from "vscode";

export class ApplyManager {
  async applyToFile(uri: vscode.Uri, newContent: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    await editor.edit((editBuilder) => {
      editBuilder.delete(fullRange);
      editBuilder.insert(new vscode.Position(0, 0), newContent);
    });
    await doc.save();
  }

  async applyToActiveEditor(newContent: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    await editor.edit((editBuilder) => {
      editBuilder.delete(fullRange);
      editBuilder.insert(new vscode.Position(0, 0), newContent);
    });
  }
}
