import { Core } from "core/core";
import { ContinueGUIWebviewViewProvider } from "../ContinueGUIWebviewViewProvider";
import { VsCodeIde } from "../VsCodeIde";
import { VerticalDiffManager } from "./vertical/manager";
export declare function processDiff(action: "accept" | "reject", sidebar: ContinueGUIWebviewViewProvider, ide: VsCodeIde, core: Core, verticalDiffManager: VerticalDiffManager, newFileUri?: string, streamId?: string, toolCallId?: string): Promise<void>;
