"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processDiff = processDiff;
const log_1 = require("core/data/log");
const myers_1 = require("core/diff/myers");
const EditOutcomeTracker_1 = require("../extension/EditOutcomeTracker");
async function processDiff(action, sidebar, ide, core, verticalDiffManager, newFileUri, streamId, toolCallId) {
    let newOrCurrentUri = newFileUri;
    if (!newOrCurrentUri) {
        const currentFile = await ide.getCurrentFile();
        newOrCurrentUri = currentFile?.path;
    }
    if (!newOrCurrentUri) {
        console.warn(`No file provided or current file open while attempting to resolve diff`);
        return;
    }
    await ide.openFile(newOrCurrentUri);
    // If streamId is not provided, try to get it from the VerticalDiffManager
    if (!streamId) {
        streamId = verticalDiffManager.getStreamIdForFile(newOrCurrentUri);
    }
    // Clear vertical diffs depending on action
    verticalDiffManager.clearForfileUri(newOrCurrentUri, action === "accept");
    if (action === "reject") {
        // this is so that IDE reject diff command can also cancel apply
        core.invoke("cancelApply", undefined);
    }
    if (streamId) {
        // Capture file content before save to detect autoformatting
        const preSaveContent = await ide.readFile(newOrCurrentUri);
        // Record the edit outcome before updating the apply state
        await EditOutcomeTracker_1.editOutcomeTracker.recordEditOutcome(streamId, action === "accept", log_1.DataLogger.getInstance());
        // Save the file
        await ide.saveFile(newOrCurrentUri);
        // Capture file content after save to detect autoformatting
        const postSaveContent = await ide.readFile(newOrCurrentUri);
        // Detect autoformatting by comparing normalized content
        let autoFormattingDiff;
        const normalizedPreSave = preSaveContent.trim();
        const normalizedPostSave = postSaveContent.trim();
        if (normalizedPreSave !== normalizedPostSave) {
            // Auto-formatting was applied by the editor
            const diffLines = (0, myers_1.myersDiff)(preSaveContent, postSaveContent);
            autoFormattingDiff = diffLines
                .map((line) => {
                switch (line.type) {
                    case "old":
                        return `-${line.line}`;
                    case "new":
                        return `+${line.line}`;
                    case "same":
                        return ` ${line.line}`;
                }
            })
                .join("\n");
        }
        await sidebar.webviewProtocol.request("updateApplyState", {
            fileContent: postSaveContent, // Use post-save content
            filepath: newOrCurrentUri,
            streamId,
            status: "closed",
            numDiffs: 0,
            toolCallId,
            autoFormattingDiff, // Include autoformatting diff
        });
    }
    else {
        // Save the file even if no streamId
        await ide.saveFile(newOrCurrentUri);
    }
}
//# sourceMappingURL=processDiff.js.map