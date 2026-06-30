import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { createServer, type Server } from "http"

// Mock the open module
const mockOpen = mock(() => Promise.resolve())
mock.module("open", () => ({ default: mockOpen }))

// Mock the Global.Path module
const mockConfigPath = path.join(os.tmpdir(), `sleepy-test-${Date.now()}`)
mock.module("../../src/global/index.js", () => ({
  Global: {
    Path: {
      config: mockConfigPath,
      home: os.homedir(),
    },
  },
}))

import { LoginCommand } from "../../src/cli/cmd/login"

describe("login command", () => {
  let server: Server | null = null
  let configDir: string

  beforeEach(async () => {
    configDir = path.join(os.tmpdir(), `sleepy-test-${Date.now()}`)
    await fs.mkdir(configDir, { recursive: true })
    mockOpen.mockClear()
  })

  afterEach(async () => {
    if (server) {
      server.close()
      server = null
    }
    try {
      await fs.rm(configDir, { recursive: true, force: true })
    } catch {}
  })

  test("LoginCommand has correct command name", () => {
    expect(LoginCommand.command).toBe("login")
  })

  test("LoginCommand has describe", () => {
    expect(LoginCommand.describe).toBeDefined()
  })

  test("LoginCommand has handler function", () => {
    expect(typeof LoginCommand.handler).toBe("function")
  })

  test("HTTP server listens on port 40821", async () => {
    const { startLoginServer } = await import("../../src/cli/cmd/login")
    const serverPromise = startLoginServer()

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Try to connect to the server
    const response = await fetch("http://localhost:40821/callback").catch(() => null)
    expect(response).not.toBeNull()

    serverPromise.then((s) => s.close())
  })

  test("HTTP server responds to /callback with code query param", async () => {
    const { startLoginServer, waitForCode } = await import("../../src/cli/cmd/login")

    const serverPromise = startLoginServer()
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Simulate OAuth callback with code
    const codePromise = waitForCode()
    await fetch("http://localhost:40821/callback?code=test-auth-code-123")

    const code = await Promise.race([
      codePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000)),
    ])

    expect(code).toBe("test-auth-code-123")

    const server = await serverPromise
    server.close()
  })

  test("Token exchange sends correct payload to dashboard", async () => {
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "token-123",
            endpoint: "https://api.sleepy.ai",
            tier: "pro",
            email: "test@example.com",
          }),
      })
    ) as unknown as typeof fetch
    global.fetch = mockFetch

    const { exchangeCodeForToken } = await import("../../src/cli/cmd/login")

    await exchangeCodeForToken("test-code", "https://dashboard.sleepy.ai")

    expect(mockFetch).toHaveBeenCalledWith(
      "https://dashboard.sleepy.ai/api/auth/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "test-code", client_id: "sleepy-cli" }),
      })
    )
  })

  test("Config file is written with correct structure", async () => {
    const configPath = path.join(configDir, "config.json")
    const { writeConfig } = await import("../../src/cli/cmd/login")

    await writeConfig(configPath, {
      access_token: "token-123",
      endpoint: "https://api.sleepy.ai",
      tier: "pro",
      email: "test@example.com",
    })

    const config = await fs.readFile(configPath, "utf-8")
    const parsed = JSON.parse(config)

    expect(parsed).toEqual({
      access_token: "token-123",
      endpoint: "https://api.sleepy.ai",
      tier: "pro",
      email: "test@example.com",
    })
  })

  test("Browser opens correct OAuth URL", async () => {
    process.env.SLEEPY_DASHBOARD_URL = "https://dashboard.sleepy.ai"
    const { buildAuthorizeUrl } = await import("../../src/cli/cmd/login")

    const url = buildAuthorizeUrl("https://dashboard.sleepy.ai")
    expect(url).toContain("https://dashboard.sleepy.ai/api/auth/oauth/authorize")
    expect(url).toContain("client_id=sleepy-cli")
    expect(url).toContain("redirect_uri=")
    expect(url).toContain("localhost%3A40821")
    expect(url).toContain("response_type=code")

    delete process.env.SLEEPY_DASHBOARD_URL
  })

  test("Uses SLEEPY_DASHBOARD_URL env var when set", () => {
    process.env.SLEEPY_DASHBOARD_URL = "https://custom.dashboard.ai"
    const { getDashboardUrl } = require("../../src/cli/cmd/login")

    const url = getDashboardUrl()
    expect(url).toBe("https://custom.dashboard.ai")

    delete process.env.SLEEPY_DASHBOARD_URL
  })

  test("Falls back to localhost:3000 when env var not set", () => {
    delete process.env.SLEEPY_DASHBOARD_URL
    const { getDashboardUrl } = require("../../src/cli/cmd/login")

    const url = getDashboardUrl()
    expect(url).toBe("http://localhost:3000")
  })
})
