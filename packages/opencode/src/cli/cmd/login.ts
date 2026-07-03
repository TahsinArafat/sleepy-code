import { cmd } from "./cmd"
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import open from "open"
import fs from "fs/promises"
import path from "path"
import { setTimeout as sleep } from "timers/promises"
import { Global } from "../../global"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"

const PORT = 40821

export const getDashboardUrl = (): string => process.env.SLEEPY_DASHBOARD_URL || "http://localhost:3000"

export const buildAuthorizeUrl = (dashboardUrl: string): string => {
  const params = new URLSearchParams({
    client_id: "sleepy-cli",
    redirect_uri: `http://localhost:${PORT}/callback`,
    response_type: "code",
  })
  return `${dashboardUrl}/api/auth/oauth/authorize?${params.toString()}`
}

export const exchangeCodeForToken = async (code: string, dashboardUrl: string) => {
  const response = await fetch(`${dashboardUrl}/api/auth/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, client_id: "sleepy-cli" }),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`)
  }

  return response.json() as Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
    endpoint: string
    tier: string
    email: string
  }>
}

export const writeConfig = async (
  configPath: string,
  data: { access_token: string; refresh_token?: string; expires_at?: number; endpoint: string; tier: string; email: string; dashboard_url?: string }
) => {
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(data, null, 2), "utf-8")
}

let codeResolver: ((code: string) => void) | null = null
let codePromise: Promise<string> | null = null

export const waitForCode = (): Promise<string> => {
  if (!codePromise) {
    codePromise = new Promise<string>((resolve) => {
      codeResolver = resolve
    })
  }
  return codePromise
}

export const startLoginServer = (): Promise<Server> => {
  return new Promise((resolve) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://localhost:${PORT}`)

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code")

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Sleepy CLI - Login Successful</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .card {
                  background: white;
                  padding: 40px;
                  border-radius: 12px;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  text-align: center;
                }
                .success {
                  color: #10b981;
                  font-size: 48px;
                  margin-bottom: 20px;
                }
                h1 {
                  color: #1f2937;
                  margin: 0 0 10px 0;
                }
                p {
                  color: #6b7280;
                  margin: 0;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="success">✓</div>
                <h1>Login Successful!</h1>
                <p>You can close this window and return to the CLI.</p>
              </div>
            </body>
            </html>
          `)

          if (codeResolver) {
            codeResolver(code)
            codeResolver = null
            codePromise = null
          }
        } else {
          res.writeHead(400, { "Content-Type": "text/html" })
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Sleepy CLI - Login Failed</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                }
                .card {
                  background: white;
                  padding: 40px;
                  border-radius: 12px;
                  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                  text-align: center;
                }
                .error {
                  color: #ef4444;
                  font-size: 48px;
                  margin-bottom: 20px;
                }
                h1 {
                  color: #1f2937;
                  margin: 0 0 10px 0;
                }
                p {
                  color: #6b7280;
                  margin: 0;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="error">✗</div>
                <h1>Login Failed</h1>
                <p>No authorization code received. Please try again.</p>
              </div>
            </body>
            </html>
          `)
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not Found")
      }
    })

    server.listen(PORT, () => {
      resolve(server)
    })
  })
}

const handleAuthCodeFlow = async () => {
  UI.empty()
  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Starting OAuth login..." + UI.Style.TEXT_NORMAL)

  const dashboardUrl = getDashboardUrl()
  const authorizeUrl = buildAuthorizeUrl(dashboardUrl)

  const server = await startLoginServer()

  UI.println(UI.Style.TEXT_DIM + "Waiting for authorization at:" + UI.Style.TEXT_NORMAL)
  UI.println(authorizeUrl)
  UI.println("")
  UI.println(UI.Style.TEXT_DIM + "Opening browser..." + UI.Style.TEXT_NORMAL)

  try {
    await open(authorizeUrl)
  } catch (e) {
    UI.println(UI.Style.TEXT_WARNING + "Could not open browser automatically." + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "Please open the URL above in your browser." + UI.Style.TEXT_NORMAL)
  }

  UI.println(UI.Style.TEXT_DIM + "Waiting for authorization..." + UI.Style.TEXT_NORMAL)

  const code = await waitForCode()
  server.close()

  UI.println(UI.Style.TEXT_DIM + "Exchanging code for token..." + UI.Style.TEXT_NORMAL)

  const tokenData = await exchangeCodeForToken(code, dashboardUrl)

  const configPath = path.join(Global.Path.config, "gateway.json")
  await writeConfig(configPath, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
    endpoint: tokenData.endpoint,
    tier: tokenData.tier,
    email: tokenData.email,
    dashboard_url: dashboardUrl,
  })

  UI.println("")
  UI.println(UI.Style.TEXT_SUCCESS_BOLD + "✓ Login successful!" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_DIM + "  Email: " + UI.Style.TEXT_NORMAL + tokenData.email)
  UI.println(UI.Style.TEXT_DIM + "  Tier: " + UI.Style.TEXT_NORMAL + tokenData.tier)
  UI.println(UI.Style.TEXT_DIM + "  Config saved to: " + UI.Style.TEXT_NORMAL + configPath)
  UI.println("")
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  interval: number
}

