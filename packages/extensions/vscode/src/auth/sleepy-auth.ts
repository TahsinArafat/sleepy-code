import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";

export interface GatewayConfig {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_at?: number;
  endpoint?: string;
  tier?: string;
  email?: string;
  dashboard_url?: string;
}

export interface SleepyModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputLimit: number;
  inputPrice: number;
  outputPrice: number;
  omniRouteModelId?: string;
}

export class SleepyAuth {
  private _models: SleepyModel[] = [];
  private _gateway: GatewayConfig | null = null;
  private _enabled = true;
  private _onAuthChange = new Set<() => void>();
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  get gateway() { return this._gateway; }
  get models() { return this._models; }
  get isAuthenticated() { return this._gateway !== null && !!this._gateway.access_token; }
  get isAutocompleteEnabled() { return this._enabled; }

  constructor() {
    this._gateway = this.readGateway();
    this._startRefreshTimer();
  }

  onAuthChange(cb: () => void) {
    this._onAuthChange.add(cb);
    return () => this._onAuthChange.delete(cb);
  }

  private configPath(): string {
    return path.join(os.homedir(), ".config", "sleepy", "gateway.json");
  }

  private readGateway(): GatewayConfig | null {
    try {
      return JSON.parse(fs.readFileSync(this.configPath(), "utf-8"));
    } catch {
      return null;
    }
  }

  private notify() {
    for (const cb of this._onAuthChange) cb();
  }

  /**
   * Proactive refresh timer — runs every 15 minutes, checks if the token
   * is within 10 minutes of expiry and refreshes before it expires.
   * Same pattern as the CLI's session-check.ts — ensures no API call
   * ever hits a stale JWT.
   */
  private _startRefreshTimer() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      if (!this._gateway?.expires_at || !this._gateway?.refresh_token) return;
      const timeUntilExpiry = this._gateway.expires_at - Date.now();
      if (timeUntilExpiry < 10 * 60 * 1000) {
        this.refreshToken();
      }
    }, 15 * 60 * 1000);
  }

  get dashboardUrl(): string {
    return this._gateway?.dashboard_url ?? "https://www.sleepyai.org";
  }

  get token(): string | undefined {
    return this._gateway?.access_token || this._gateway?.token;
  }

  recheck() {
    this._gateway = this.readGateway();
    this.notify();
  }

  async refreshToken(): Promise<boolean> {
    if (!this._gateway?.refresh_token) return false;
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
    } catch {
      // Network error — offline, keep current token
      return false;
    }
  }

  async refreshModels(): Promise<SleepyModel[]> {
    if (!this.token) return [];
    try {
      const res = await fetch(`${this.dashboardUrl}/api/v1/models`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.status === 401) {
        const refreshed = await this.refreshToken();
        if (refreshed) return this.refreshModels();
        return [];
      }
      if (!res.ok) return [];
      const json = await res.json();
      this._models = (json.data ?? []).map((m: any) => ({
        id: m.modelId ?? m.id,
        name: m.name ?? m.id,
        contextWindow: m.contextWindow ?? 128000,
        maxOutputLimit: m.maxOutputLimit ?? 4096,
        inputPrice: m.inputPrice ?? 0,
        outputPrice: m.outputPrice ?? 0,
        omniRouteModelId: m.omniRouteModelId,
      }));
      return this._models;
    } catch {
      return [];
    }
  }

  loginViaTerminal() {
    const terminal = vscode.window.createTerminal("Sleepy Login");
    terminal.show();
    terminal.sendText("sleepy login");
    vscode.window.showInformationMessage(
      "Follow the login flow in your browser, then return to VS Code."
    );
  }

  toggleAutocomplete() {
    this._enabled = !this._enabled;
    this.notify();
  }
}
