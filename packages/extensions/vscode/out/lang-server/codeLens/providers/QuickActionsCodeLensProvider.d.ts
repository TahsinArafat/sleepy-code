import { ContinueConfig, QuickActionConfig } from "core";
import * as vscode from "vscode";
export declare const ENABLE_QUICK_ACTIONS_KEY = "enableQuickActions";
export declare function getQuickActionsConfig(config: ContinueConfig): any;
export declare function subscribeToVSCodeQuickActionsSettings(listener: Function): void;
export declare function toggleQuickActions(): void;
export declare function quickActionsEnabledStatus(): any;
/**
 * A CodeLensProvider for Quick Actions.
 *
 * This class provides code lenses for Quick Actions, which can be either custom or default actions.
 * It supports actions for functions and classes, and can be configured with custom quick action settings.
 */
export declare class QuickActionsCodeLensProvider implements vscode.CodeLensProvider {
    private customQuickActionsConfigs?;
    /**
     * Defines which code elements are eligible for Quick Actions.
     *
     * Right now, we only allow functions, methods, constructors
     * and classes to keep things simple.
     */
    quickActionSymbolKinds: vscode.SymbolKind[];
    constructor(customQuickActionsConfigs?: QuickActionConfig[] | undefined);
    getCustomCommands(range: vscode.Range, quickActionConfigs: QuickActionConfig[]): vscode.Command[];
    getDefaultCommand(range: vscode.Range): vscode.Command[];
    /**
     * Get all top-level symbols and their immediate children.
     * We do not recurse through all children to avoid noise.
     */
    getTopLevelAndChildrenSymbols(uri: vscode.Uri): Promise<vscode.DocumentSymbol[]>;
    provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]>;
}
