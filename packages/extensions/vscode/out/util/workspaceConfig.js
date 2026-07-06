"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTINUE_WORKSPACE_KEY = void 0;
exports.getContinueWorkspaceConfig = getContinueWorkspaceConfig;
const vscode_1 = require("vscode");
exports.CONTINUE_WORKSPACE_KEY = "continue";
function getContinueWorkspaceConfig() {
    return vscode_1.workspace.getConfiguration(exports.CONTINUE_WORKSPACE_KEY);
}
//# sourceMappingURL=workspaceConfig.js.map