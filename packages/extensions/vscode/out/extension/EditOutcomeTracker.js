"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editOutcomeTracker = void 0;
class EditOutcomeTracker {
    static instance;
    pendingEdits = new Map();
    constructor() { }
    static getInstance() {
        if (!EditOutcomeTracker.instance) {
            EditOutcomeTracker.instance = new EditOutcomeTracker();
        }
        return EditOutcomeTracker.instance;
    }
    /**
     * Store a pending edit interaction for later outcome tracking
     */
    trackEditInteraction(data) {
        this.pendingEdits.set(data.streamId, data);
    }
    /**
     * Record the outcome of an edit interaction and emit the editOutcome event
     */
    async recordEditOutcome(streamId, accepted, dataLogger) {
        const pendingEdit = this.pendingEdits.get(streamId);
        if (!pendingEdit) {
            console.warn(`No pending edit found for streamId: ${streamId}`);
            return;
        }
        // Emit the editOutcome event
        await dataLogger.logDevData({
            name: "editOutcome",
            data: {
                modelProvider: pendingEdit.modelProvider,
                modelName: pendingEdit.modelName,
                modelTitle: pendingEdit.modelName,
                prompt: pendingEdit.prompt,
                completion: pendingEdit.completion,
                previousCode: pendingEdit.previousCode,
                newCode: pendingEdit.newCode,
                previousCodeLines: pendingEdit.previousCodeLines,
                newCodeLines: pendingEdit.newCodeLines,
                lineChange: pendingEdit.lineChange,
                accepted,
                filepath: pendingEdit.filepath,
            },
        });
        // Clean up the pending edit
        this.pendingEdits.delete(streamId);
    }
    /**
     * Clean up pending edits that might have been abandoned
     */
    cleanupOldPendingEdits(maxAgeMs = 30 * 60 * 1000) {
        const now = Date.now();
        for (const [streamId, edit] of this.pendingEdits.entries()) {
            const editTime = new Date(edit.timestamp).getTime();
            if (now - editTime > maxAgeMs) {
                this.pendingEdits.delete(streamId);
            }
        }
    }
    /**
     * Get count of pending edits (for debugging/monitoring)
     */
    getPendingEditCount() {
        return this.pendingEdits.size;
    }
}
exports.editOutcomeTracker = EditOutcomeTracker.getInstance();
//# sourceMappingURL=EditOutcomeTracker.js.map