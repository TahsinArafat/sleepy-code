import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SleepyAuth } from "../auth/sleepy-auth";

const CONTINUE_CONFIG_PATH = path.join(os.homedir(), ".continue", "config.json");

export interface ContinueModel {
  title: string;
  provider: string;
  model: string;
  apiBase: string;
  apiKey: string;
  contextLength?: number;
  description?: string;
}

export class ContinueConfigWriter {
  private _auth: SleepyAuth;

  constructor(auth: SleepyAuth) {
    this._auth = auth;
    this._auth.onAuthChange(() => this.sync());
  }

  /** Ensure the ~/.continue/ directory exists. */
  private ensureContinueDir(): boolean {
    const dir = path.dirname(CONTINUE_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { return false; }
    }
    return true;
  }

  /** Read the current Continue config. Returns null if it doesn't exist or is invalid. */
  private readConfig(): any | null {
    try {
      if (!fs.existsSync(CONTINUE_CONFIG_PATH)) return null;
      return JSON.parse(fs.readFileSync(CONTINUE_CONFIG_PATH, "utf-8"));
    } catch { return null; }
  }

  /** Write the Continue config atomically. */
  private writeConfig(config: any): boolean {
    try {
      const tmpPath = CONTINUE_CONFIG_PATH + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2));
      fs.renameSync(tmpPath, CONTINUE_CONFIG_PATH);
      return true;
    } catch { return false; }
  }

  /**
   * Build the Sleepy model entries for Continue based on the current auth state.
   * Each model from the dashboard API becomes a Continue model entry with the
   * current JWT as the API key.
   */
  private buildSleepyModels(): ContinueModel[] {
    if (!this._auth.isAuthenticated || !this._auth.token) return [];
    return this._auth.models.map((m) => ({
      title: m.name,
      provider: "openai",
      model: m.omniRouteModelId || m.id,
      apiBase: `${this._auth.dashboardUrl}/api/v1`,
      apiKey: this._auth.token!,
      contextLength: m.contextWindow || undefined,
    }));
  }

  /**
   * Sync Sleepy models into Continue's config.
   * Reads the existing config, replaces/removes Sleepy entries,
   * and writes back atomically.
   */
  sync(): boolean {
    if (!this.ensureContinueDir()) return false;

    const config = this.readConfig() || {};
    const models: any[] = config.models || [];

    // Remove old entries with "Sleepy" in the title (case-insensitive)
    const withoutSleepy = models.filter(
      (m: any) => !m.title || !m.title.toLowerCase().includes("sleepy")
    );

    // Add current Sleepy models if authenticated
    const sleepyModels = this.buildSleepyModels();
    const updatedModels = [...withoutSleepy, ...sleepyModels];

    // Update subscriptions: add Sleepy as tab autocomplete if not present
    const tabs: any[] = config.tabAutocompleteModels || [];

    return this.writeConfig({
      ...config,
      models: updatedModels,
      // If we have models, ensure tabAutocompleteModels picks the first one
      tabAutocompleteModels: tabs.length > 0 ? tabs : (sleepyModels.length > 0 ? [{ title: sleepyModels[0].title, provider: "openai", model: sleepyModels[0].model }] : tabs),
    });
  }

  /** Remove all Sleepy entries from Continue config (e.g., on logout). */
  removeSleepyModels(): boolean {
    if (!this.ensureContinueDir()) return false;
    const config = this.readConfig();
    if (!config) return false;

    const models = (config.models || []).filter(
      (m: any) => !m.title || !m.title.toLowerCase().includes("sleepy")
    );

    const tabs = (config.tabAutocompleteModels || []).filter(
      (t: any) => !t.title || !t.title.toLowerCase().includes("sleepy")
    );

    return this.writeConfig({ ...config, models, tabAutocompleteModels: tabs });
  }
}
