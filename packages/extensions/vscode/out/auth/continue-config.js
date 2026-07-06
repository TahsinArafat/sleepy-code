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
exports.ContinueConfigWriter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const CONTINUE_CONFIG_PATH = path.join(os.homedir(), ".continue", "config.json");
class ContinueConfigWriter {
    _auth;
    constructor(auth) {
        this._auth = auth;
        this._auth.onAuthChange(() => this.sync());
    }
    /** Ensure the ~/.continue/ directory exists. */
    ensureContinueDir() {
        const dir = path.dirname(CONTINUE_CONFIG_PATH);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            }
            catch {
                return false;
            }
        }
        return true;
    }
    /** Read the current Continue config. Returns null if it doesn't exist or is invalid. */
    readConfig() {
        try {
            if (!fs.existsSync(CONTINUE_CONFIG_PATH))
                return null;
            return JSON.parse(fs.readFileSync(CONTINUE_CONFIG_PATH, "utf-8"));
        }
        catch {
            return null;
        }
    }
    /** Write the Continue config atomically. */
    writeConfig(config) {
        try {
            const tmpPath = CONTINUE_CONFIG_PATH + ".tmp";
            fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
            fs.renameSync(tmpPath, CONTINUE_CONFIG_PATH);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Build the Sleepy model entries for Continue based on the current auth state.
     * Each model from the dashboard API becomes a Continue model entry with the
     * current JWT as the API key.
     */
    buildSleepyModels() {
        if (!this._auth.isAuthenticated || !this._auth.token)
            return [];
        return this._auth.models.map((m) => ({
            title: m.name,
            provider: "openai",
            model: m.omniRouteModelId || m.id,
            apiBase: `${this._auth.dashboardUrl}/api/v1`,
            apiKey: this._auth.token,
            contextLength: m.contextWindow || undefined,
        }));
    }
    /**
     * Sync Sleepy models into Continue's config.
     * Reads the existing config, replaces/removes Sleepy entries,
     * and writes back atomically.
     */
    sync() {
        if (!this.ensureContinueDir())
            return false;
        const config = this.readConfig() || {};
        const models = config.models || [];
        // Remove old entries with "Sleepy" in the title (case-insensitive)
        const withoutSleepy = models.filter((m) => !m.title || !m.title.toLowerCase().includes("sleepy"));
        // Add current Sleepy models if authenticated
        const sleepyModels = this.buildSleepyModels();
        const updatedModels = [...withoutSleepy, ...sleepyModels];
        // Update subscriptions: add Sleepy as tab autocomplete if not present
        const tabs = config.tabAutocompleteModels || [];
        return this.writeConfig({
            ...config,
            models: updatedModels,
            // If we have models, ensure tabAutocompleteModels picks the first one
            tabAutocompleteModels: tabs.length > 0 ? tabs : (sleepyModels.length > 0 ? [{ title: sleepyModels[0].title, provider: "openai", model: sleepyModels[0].model }] : tabs),
        });
    }
    /** Remove all Sleepy entries from Continue config (e.g., on logout). */
    removeSleepyModels() {
        if (!this.ensureContinueDir())
            return false;
        const config = this.readConfig();
        if (!config)
            return false;
        const models = (config.models || []).filter((m) => !m.title || !m.title.toLowerCase().includes("sleepy"));
        const tabs = (config.tabAutocompleteModels || []).filter((t) => !t.title || !t.title.toLowerCase().includes("sleepy"));
        return this.writeConfig({ ...config, models, tabAutocompleteModels: tabs });
    }
}
exports.ContinueConfigWriter = ContinueConfigWriter;
//# sourceMappingURL=continue-config.js.map