import { cmd } from "./cmd"
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http"
import open from "open"
import fs from "fs/promises"
import path from "path"
import { Global } from "../../global"
import { UI } from "../ui"

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
    endpoint: string
    tier: string
    email: string
  }>
}

export const writeConfig = async (
  configPath: string,
  data: { access_token: string; endpoint: string; tier: string; email: string }
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

export const LoginCommand = cmd({
  command: "login",
  describe: "Log in to Sleepy CLI via OAuth",
  async handler() {
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

    const configPath = path.join(Global.Path.config, "config.json")
    await writeConfig(configPath, tokenData)

    UI.println("")
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "✓ Login successful!" + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "  Email: " + UI.Style.TEXT_NORMAL + tokenData.email)
    UI.println(UI.Style.TEXT_DIM + "  Tier: " + UI.Style.TEXT_NORMAL + tokenData.tier)
    UI.println(UI.Style.TEXT_DIM + "  Config saved to: " + UI.Style.TEXT_NORMAL + configPath)
    UI.println("")
  },
})
