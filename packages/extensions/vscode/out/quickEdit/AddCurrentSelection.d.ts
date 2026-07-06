import { VerticalDiffManager } from "../diff/vertical/manager";
import { VsCodeWebviewProtocol } from "../webviewProtocol";
import EditDecorationManager from "./EditDecorationManager";
import { QuickEditShowParams } from "./QuickEditQuickPick";
export declare function addCurrentSelectionToEdit({ webviewProtocol, verticalDiffManager, args, editDecorationManager, }: {
    webviewProtocol: VsCodeWebviewProtocol;
    verticalDiffManager: VerticalDiffManager;
    args: QuickEditShowParams | undefined;
    editDecorationManager: EditDecorationManager;
}): Promise<void>;
