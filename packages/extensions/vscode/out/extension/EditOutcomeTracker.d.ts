/**
 * Tracks pending edit interactions until they are accepted or rejected,
 * then emits editOutcome events with the final result.
 */
export interface PendingEditData {
    streamId: string;
    timestamp: string;
    modelProvider: string;
    modelName: string;
    modelTitle: string;
    prompt: string;
    completion: string;
    previousCode: string;
    newCode: string;
    filepath: string;
    previousCodeLines: number;
    newCodeLines: number;
    lineChange: number;
}
declare class EditOutcomeTracker {
    private static instance;
    private pendingEdits;
    private constructor();
    static getInstance(): EditOutcomeTracker;
    /**
     * Store a pending edit interaction for later outcome tracking
     */
    trackEditInteraction(data: PendingEditData): void;
    /**
     * Record the outcome of an edit interaction and emit the editOutcome event
     */
    recordEditOutcome(streamId: string, accepted: boolean, dataLogger: any): Promise<void>;
    /**
     * Clean up pending edits that might have been abandoned
     */
    cleanupOldPendingEdits(maxAgeMs?: number): void;
    /**
     * Get count of pending edits (for debugging/monitoring)
     */
    getPendingEditCount(): number;
}
export declare const editOutcomeTracker: EditOutcomeTracker;
export {};
