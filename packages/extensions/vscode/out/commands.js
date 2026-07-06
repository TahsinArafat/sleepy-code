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
exports.registerAllCommands = registerAllCommands;
/* eslint-disable @typescript-eslint/naming-convention */
const fs = __importStar(require("node:fs"));
const constants_1 = require("core/util/constants");
const walkDir_1 = require("core/indexing/walkDir");
const llm_1 = require("core/llm");
const lemonadeHelper_1 = require("core/util/lemonadeHelper");
const ollamaHelper_1 = require("core/util/ollamaHelper");
const paths_1 = require("core/util/paths");
const vscode = __importStar(require("vscode"));
const YAML = __importStar(require("yaml"));
const dist_1 = require("../../../packages/config-yaml/dist");
const statusBar_1 = require("./autocomplete/statusBar");
const processDiff_1 = require("./diff/processDiff");
const addCode_1 = require("./util/addCode");
const util_1 = require("./util/util");
const vscode_1 = require("./util/vscode");
let fullScreenPanel;
function getFullScreenTab() {
    const tabs = vscode.window.tabGroups.all.flatMap((tabGroup) => tabGroup.tabs);
    return tabs.find((tab) => tab.input?.viewType?.endsWith("continue.continueGUIView"));
}
function focusGUI() {
    const fullScreenTab = getFullScreenTab();
    if (fullScreenTab) {
        // focus fullscreen
        fullScreenPanel?.reveal();
    }
    else {
        // focus sidebar
        vscode.commands.executeCommand("continue.continueGUIView.focus");
        // vscode.commands.executeCommand("workbench.action.focusAuxiliaryBar");
    }
}
function hideGUI() {
    const fullScreenTab = getFullScreenTab();
    if (fullScreenTab) {
        // focus fullscreen
        fullScreenPanel?.dispose();
    }
    else {
        // focus sidebar
        vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
        // vscode.commands.executeCommand("workbench.action.toggleAuxiliaryBar");
    }
}
function waitForSidebarReady(sidebar, timeout, interval) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const checkReadyState = () => {
            if (sidebar.isReady) {
                resolve(true);
            }
            else if (Date.now() - startTime >= timeout) {
                resolve(false); // Timed out
            }
            else {
                setTimeout(checkReadyState, interval);
            }
        };
        checkReadyState();
    });
}
// Copy everything over from extension.ts
const getCommandsMap = (ide, extensionContext, sidebar, consoleView, configHandler, verticalDiffManager, battery, quickEdit, core, editDecorationManager) => {
    /**
     * Streams an inline edit to the vertical diff manager.
     *
     * This function retrieves the configuration, determines the appropriate model title,
     * increments the FTC count, and then streams an edit to the
     * vertical diff manager.
     *
     * @param  promptName - The key for the prompt in the context menu configuration.
     * @param  fallbackPrompt - The prompt to use if the configured prompt is not available.
     * @param  [range] - Optional. The range to edit if provided.
     * @returns
     */
    async function streamInlineEdit(promptName, fallbackPrompt, range) {
        const { config } = await configHandler.loadConfig();
        if (!config) {
            throw new Error("Config not loaded");
        }
        const llm = config.selectedModelByRole.edit ?? config.selectedModelByRole.chat;
        if (!llm) {
            throw new Error("No edit or chat model selected");
        }
        void sidebar.webviewProtocol.request("incrementFtc", undefined);
        await verticalDiffManager.streamEdit({
            input: config.experimental?.contextMenuPrompts?.[promptName] ?? fallbackPrompt,
            llm,
            range,
            rulesToInclude: config.rules,
            isApply: false,
        });
    }
    return {
        "continue.acceptDiff": async (newFileUri, streamId) => {
            void (0, processDiff_1.processDiff)("accept", sidebar, ide, core, verticalDiffManager, newFileUri, streamId);
        },
        "continue.rejectDiff": async (newFileUri, streamId) => {
            void (0, processDiff_1.processDiff)("reject", sidebar, ide, core, verticalDiffManager, newFileUri, streamId);
        },
        "continue.acceptVerticalDiffBlock": (fileUri, index) => {
            verticalDiffManager.acceptRejectVerticalDiffBlock(true, fileUri, index);
        },
        "continue.rejectVerticalDiffBlock": (fileUri, index) => {
            verticalDiffManager.acceptRejectVerticalDiffBlock(false, fileUri, index);
        },
        "continue.quickFix": async (range, diagnosticMessage) => {
            const prompt = `Please explain the cause of this error and how to solve it: ${diagnosticMessage}`;
            (0, addCode_1.addCodeToContextFromRange)(range, sidebar.webviewProtocol, prompt);
            vscode.commands.executeCommand("continue.continueGUIView.focus");
        },
        "continue.defaultQuickAction": async (args) => {
            vscode.commands.executeCommand("continue.focusEdit", args);
        },
        "continue.customQuickActionSendToChat": async (prompt, range) => {
            (0, addCode_1.addCodeToContextFromRange)(range, sidebar.webviewProtocol, prompt);
            vscode.commands.executeCommand("continue.continueGUIView.focus");
        },
        "continue.customQuickActionStreamInlineEdit": async (prompt, range) => {
            streamInlineEdit("docstring", prompt, range);
        },
        "continue.codebaseForceReIndex": async () => {
            core.invoke("index/forceReIndex", undefined);
        },
        "continue.rebuildCodebaseIndex": async () => {
            core.invoke("index/forceReIndex", { shouldClearIndexes: true });
        },
        "continue.docsIndex": async () => {
            core.invoke("context/indexDocs", { reIndex: false });
        },
        "continue.docsReIndex": async () => {
            core.invoke("context/indexDocs", { reIndex: true });
        },
        "continue.focusContinueInput": async () => {
            const isContinueInputFocused = await sidebar.webviewProtocol.request("isContinueInputFocused", undefined, false);
            // This is a temporary fix—sidebar.webviewProtocol.request is blocking
            // when the GUI hasn't yet been setup and we should instead be
            // immediately throwing an error, or returning a Result object
            focusGUI();
            if (!sidebar.isReady) {
                const isReady = await waitForSidebarReady(sidebar, 5000, 100);
                if (!isReady) {
                    return;
                }
            }
            const historyLength = await sidebar.webviewProtocol.request("getWebviewHistoryLength", undefined, false);
            if (isContinueInputFocused) {
                if (historyLength === 0) {
                    hideGUI();
                }
                else {
                    void sidebar.webviewProtocol?.request("focusContinueInputWithNewSession", undefined, false);
                }
            }
            else {
                focusGUI();
                sidebar.webviewProtocol?.request("focusContinueInputWithNewSession", undefined, false);
                void (0, addCode_1.addHighlightedCodeToContext)(sidebar.webviewProtocol);
            }
        },
        "continue.focusContinueInputWithoutClear": async () => {
            const isContinueInputFocused = await sidebar.webviewProtocol.request("isContinueInputFocused", undefined, false);
            // This is a temporary fix—sidebar.webviewProtocol.request is blocking
            // when the GUI hasn't yet been setup and we should instead be
            // immediately throwing an error, or returning a Result object
            focusGUI();
            if (!sidebar.isReady) {
                const isReady = await waitForSidebarReady(sidebar, 5000, 100);
                if (!isReady) {
                    return;
                }
            }
            if (isContinueInputFocused) {
                hideGUI();
            }
            else {
                focusGUI();
                sidebar.webviewProtocol?.request("focusContinueInputWithoutClear", undefined);
                void (0, addCode_1.addHighlightedCodeToContext)(sidebar.webviewProtocol);
            }
        },
        // QuickEditShowParams are passed from CodeLens, temp fix
        // until we update to new params specific to Edit
        "continue.focusEdit": async (args) => {
            focusGUI();
            sidebar.webviewProtocol?.request("focusEdit", undefined);
        },
        "continue.exitEditMode": async () => {
            editDecorationManager.clear();
            void sidebar.webviewProtocol?.request("exitEditMode", undefined);
        },
        "continue.writeCommentsForCode": async () => {
            streamInlineEdit("comment", "Write comments for this code. Do not change anything about the code itself.");
        },
        "continue.writeDocstringForCode": async () => {
            void streamInlineEdit("docstring", "Write a docstring for this code. Do not change anything about the code itself.");
        },
        "continue.fixCode": async () => {
            streamInlineEdit("fix", "Fix this code. If it is already 100% correct, simply rewrite the code.");
        },
        "continue.optimizeCode": async () => {
            streamInlineEdit("optimize", "Optimize this code");
        },
        "continue.fixGrammar": async () => {
            streamInlineEdit("fixGrammar", "If there are any grammar or spelling mistakes in this writing, fix them. Do not make other large changes to the writing.");
        },
        "continue.clearConsole": async () => {
            consoleView.clearLog();
        },
        "continue.viewLogs": async () => {
            vscode.commands.executeCommand("workbench.action.toggleDevTools");
        },
        "continue.debugTerminal": async () => {
            const terminalContents = await ide.getTerminalContents();
            vscode.commands.executeCommand("continue.continueGUIView.focus");
            sidebar.webviewProtocol?.request("userInput", {
                input: `I got the following error, can you please help explain how to fix it?\n\n${terminalContents.trim()}`,
            });
        },
        "continue.hideInlineTip": () => {
            vscode.workspace
                .getConfiguration(constants_1.EXTENSION_NAME)
                .update("showInlineTip", false, vscode.ConfigurationTarget.Global);
        },
        // Commands without keyboard shortcuts
        "continue.addModel": () => {
            vscode.commands.executeCommand("continue.continueGUIView.focus");
            sidebar.webviewProtocol?.request("addModel", undefined);
        },
        "continue.newSession": () => {
            sidebar.webviewProtocol?.request("newSession", undefined);
        },
        "continue.shareSession": async (sessionId) => {
            if (!sessionId) {
                sessionId = await sidebar.webviewProtocol?.request("getCurrentSessionId", undefined);
            }
            if (!sessionId) {
                void vscode.window.showErrorMessage("No session ID found. Please start a new session first.");
                return;
            }
            //let user select the destination folder
            const destinationFolder = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: "Select Destination Folder",
            });
            if (!destinationFolder || destinationFolder.length === 0) {
                return;
            }
            try {
                // despite core.invoke not being async, we still need to await it, because the 'history/share' command is async
                // if not awaited, then errors will not be caught.
                await core.invoke("history/share", {
                    id: sessionId,
                    outputDir: destinationFolder[0].fsPath,
                });
            }
            catch (error) {
                const errorMessage = `Failed to save session: ${error instanceof Error ? error.message : String(error)}`;
                void vscode.window.showErrorMessage(errorMessage);
            }
        },
        "continue.viewHistory": () => {
            vscode.commands.executeCommand("continue.navigateTo", "/history", true);
        },
        "continue.focusContinueSessionId": async (sessionId) => {
            if (!sessionId) {
                sessionId = await vscode.window.showInputBox({
                    prompt: "Enter the Session ID",
                });
            }
            void sidebar.webviewProtocol?.request("focusContinueSessionId", {
                sessionId,
            });
        },
        "continue.applyCodeFromChat": () => {
            void sidebar.webviewProtocol.request("applyCodeFromChat", undefined);
        },
        "continue.openConfigPage": () => {
            vscode.commands.executeCommand("continue.navigateTo", "/config", false);
        },
        "continue.selectFilesAsContext": async (firstUri, uris) => {
            if (uris === undefined) {
                throw new Error("No files were selected");
            }
            vscode.commands.executeCommand("continue.continueGUIView.focus");
            for (const uri of uris) {
                // If it's a folder, add the entire folder contents recursively by using walkDir (to ignore ignored files)
                const isDirectory = await vscode.workspace.fs
                    .stat(uri)
                    ?.then((stat) => stat.type === vscode.FileType.Directory);
                if (isDirectory) {
                    for await (const fileUri of (0, walkDir_1.walkDirAsync)(uri.toString(), ide, {
                        source: "vscode continue.selectFilesAsContext command",
                    })) {
                        await (0, addCode_1.addEntireFileToContext)(vscode.Uri.parse(fileUri), sidebar.webviewProtocol, ide.ideUtils);
                    }
                }
                else {
                    await (0, addCode_1.addEntireFileToContext)(uri, sidebar.webviewProtocol, ide.ideUtils);
                }
            }
        },
        "continue.logAutocompleteOutcome": (completionId, completionProvider) => {
            completionProvider.accept(completionId);
        },
        "continue.logNextEditOutcomeAccept": (completionId, nextEditLoggingService) => {
            nextEditLoggingService.accept(completionId);
        },
        "continue.logNextEditOutcomeReject": (completionId, nextEditLoggingService) => {
            nextEditLoggingService.reject(completionId);
        },
        "continue.toggleTabAutocompleteEnabled": () => {
            const config = vscode.workspace.getConfiguration(constants_1.EXTENSION_NAME);
            const enabled = config.get("enableTabAutocomplete");
            const pauseOnBattery = config.get("pauseTabAutocompleteOnBattery");
            if (!pauseOnBattery || battery.isACConnected()) {
                config.update("enableTabAutocomplete", !enabled, vscode.ConfigurationTarget.Global);
            }
            else {
                if (enabled) {
                    const paused = (0, statusBar_1.getStatusBarStatus)() === statusBar_1.StatusBarStatus.Paused;
                    if (paused) {
                        (0, statusBar_1.setupStatusBar)(statusBar_1.StatusBarStatus.Enabled);
                    }
                    else {
                        config.update("enableTabAutocomplete", false, vscode.ConfigurationTarget.Global);
                    }
                }
                else {
                    (0, statusBar_1.setupStatusBar)(statusBar_1.StatusBarStatus.Paused);
                    config.update("enableTabAutocomplete", true, vscode.ConfigurationTarget.Global);
                }
            }
        },
        "continue.forceAutocomplete": async () => {
            // 1. Explicitly hide any existing suggestion. This clears VS Code's cache for the current position.
            await vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
            // 2. Now trigger a new one. VS Code has no cached suggestion, so it's forced to call our provider.
            await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
        },
        "continue.openTabAutocompleteConfigMenu": async () => {
            const config = vscode.workspace.getConfiguration(constants_1.EXTENSION_NAME);
            const quickPick = vscode.window.createQuickPick();
            const { config: continueConfig } = await configHandler.loadConfig();
            const autocompleteModels = continueConfig?.modelsByRole.autocomplete ?? [];
            const selected = continueConfig?.selectedModelByRole?.autocomplete?.title ?? undefined;
            // Toggle between Disabled, Paused, and Enabled
            const pauseOnBattery = config.get("pauseTabAutocompleteOnBattery") &&
                !battery.isACConnected();
            const currentStatus = (0, statusBar_1.getStatusBarStatus)();
            let targetStatus;
            if (pauseOnBattery) {
                // Cycle from Disabled -> Paused -> Enabled
                targetStatus =
                    currentStatus === statusBar_1.StatusBarStatus.Paused
                        ? statusBar_1.StatusBarStatus.Enabled
                        : currentStatus === statusBar_1.StatusBarStatus.Disabled
                            ? statusBar_1.StatusBarStatus.Paused
                            : statusBar_1.StatusBarStatus.Disabled;
            }
            else {
                // Toggle between Disabled and Enabled
                targetStatus =
                    currentStatus === statusBar_1.StatusBarStatus.Disabled
                        ? statusBar_1.StatusBarStatus.Enabled
                        : statusBar_1.StatusBarStatus.Disabled;
            }
            const nextEditEnabled = config.get("enableNextEdit") ?? false;
            quickPick.items = [
                {
                    label: "$(gear) Open settings",
                },
                {
                    label: "$(comment) Open chat",
                    description: (0, util_1.getMetaKeyLabel)() + " + L",
                },
                {
                    label: "$(screen-full) Open full screen chat",
                    description: (0, util_1.getMetaKeyLabel)() + " + K, " + (0, util_1.getMetaKeyLabel)() + " + M",
                },
                {
                    label: (0, statusBar_1.quickPickStatusText)(targetStatus),
                    description: (0, util_1.getMetaKeyLabel)() + " + K, " + (0, util_1.getMetaKeyLabel)() + " + A",
                },
                ...(0, statusBar_1.getNextEditMenuItems)(currentStatus, nextEditEnabled),
                {
                    kind: vscode.QuickPickItemKind.Separator,
                    label: "Switch model",
                },
                ...autocompleteModels.map((model) => ({
                    label: (0, statusBar_1.getAutocompleteStatusBarTitle)(selected, model),
                    description: (0, statusBar_1.getAutocompleteStatusBarDescription)(selected, model),
                })),
            ];
            quickPick.onDidAccept(() => {
                const selectedOption = quickPick.selectedItems[0].label;
                const targetStatus = (0, statusBar_1.getStatusBarStatusFromQuickPickItemLabel)(selectedOption);
                if (targetStatus !== undefined) {
                    (0, statusBar_1.setupStatusBar)(targetStatus);
                    config.update("enableTabAutocomplete", targetStatus === statusBar_1.StatusBarStatus.Enabled, vscode.ConfigurationTarget.Global);
                }
                else if ((0, statusBar_1.isNextEditToggleLabel)(selectedOption)) {
                    (0, statusBar_1.handleNextEditToggle)(selectedOption, config);
                }
                else if (autocompleteModels.some((model) => model.title === selectedOption)) {
                    if (core.configHandler.currentProfile?.profileDescription.id) {
                        core.invoke("config/updateSelectedModel", {
                            profileId: core.configHandler.currentProfile?.profileDescription.id,
                            role: "autocomplete",
                            title: selectedOption,
                        });
                    }
                }
                else if (selectedOption === "$(comment) Open chat") {
                    vscode.commands.executeCommand("continue.focusContinueInput");
                }
                else if (selectedOption === "$(screen-full) Open full screen chat") {
                    vscode.commands.executeCommand("continue.openInNewWindow");
                }
                else if (selectedOption === "$(gear) Open settings") {
                    vscode.commands.executeCommand("continue.navigateTo", "/config");
                }
                quickPick.dispose();
            });
            quickPick.show();
        },
        "continue.navigateTo": (path, toggle) => {
            sidebar.webviewProtocol?.request("navigateTo", { path, toggle });
            focusGUI();
        },
        "continue.startLocalOllama": () => {
            (0, ollamaHelper_1.startLocalOllama)(ide);
        },
        "continue.startLocalLemonade": () => {
            (0, lemonadeHelper_1.startLocalLemonade)(ide);
        },
        "continue.installModel": async (modelName, llmProvider) => {
            try {
                if (!(0, llm_1.isModelInstaller)(llmProvider)) {
                    const msg = llmProvider
                        ? `LLM provider '${llmProvider.providerName}' does not support installing models`
                        : "Missing LLM Provider";
                    throw new Error(msg);
                }
                await installModelWithProgress(modelName, llmProvider);
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                vscode.window.showErrorMessage(`Failed to install '${modelName}': ${message}`);
            }
        },
        "continue.convertConfigJsonToConfigYaml": async () => {
            const configJson = fs.readFileSync((0, paths_1.getConfigJsonPath)(), "utf-8");
            const parsed = JSON.parse(configJson);
            const configYaml = (0, dist_1.convertJsonToYamlConfig)(parsed);
            const configYamlPath = (0, paths_1.getConfigYamlPath)();
            fs.writeFileSync(configYamlPath, YAML.stringify(configYaml));
            (0, paths_1.setConfigFilePermissions)(configYamlPath);
            // Open config.yaml
            await (0, vscode_1.openEditorAndRevealRange)(vscode.Uri.file(configYamlPath), undefined, undefined, false);
            void vscode.window
                .showInformationMessage("Your config.json has been converted to the new config.yaml format. If you need to switch back to config.json, you can delete or rename config.yaml.", "Read the docs")
                .then(async (selection) => {
                if (selection === "Read the docs") {
                    await vscode.env.openExternal(vscode.Uri.parse("https://docs.continue.dev/yaml-migration"));
                }
            });
        },
        "continue.enterEnterpriseLicenseKey": async () => {
            const licenseKey = await vscode.window.showInputBox({
                prompt: "Enter your enterprise license key",
                password: true,
                ignoreFocusOut: true,
                placeHolder: "License key",
            });
            if (!licenseKey) {
                return;
            }
            try {
                const isValid = core.invoke("mdm/setLicenseKey", {
                    licenseKey,
                });
                if (isValid) {
                    void vscode.window.showInformationMessage("Enterprise license key successfully validated and saved. Reloading window.");
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    await vscode.commands.executeCommand("workbench.action.reloadWindow");
                }
                else {
                    void vscode.window.showErrorMessage("Invalid license key. Please check your license key and try again.");
                }
            }
            catch (error) {
                void vscode.window.showErrorMessage(`Failed to set enterprise license key: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        "continue.toggleNextEditEnabled": async () => {
            const config = vscode.workspace.getConfiguration(constants_1.EXTENSION_NAME);
            const tabAutocompleteEnabled = config.get("enableTabAutocomplete");
            if (!tabAutocompleteEnabled) {
                vscode.window.showInformationMessage("Please enable tab autocomplete first to use Next Edit");
                return;
            }
            const nextEditEnabled = config.get("enableNextEdit") ?? false;
            // updateNextEditState in VsCodeExtension.ts will handle the validation.
            config.update("enableNextEdit", !nextEditEnabled, vscode.ConfigurationTarget.Global);
        },
        "continue.openInNewWindow": async () => {
            focusGUI();
            const sessionId = await sidebar.webviewProtocol.request("getCurrentSessionId", undefined);
            // Check if full screen is already open by checking open tabs
            const fullScreenTab = getFullScreenTab();
            if (fullScreenTab && fullScreenPanel) {
                // Full screen open, but not focused - focus it
                fullScreenPanel.reveal();
                return;
            }
            // Clear the sidebar to prevent overwriting changes made in fullscreen
            vscode.commands.executeCommand("continue.newSession");
            // Full screen not open - open it
            // Create the full screen panel
            let panel = vscode.window.createWebviewPanel("continue.continueGUIView", "Continue", vscode.ViewColumn.One, {
                retainContextWhenHidden: true,
                enableScripts: true,
            });
            fullScreenPanel = panel;
            // Add content to the panel
            panel.webview.html = sidebar.getSidebarContent(extensionContext, panel, undefined, undefined, true);
            const sessionLoader = panel.onDidChangeViewState(() => {
                vscode.commands.executeCommand("continue.newSession");
                if (sessionId) {
                    vscode.commands.executeCommand("continue.focusContinueSessionId", sessionId);
                }
                panel.reveal();
                sessionLoader.dispose();
            });
            // When panel closes, reset the webview and focus
            panel.onDidDispose(() => {
                sidebar.resetWebviewProtocolWebview();
                vscode.commands.executeCommand("continue.focusContinueInput");
            }, null, extensionContext.subscriptions);
            vscode.commands.executeCommand("workbench.action.copyEditorToNewWindow");
            vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
        },
        "continue.forceNextEdit": async () => {
            // This is basically the same logic as forceAutocomplete.
            // I'm writing a new command KV pair here in case we diverge in features.
            await vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
            await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
        },
    };
};
async function installModelWithProgress(modelName, modelInstaller) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing model '${modelName}'`,
        cancellable: true,
    }, async (windowProgress, token) => {
        let currentProgress = 0;
        const progressWrapper = (details, worked, total) => {
            let increment = 0;
            if (worked && total) {
                const progressValue = Math.round((worked / total) * 100);
                increment = progressValue - currentProgress;
                currentProgress = progressValue;
            }
            windowProgress.report({ message: details, increment });
        };
        const abortController = new AbortController();
        token.onCancellationRequested(() => {
            console.log(`Pulling ${modelName} model was cancelled`);
            abortController.abort();
        });
        await modelInstaller.installModel(modelName, abortController.signal, progressWrapper);
    });
}
function registerAllCommands(context, ide, extensionContext, sidebar, consoleView, configHandler, verticalDiffManager, battery, quickEdit, core, editDecorationManager) {
    for (const [command, callback] of Object.entries(getCommandsMap(ide, extensionContext, sidebar, consoleView, configHandler, verticalDiffManager, battery, quickEdit, core, editDecorationManager))) {
        context.subscriptions.push(vscode.commands.registerCommand(command, callback));
    }
}
//# sourceMappingURL=commands.js.map