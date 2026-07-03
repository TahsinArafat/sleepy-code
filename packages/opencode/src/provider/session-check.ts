import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import fs from "fs/promises"
import { Log } from "../util"
import z from "zod"

const log = Log.create({ service: "provider.session-check" })

const SESSION_CHECK_MS = 5 * 60 * 1000 // 5 minutes
const REQUEST_TIMEOUT_MS = 10_000
const INITIAL_DELAY_MS = 30_000
// Proactively refresh when within 5 minutes of expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000

export interface SessionCheckerOptions {
  dashboardUrl: string
  token: string
  configPath: string
  onExpired?: (message: string) => void
  onRefreshed?: (newToken: string) => void
}

interface GatewayConfig {
  access_token?: string
  token?: string
  refresh_token?: string
  expires_at?: number
  endpoint?: string
  tier?: string
  email?: string
  dashboard_url?: string
}

async function readConfig(configPath: string): Promise<GatewayConfig | null> {
  try {
    return JSON.parse(await fs.readFile(configPath, "utf-8"))
  } catch {
    return null
  }
}

async function writeConfig(configPath: string, config: GatewayConfig): Promise<void> {
  const tmpPath = configPath + ".tmp"
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2))
  await fs.rename(tmpPath, configPath)
}

async function refreshToken(dashboardUrl: string, refreshTokenValue: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
} | null> {
  try {
    const res = await fetch(`${dashboardUrl}/api/auth/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function createSessionChecker(options: SessionCheckerOptions) {
  let intervalHandle: ReturnType<typeof setInterval> | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  let expired = false
  let currentToken = options.token

  async function tryRefresh(): Promise<boolean> {
    const config = await readConfig(options.configPath)
    if (!config?.refresh_token) return false

    const refreshResult = await refreshToken(options.dashboardUrl, config.refresh_token)
    if (!refreshResult) return false

    const updated: GatewayConfig = {
      ...config,
      access_token: refreshResult.access_token,
      refresh_token: refreshResult.refresh_token,
      expires_at: Date.now() + refreshResult.expires_in * 1000,
    }
    await writeConfig(options.configPath, updated)
    currentToken = refreshResult.access_token
    options.onRefreshed?.(refreshResult.access_token)
    log.info("token refreshed proactively", { expiresIn: refreshResult.expires_in })
    return true
  }

  async function check(): Promise<boolean> {
    // Proactive refresh: if token is close to expiry, refresh before it fails
    const config = await readConfig(options.configPath)
    if (config?.expires_at && config.refresh_token) {
      const timeUntilExpiry = config.expires_at - Date.now()
      if (timeUntilExpiry < REFRESH_BUFFER_MS && timeUntilExpiry > 0) {
        const refreshed = await tryRefresh()
        if (refreshed) return true
      }
    }

    try {
      const res = await fetch(`${options.dashboardUrl}/api/auth/session/check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${currentToken}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (res.status === 401 || res.status === 403) {
        // Token rejected — try one refresh attempt before giving up
        if (config?.refresh_token) {
          const refreshed = await tryRefresh()
          if (refreshed) return true
        }

        const body = await res.json().catch(() => ({}))
        const message = "Your Sleepy session has expired or been revoked. Run /login to re-authenticate."
        log.warn("session expired — run 'sleepy login' to re-authenticate", { reason: body.reason, status: res.status })
        expired = true
        options.onExpired?.(message)
        void Bus.publish(
          BusEvent.define("tui.session.expired", z.object({ message: z.string() })),
          { message },
        )
        return false
      }
      return true
    } catch {
      // Network error or timeout — user is offline, ignore
      return true
    }
  }

  function start() {
    if (intervalHandle) return
    timeoutHandle = setTimeout(() => {
      check()
      intervalHandle = setInterval(check, SESSION_CHECK_MS)
    }, INITIAL_DELAY_MS)
  }

  function stop() {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  }

  function isExpired() {
    return expired
  }

  function getToken() {
    return currentToken
  }

  return { check, start, stop, isExpired, getToken }
}
