import { cmd } from "./cmd"
import fs from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { Global } from "../../global"
import { UI } from "../ui"

const maskToken = (token: string): string => {
  if (token.length <= 12) return token
  return token.slice(0, 12) + "..." + token.slice(-4)
}

const checkCredentials = async (): Promise<{ endpoint: string; email: string; tier: string } | null> => {
  const configPath = path.join(Global.Path.config, "gateway.json")

  if (!existsSync(configPath)) {
    UI.println(UI.Style.TEXT_DANGER_BOLD + "✗ Credentials config missing. Please authenticate first by running 'sleepy login'." + UI.Style.TEXT_NORMAL)
    return null
  }

  try {
    const raw = await fs.readFile(configPath, "utf-8")
    const config = JSON.parse(raw)

    const isExpired = config.expires_at ? Date.now() > config.expires_at : false
    const hasRefresh = !!config.refresh_token

    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "✓ Credentials found" + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_DIM + "  Endpoint: " + UI.Style.TEXT_NORMAL + config.endpoint)
    UI.println(UI.Style.TEXT_DIM + "  Email:    " + UI.Style.TEXT_NORMAL + config.email)
    UI.println(UI.Style.TEXT_DIM + "  Tier:     " + UI.Style.TEXT_NORMAL + config.tier)
    UI.println(UI.Style.TEXT_DIM + "  Token:    " + UI.Style.TEXT_NORMAL + maskToken(config.access_token || config.token))
    UI.println(UI.Style.TEXT_DIM + "  Expires:  " + UI.Style.TEXT_NORMAL + (isExpired ? UI.Style.TEXT_DANGER_BOLD + "EXPIRED" : UI.Style.TEXT_SUCCESS_BOLD + "valid"))
    if (hasRefresh) {
      UI.println(UI.Style.TEXT_DIM + "  Refresh:  " + UI.Style.TEXT_NORMAL + "available" + (isExpired ? " (will auto-refresh)" : ""))
    }
    UI.println("")

    return { endpoint: config.endpoint, email: config.email, tier: config.tier }
  } catch {
    UI.println(UI.Style.TEXT_DANGER_BOLD + "✗ Failed to read gateway.json. Try re-authenticating with 'sleepy login'." + UI.Style.TEXT_NORMAL)
    return null
  }
}

const testGatewayLatency = async (endpoint: string): Promise<boolean> => {
  const healthUrl = `${endpoint}/api/monitoring/health`
  const start = Date.now()

  try {
    const response = await fetch(healthUrl)
    const latency = Date.now() - start

    if (response.ok) {
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + `✓ Sleepy Gateway is responsive (${latency}ms latency).` + UI.Style.TEXT_NORMAL)
      return true
    }

    UI.println(UI.Style.TEXT_WARNING + `✗ Failed to connect to Sleepy Gateway endpoint at ${healthUrl}. Check server status.` + UI.Style.TEXT_NORMAL)
    return false
  } catch {
    UI.println(UI.Style.TEXT_WARNING + `✗ Failed to connect to Sleepy Gateway endpoint at ${healthUrl}. Check server status.` + UI.Style.TEXT_NORMAL)
    return false
  }
}

const checkWorkspace = (): void => {
  const cwd = process.cwd()
  const sleepyJson = path.join(cwd, "sleepy.json")
  const sleepyJsonc = path.join(cwd, "sleepy.jsonc")
  const agentsMd = path.join(cwd, "AGENTS.md")

  UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Project workspace:" + UI.Style.TEXT_NORMAL)

  // Check sleepy.json / sleepy.jsonc
  const hasConfig = existsSync(sleepyJson) || existsSync(sleepyJsonc)
  if (hasConfig) {
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "  ✓ sleepy.json found" + UI.Style.TEXT_NORMAL)
  } else {
    UI.println(UI.Style.TEXT_WARNING + "  ⚠ sleepy.json not found — run 'sleepy init' to create one" + UI.Style.TEXT_NORMAL)
  }

  // Check AGENTS.md
  const hasAgentsMd = existsSync(agentsMd)
  if (hasAgentsMd) {
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + "  ✓ AGENTS.md found" + UI.Style.TEXT_NORMAL)
  } else {
    UI.println(UI.Style.TEXT_WARNING + "  ⚠ AGENTS.md not found — run 'sleepy init' to create one" + UI.Style.TEXT_NORMAL)
  }

  UI.println("")
}

export const DoctorCommand = cmd({
  command: "doctor",
  describe: "Check environment diagnostics and API connectivity",
  async handler() {
    UI.empty()
    UI.println(UI.Style.TEXT_HIGHLIGHT_BOLD + "Running environment diagnostics..." + UI.Style.TEXT_NORMAL)
    UI.println("")

    // 1. Credentials check
    const credentials = await checkCredentials()

    // 2. Gateway latency test
    if (credentials) {
      await testGatewayLatency(credentials.endpoint)
      UI.println("")
    }

    // 3. Workspace check
    checkWorkspace()

    UI.println(UI.Style.TEXT_DIM + "Diagnostics complete." + UI.Style.TEXT_NORMAL)
  },
})
