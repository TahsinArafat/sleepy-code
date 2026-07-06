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
exports.SleepyAuth = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const vscode = __importStar(require("vscode"));
class SleepyAuth {
    _models = [];
    _gateway = null;
    _enabled = true;
    _onAuthChange = new Set();
    _refreshTimer = null;
    get gateway() { return this._gateway; }
    get models() { return this._models; }
    get isAuthenticated() { return this._gateway !== null && !!this._gateway.access_token; }
    get isAutocompleteEnabled() { return this._enabled; }
    constructor() {
        this._gateway = this.readGateway();
        this._startRefreshTimer();
    }
    onAuthChange(cb) {
        this._onAuthChange.add(cb);
        return () => this._onAuthChange.delete(cb);
    }
    configPath() {
        return path.join(os.homedir(), ".config", "sleepy", "gateway.json");
    }
    readGateway() {
        try {
            return JSON.parse(fs.readFileSync(this.configPath(), "utf-8"));
        }
        catch {
            return null;
        }
    }
    notify() {
        for (const cb of this._onAuthChange)
            cb();
    }
    /**
     * Proactive refresh timer — runs every 15 minutes, checks if the token
     * is within 10 minutes of expiry and refreshes before it expires.
     * Same pattern as the CLI's session-check.ts — ensures no API call
     * ever hits a stale JWT.
     */
    _startRefreshTimer() {
        if (this._refreshTimer)
            clearInterval(this._refreshTimer);
        this._refreshTimer = setInterval(() => {
            if (!this._gateway?.expires_at || !this._gateway?.refresh_token)
                return;
            const timeUntilExpiry = this._gateway.expires_at - Date.now();
            if (timeUntilExpiry < 10 * 60 * 1000) {
                this.refreshToken();
            }
        }, 15 * 60 * 1000);
    }
    get dashboardUrl() {
        return this._gateway?.dashboard_url ?? "https://www.sleepyai.org";
    }
    get token() {
        return this._gateway?.access_token || this._gateway?.token;
    }
    recheck() {
        this._gateway = this.readGateway();
        this.notify();
    }
    async refreshToken() {
        if (!this._gateway?.refresh_token)
            return false;
        try {
            const res = await fetch(`${this.dashboardUrl}/api/auth/token/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: this._gateway.refresh_token }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                // 401 means refresh token is invalid — session is truly dead
                if (res.status === 401) {
                    this._gateway = null;
                    this.notify();
                }
                return false;
            }
            const data = await res.json();
            this._gateway.access_token = data.access_token;
            this._gateway.refresh_token = data.refresh_token;
            this._gateway.expires_at = Date.now() + (data.expires_in ?? 3600) * 1000;
            // Atomic write to disk
            const tmpPath = this.configPath() + ".tmp";
            fs.writeFileSync(tmpPath, JSON.stringify(this._gateway, null, 2));
            fs.renameSync(tmpPath, this.configPath());
            this.notify();
            return true;
        }
        catch {
            // Network error — offline, keep current token
            return false;
        }
    }
    async refreshModels() {
        if (!this.token)
            return [];
        try {
            const res = await fetch(`${this.dashboardUrl}/api/v1/models`, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (res.status === 401) {
                const refreshed = await this.refreshToken();
                if (refreshed)
                    return this.refreshModels();
                return [];
            }
            if (!res.ok)
                return [];
            const json = await res.json();
            this._models = (json.data ?? []).map((m) => ({
                id: m.modelId ?? m.id,
                name: m.name ?? m.id,
                contextWindow: m.contextWindow ?? 128000,
                maxOutputLimit: m.maxOutputLimit ?? 4096,
                inputPrice: m.inputPrice ?? 0,
                outputPrice: m.outputPrice ?? 0,
                omniRouteModelId: m.omniRouteModelId,
            }));
            return this._models;
        }
        catch {
            return [];
        }
    }
    loginViaTerminal() {
        const terminal = vscode.window.createTerminal("Sleepy Login");
        terminal.show();
        terminal.sendText("sleepy login");
        vscode.window.showInformationMessage("Follow the login flow in your browser, then return to VS Code.");
    }
    toggleAutocomplete() {
        this._enabled = !this._enabled;
        this.notify();
    }
}
exports.SleepyAuth = SleepyAuth;
//# sourceMappingURL=sleepy-auth.js.map