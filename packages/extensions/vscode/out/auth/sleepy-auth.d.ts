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
export declare class SleepyAuth {
    private _models;
    private _gateway;
    private _enabled;
    private _onAuthChange;
    private _refreshTimer;
    get gateway(): GatewayConfig | null;
    get models(): SleepyModel[];
    get isAuthenticated(): boolean;
    get isAutocompleteEnabled(): boolean;
    constructor();
    onAuthChange(cb: () => void): () => boolean;
    private configPath;
    private readGateway;
    private notify;
    /**
     * Proactive refresh timer — runs every 15 minutes, checks if the token
     * is within 10 minutes of expiry and refreshes before it expires.
     * Same pattern as the CLI's session-check.ts — ensures no API call
     * ever hits a stale JWT.
     */
    private _startRefreshTimer;
    get dashboardUrl(): string;
    get token(): string | undefined;
    recheck(): void;
    refreshToken(): Promise<boolean>;
    refreshModels(): Promise<SleepyModel[]>;
    loginViaTerminal(): void;
    toggleAutocomplete(): void;
}
