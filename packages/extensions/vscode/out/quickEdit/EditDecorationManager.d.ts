import vscode from "vscode";
declare class EditDecorationManager {
    private _lastEditor;
    private decorationType;
    private activeRangesMap;
    constructor(context: vscode.ExtensionContext);
    private updateInEditMode;
    private rangeToString;
    private rangesCoincide;
    private mergeNewRange;
    addDecorations(editor: vscode.TextEditor, ranges: vscode.Range[]): void;
    clear(): void;
}
export default EditDecorationManager;
