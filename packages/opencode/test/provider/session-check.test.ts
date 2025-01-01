import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"

const originalFetch = globalThis.fetch

function tmpConfig(): string {
  return path.join(os.tmpdir(), `session-check-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
}

async function writeTmpConfig(filePath: string, data: Record<string, unknown>) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

describe("session-check", () => {
  beforeEach(() => {
    mock.module("@/bus", () => ({
      Bus: { publish: mock(() => Promise.resolve()) },
    }))
    mock.module("@/bus/bus-event", () => ({
      BusEvent: {
        define: (type: string, schema: any) => ({ type, properties: schema }),
      },
    }))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restore()
  })

  test("check returns true for 200 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    ) as any

    const configPath = tmpConfig()
    await writeTmpConfig(configPath, { access_token: "test-token" })

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "test-token",
      configPath,
    })

    const result = await checker.check()
    expect(result).toBe(true)
    expect(checker.isExpired()).toBe(false)
    await fs.rm(configPath, { force: true })
  })

  test("check returns false and marks expired for 401 with no refresh token", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ reason: "token_revoked" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    ) as any

    const configPath = tmpConfig()
    await writeTmpConfig(configPath, { access_token: "test-token" })

    let expiredMessage = ""
    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "test-token",
      configPath,
      onExpired: (msg) => { expiredMessage = msg },
    })

    const result = await checker.check()
    expect(result).toBe(false)
    expect(checker.isExpired()).toBe(true)
    expect(expiredMessage).toContain("session has expired")
    await fs.rm(configPath, { force: true })
  })

  test("check returns false for 403 response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 403 })),
    ) as any

    const configPath = tmpConfig()
    await writeTmpConfig(configPath, { access_token: "test-token" })

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "test-token",
      configPath,
    })

    const result = await checker.check()
    expect(result).toBe(false)
    expect(checker.isExpired()).toBe(true)
    await fs.rm(configPath, { force: true })
  })

  test("check returns true on network error (offline = still valid)", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    ) as any

    const configPath = tmpConfig()
    await writeTmpConfig(configPath, { access_token: "test-token" })

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "test-token",
      configPath,
    })

    const result = await checker.check()
    expect(result).toBe(true)
    expect(checker.isExpired()).toBe(false)
    await fs.rm(configPath, { force: true })
  })

  test("proactive refresh when token near expiry", async () => {
    const configPath = tmpConfig()
    // expires_at is 3 minutes from now (within 5-min refresh buffer)
    await writeTmpConfig(configPath, {
      access_token: "old-token",
      refresh_token: "refresh-token-123",
      expires_at: Date.now() + 3 * 60 * 1000,
    })

    let refreshCalled = false
    globalThis.fetch = mock((url: string) => {
      if (url.includes("/token/refresh")) {
        refreshCalled = true
        return Promise.resolve(
          new Response(JSON.stringify({
            access_token: "new-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    }) as any

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "old-token",
      configPath,
    })

    const result = await checker.check()
    expect(result).toBe(true)
    expect(refreshCalled).toBe(true)
    expect(checker.getToken()).toBe("new-token")

    // Verify config was updated
    const updated = JSON.parse(await fs.readFile(configPath, "utf-8"))
    expect(updated.access_token).toBe("new-token")
    expect(updated.refresh_token).toBe("new-refresh-token")
    await fs.rm(configPath, { force: true })
  })

  test("no refresh when token is not near expiry", async () => {
    const configPath = tmpConfig()
    // expires_at is 30 minutes from now (outside 5-min refresh buffer)
    await writeTmpConfig(configPath, {
      access_token: "valid-token",
      refresh_token: "refresh-token-123",
      expires_at: Date.now() + 30 * 60 * 1000,
    })

    let refreshCalled = false
    globalThis.fetch = mock((url: string) => {
      if (url.includes("/token/refresh")) {
        refreshCalled = true
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    }) as any

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "valid-token",
      configPath,
    })

    const result = await checker.check()
    expect(result).toBe(true)
    expect(refreshCalled).toBe(false)
    await fs.rm(configPath, { force: true })
  })

  test("start and stop manage interval lifecycle", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    ) as any

    const configPath = tmpConfig()
    await writeTmpConfig(configPath, { access_token: "test-token" })

    const { createSessionChecker } = await import("../../src/provider/session-check")
    const checker = createSessionChecker({
      dashboardUrl: "https://example.com",
      token: "test-token",
      configPath,
    })

    checker.start()
    checker.stop()
    checker.start()
    checker.stop()
    await fs.rm(configPath, { force: true })
  })
})
