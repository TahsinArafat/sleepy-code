"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickActionsCodeLensProvider = exports.ENABLE_QUICK_ACTIONS_KEY = void 0;
exports.getQuickActionsConfig = getQuickActionsConfig;
exports.subscribeToVSCodeQuickActionsSettings = subscribeToVSCodeQuickActionsSettings;
exports.toggleQuickActions = toggleQuickActions;
exports.quickActionsEnabledStatus = quickActionsEnabledStatus;
const vscode = __importStar(require("vscode"));
const tutorial_1 = require("../../../util/tutorial");
const workspaceConfig_1 = require("../../../util/workspaceConfig");
exports.ENABLE_QUICK_ACTIONS_KEY = "enableQuickActions";
function getQuickActionsConfig(config) {
    return config.experimental?.quickActions;
}
function subscribeToVSCodeQuickActionsSettings(listener) {
    vscode.workspace.onDidChangeConfiguration((e) => {
        const configKey = `${workspaceConfig_1.CONTINUE_WORKSPACE_KEY}.${exports.ENABLE_QUICK_ACTIONS_KEY}`;
        if (e.affectsConfiguration(configKey)) {
            listener();
        }
    });
}
function toggleQuickActions() {
    const curStatus = quickActionsEnabledStatus();
    (0, workspaceConfig_1.getContinueWorkspaceConfig)().update(exports.ENABLE_QUICK_ACTIONS_KEY, curStatus);
}
function quickActionsEnabledStatus() {
    return (0, workspaceConfig_1.getContinueWorkspaceConfig)().get(exports.ENABLE_QUICK_ACTIONS_KEY);
}
/**
 * A CodeLensProvider for Quick Actions.
 *
 * This class provides code lenses for Quick Actions, which can be either custom or default actions.
 * It supports actions for functions and classes, and can be configured with custom quick action settings.
 */
class QuickActionsCodeLensProvider {
    customQuickActionsConfigs;
    /**
     * Defines which code elements are eligible for Quick Actions.
     *
     * Right now, we only allow functions, methods, constructors
     * and classes to keep things simple.
     */
    quickActionSymbolKinds = [
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Method,
        vscode.SymbolKind.Class,
        vscode.SymbolKind.Constructor,
    ];
    constructor(customQuickActionsConfigs) {
        this.customQuickActionsConfigs = customQuickActionsConfigs;
    }
    getCustomCommands(range, quickActionConfigs) {
        return quickActionConfigs.map(({ title, prompt, sendToChat }) => {
            return sendToChat
                ? {
                    title,
                    command: "continue.customQuickActionSendToChat",
                    arguments: [prompt, range],
                }
                : {
                    title,
                    command: "continue.customQuickActionStreamInlineEdit",
                    arguments: [prompt, range],
                };
        });
    }
    getDefaultCommand(range) {
        const quickEdit = {
            command: "continue.defaultQuickAction",
            title: "Continue",
            arguments: [{ range }],
        };
        return [quickEdit];
    }
    /**
     * Get all top-level symbols and their immediate children.
     * We do not recurse through all children to avoid noise.
     */
    async getTopLevelAndChildrenSymbols(uri) {
        const topLevelSymbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri);
        if (!topLevelSymbols) {
            return [];
        }
        const childrenSymbols = topLevelSymbols.flatMap((symbol) => symbol.children);
        const symbols = [...topLevelSymbols, ...childrenSymbols];
        const filteredSmybols = symbols?.filter((symbol) => this.quickActionSymbolKinds.includes(symbol.kind) &&
            !symbol.range.isSingleLine);
        return filteredSmybols;
    }
    async provideCodeLenses(document) {
        // The tutorial file already has a lot of Code Lenses
        // so we don't want to add more to it.
        if ((0, tutorial_1.isTutorialFile)(document.uri)) {
            return [];
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return [];
        }
        const symbols = await this.getTopLevelAndChildrenSymbols(document.uri);
        return symbols.flatMap(({ range }) => {
            const commands = !!this.customQuickActionsConfigs
                ? this.getCustomCommands(range, this.customQuickActionsConfigs)
                : this.getDefaultCommand(range);
            return commands.map((command) => new vscode.CodeLens(range, command));
        });
    }
}
exports.QuickActionsCodeLensProvider = QuickActionsCodeLensProvider;
//# sourceMappingURL=QuickActionsCodeLensProvider.js.map