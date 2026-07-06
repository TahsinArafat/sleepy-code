import { SleepyAuth } from "../auth/sleepy-auth";
export interface ContinueModel {
    title: string;
    provider: string;
    model: string;
    apiBase: string;
    apiKey: string;
    contextLength?: number;
    description?: string;
}
export declare class ContinueConfigWriter {
    private _auth;
    constructor(auth: SleepyAuth);
    /** Ensure the ~/.continue/ directory exists. */
    private ensureContinueDir;
    /** Read the current Continue config. Returns null if it doesn't exist or is invalid. */
    private readConfig;
    /** Write the Continue config atomically. */
    private writeConfig;
    /**
     * Build the Sleepy model entries for Continue based on the current auth state.
     * Each model from the dashboard API becomes a Continue model entry with the
     * current JWT as the API key.
     */
    private buildSleepyModels;
    /**
     * Sync Sleepy models into Continue's config.
     * Reads the existing config, replaces/removes Sleepy entries,
     * and writes back atomically.
     */
    sync(): boolean;
    /** Remove all Sleepy entries from Continue config (e.g., on logout). */
    removeSleepyModels(): boolean;
}
