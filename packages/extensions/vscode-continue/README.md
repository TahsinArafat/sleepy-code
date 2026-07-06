# Sleepy Code — VS Code Extension (Continue Fork)

This is a fork of [Continue](https://github.com/continuedev/continue) with Sleepy's backend integration.

## Architecture

```
extensions/vscode-continue/
├── src/           — Continue's VS Code adapter (activation, commands, webview, IDE bridge)
├── gui/           — Continue's React webview SPA (chat, agent mode, edit/diff, model selector)
├── media/         — Icons
└── package.json   — Extension manifest
```

The extension reuses **Continue's full UI/UX** (chat sidebar, agent mode, inline edit, tab autocomplete, code diff) but talks to **Sleepy's API proxy** instead of Continue's core. Auth is handled via `~/.config/sleepy/gateway.json` — the same JWT the CLI uses.

## Setup

```bash
cd packages/extensions/vscode-continue

# Install VS Code extension deps
npm install

# Build the React webview (gui/)
cd gui && npm install && npm run build && cd ..

# Compile the extension
npm run compile

# Test in VS Code
code --extensionDevelopmentPath=.

# Package as .vsix
npx @vscode/vsce package
```

## Customization Guide

### Step 1: Package identity — `package.json`
```json
{
  "name": "sleepy-code",
  "displayName": "Sleepy Code",
  "publisher": "sleepy-ai",
  "icon": "media/sleepy-icon.svg"
}
```

### Step 2: Sleepy provider — `src/sleepy/sleepy-provider.ts`
Create a provider that reads `gateway.json` and passes the JWT as the API key:

```typescript
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface GatewayConfig {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  dashboard_url?: string;
}

export function getSleepyAuth(): { apiKey: string; baseUrl: string } | null {
  try {
    const cfg: GatewayConfig = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".config", "sleepy", "gateway.json"), "utf-8")
    );
    if (!cfg.access_token) return null;
    return {
      apiKey: cfg.access_token,
      baseUrl: cfg.dashboard_url || "https://www.sleepyai.org",
    };
  } catch { return null; }
}

export function getSleepyModels() {
  const auth = getSleepyAuth();
  if (!auth) return [];
  // Return models that Continue can use
  return [
    {
      title: "Deepseek V4 Pro",
      provider: "openai",
      model: "deepseek-v4-pro",
      apiKey: auth.apiKey,
      apiBase: `${auth.baseUrl}/api/v1`,
      completionOptions: { maxTokens: 4096 },
    },
    {
      title: "Deepseek V4 Flash",
      provider: "openai",
      model: "deepseek-v4-flash",
      apiKey: auth.apiKey,
      apiBase: `${auth.baseUrl}/api/v1`,
      completionOptions: { maxTokens: 4096 },
    },
  ];
}
```

### Step 3: Auth injection — `src/activation/activate.ts`
After the config is loaded, inject Sleepy's models and handle token refresh on 401:

```typescript
import { getSleepyModels } from "../sleepy/sleepy-provider";

// Inside the activation function, after config is loaded:
const sleepyModels = getSleepyModels();
if (sleepyModels.length > 0) {
  // Prepend Sleepy models to the model list
  config.models = [...sleepyModels, ...(config.models || [])];
}
```

Add a 401 interceptor in `src/llm.ts` or wherever HTTP requests are made:
```typescript
// When a 401 is received, try refreshing the token from gateway.json
if (response.status === 401) {
  const refreshed = await refreshSleepyToken();
  if (refreshed) {
    // Retry the request with the new token
    return makeRequestWithNewToken(...);
  }
}
```

Where `refreshSleepyToken` calls `/api/auth/token/refresh` using the stored refresh_token, then writes the result back to `gateway.json`.

### Step 4: Token refresh logic

```typescript
// src/sleepy/token-refresh.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function refreshSleepyToken(): Promise<boolean> {
  const configPath = path.join(os.homedir(), ".config", "sleepy", "gateway.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!cfg.refresh_token) return false;

    const res = await fetch(`${cfg.dashboard_url || "https://www.sleepyai.org"}/api/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: cfg.refresh_token }),
    });
    if (!res.ok) return false;

    const data = await res.json();
    cfg.access_token = data.access_token;
    cfg.refresh_token = data.refresh_token;
    cfg.expires_at = Date.now() + (data.expires_in ?? 3600) * 1000;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    return true;
  } catch { return false; }
}
```

### Step 5: Branding — `gui/src/`
- Update `gui/src/index.css` — replace Continue colors with Sleepy's (emerald-600/zinc palette)
- Change logo/icon in `gui/src/context/` and `package.json`
- Replace "Continue" text references in the GUI components

## What You Keep From Continue

| Feature | Files | Works Out of Box? |
|---------|-------|-------------------|
| Chat sidebar | `gui/src/pages/Chat.tsx` | ✅ After config |
| Agent mode | `gui/src/components/` | ✅ After config |
| Tab autocomplete | `src/autocomplete/` | ✅ After config |
| Inline edit/diff | `src/apply/`, `src/diff/` | ✅ After config |
| Slash commands | `src/commands.ts` | ✅ After config |
| Context selector | `gui/src/` | ✅ After config |
| Model management | `core/` (not forked) | Replace with Sleepy API |
| Auth | `~/.continue/config.json` | Replace with `gateway.json` |
| Telemetry | Continue servers | Disable |
| Config sync | Continue servers | Disable |

## Key Changes Summary

| File | Change |
|------|--------|
| `package.json` | name, publisher, icon → sleepy |
| `src/activation/activate.ts` | Add Sleepy provider injection |
| `src/sleepy/sleepy-provider.ts` | **New** — reads gateway.json, returns models |
| `src/sleepy/token-refresh.ts` | **New** — JWT refresh on 401 |
| `gui/src/index.css` | Brand colors |
| `gui/src/context/` | Logo, app name |
| `config_schema.json` | Remove Continue-specific tiers |
| `models/` | Replace with Sleepy model list |

## License

Apache 2.0 (inherited from Continue)