export interface DeviceTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  endpoint: string
  tier: string
  email: string
}

export const startDeviceFlow = async (dashboardUrl: string): Promise<DeviceCodeResponse> => {
  const res = await fetch(`${dashboardUrl}/api/auth/oauth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: "sleepy-cli" }),
  })
  if (!res.ok) throw new Error("Failed to start device login")
  return res.json()
}

export const pollDeviceToken = async (
  dashboardUrl: string,
  deviceCode: string,
): Promise<DeviceTokenResponse> => {
  const res = await fetch(`${dashboardUrl}/api/auth/oauth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: "sleepy-cli",
    }),
  })

  if (res.ok) return res.json()

  let body: Record<string, unknown> | null = null
  try {
    body = await res.json()
  } catch {
    const text = await res.text().catch(() => "")
    throw Object.assign(new Error(text ? `Server error: ${text.substring(0, 200)}` : `HTTP ${res.status}`), {
      code: "server_error",
    })
  }

  const err: any = new Error((body?.error as string) || "Unknown error")
  err.code = body?.error ?? "server_error"
  throw err
}

const handleDeviceFlow = async () => {
  UI.empty()
  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Starting device login..." + UI.Style.TEXT_NORMAL)

  const dashboardUrl = getDashboardUrl()
  let deviceData: DeviceCodeResponse
  try {
    deviceData = await startDeviceFlow(dashboardUrl)
  } catch {
    UI.println(UI.Style.TEXT_DANGER_BOLD + "Failed to start device login." + UI.Style.TEXT_NORMAL)
    return
  }

  const { device_code, user_code, verification_uri_complete, interval } = deviceData

  UI.println("")
  UI.println(UI.Style.TEXT_DIM + "Open this URL in your browser:" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "  " + verification_uri_complete + UI.Style.TEXT_NORMAL)
  UI.println("")
  UI.println(UI.Style.TEXT_DIM + "Enter the following code:" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "  " + user_code + UI.Style.TEXT_NORMAL)
  UI.println("")

  try {
    await open(verification_uri_complete)
    UI.println(UI.Style.TEXT_DIM + "Browser opened automatically." + UI.Style.TEXT_NORMAL)
  } catch {
    UI.println(UI.Style.TEXT_WARNING + "Could not open browser automatically." + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "Please open the URL above and enter the code in your browser." + UI.Style.TEXT_NORMAL)
  }

  UI.println(UI.Style.TEXT_DIM + "Waiting for authorization..." + UI.Style.TEXT_NORMAL)

  const pollMs = (interval ?? 5) * 1000
  let tokenData: DeviceTokenResponse | null = null

  while (true) {
    await sleep(pollMs)

    try {
      tokenData = await pollDeviceToken(dashboardUrl, device_code)
      break
    } catch (err: any) {
      if (err.code === "authorization_pending" || err.code === "slow_down") continue
      if (err.code === "expired_token") {
        UI.println(UI.Style.TEXT_DANGER_BOLD + "Login expired. Please try again." + UI.Style.TEXT_NORMAL)
        return
      }
      if (err.code === "access_denied") {
        UI.println(UI.Style.TEXT_DANGER_BOLD + "Login denied." + UI.Style.TEXT_NORMAL)
        return
      }
      UI.println(UI.Style.TEXT_DANGER_BOLD + "Login failed: " + (err.message || "Unknown error") + UI.Style.TEXT_NORMAL)
      return
    }
  }

  const configPath = path.join(Global.Path.config, "gateway.json")
  await writeConfig(configPath, {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
    endpoint: tokenData.endpoint,
    tier: tokenData.tier,
    email: tokenData.email,
    dashboard_url: dashboardUrl,
  })

  UI.println("")
  UI.println(UI.Style.TEXT_SUCCESS_BOLD + "✓ Login successful!" + UI.Style.TEXT_NORMAL)
  UI.println(UI.Style.TEXT_DIM + "  Email: " + UI.Style.TEXT_NORMAL + tokenData.email)
  UI.println(UI.Style.TEXT_DIM + "  Tier: " + UI.Style.TEXT_NORMAL + tokenData.tier)
  UI.println(UI.Style.TEXT_DIM + "  Config saved to: " + UI.Style.TEXT_NORMAL + configPath)
  UI.println("")
}

export const LoginCommand = cmd({
  command: "login",
  describe: "Log in to Sleepy CLI via OAuth",
  builder: (yargs) =>
    yargs.option("device", {
      type: "boolean",
      description: "Use device code flow for environments without a browser",
    }),
  async handler(args) {
    if (args.device) {
      return handleDeviceFlow()
    }

    prompts.intro("Login to Sleepy")
    const method = await prompts.select({
      message: "How would you like to log in?",
      options: [
        { value: "browser", label: "Open in Browser", hint: "recommended" },
        { value: "device", label: "Use Activation Code" },
        { value: "exit", label: "Exit" },
      ],
    })

    if (prompts.isCancel(method) || method === "exit") {
      prompts.outro("Goodbye!")
      return
    }

    if (method === "device") return handleDeviceFlow()
    return handleAuthCodeFlow()
  },
})
