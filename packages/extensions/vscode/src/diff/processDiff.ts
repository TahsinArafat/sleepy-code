import * as vscode from "vscode";
import { VerticalDiffManager } from "./vertical/manager";

export async function processDiff(
  action: "accept" | "reject",
  verticalDiffManager: VerticalDiffManager,
  fileUri?: vscode.Uri,
) {
  const uri = fileUri || vscode.window.activeTextEditor?.document.uri;
  if (!uri) return;
  verticalDiffManager.clearForFileUri(uri, action === "accept");
  const doc = await vscode.workspace.openTextDocument(uri);
  await doc.save();
}

export async function acceptAllDiffs(verticalDiffManager: VerticalDiffManager) {
  await processDiff("accept", verticalDiffManager);
}

export async function rejectAllDiffs(verticalDiffManager: VerticalDiffManager) {
  await processDiff("reject", verticalDiffManager);
}
