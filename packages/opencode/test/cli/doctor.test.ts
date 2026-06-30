import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"
import stripAnsi from "strip-ansi"

// Mock config path for isolation
const mockConfigDir = path.join(os.tmpdir(), `sleepy-doctor-test-${Date.now()}`)

// Mock the Global.Path module
mock.module("../../src/global/index.js", () => ({
  Global: {
    Path: {
      config: mockConfigDir,
      home: os.homedir(),
    },
  },
}))

// Collect stderr output for assertion
let stderrOutput = ""
const originalWrite = process.stderr.write.bind(process.stderr)

beforeEach(async () => {
  stderrOutput = ""
  process.stderr.write = ((data: string | Uint8Array) => {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data)
    stderrOutput += text
    return true
  }) as typeof process.stderr.write

  await fs.mkdir(mockConfigDir, { recursive: true })
})

afterEach(async () => {
  process.stderr.write = originalWrite
  try {
    await fs.rm(mockConfigDir, { recursive: true, force: true })
  } catch {}
})

describe("doctor command", () => {
  test("DoctorCommand has correct command name", async () => {
    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    expect(DoctorCommand.command).toBe("doctor")
  })

  test("DoctorCommand has describe", async () => {
    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    expect(DoctorCommand.describe).toBeDefined()
  })

  test("DoctorCommand has handler function", async () => {
    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    expect(typeof DoctorCommand.handler).toBe("function")
  })

  test("logs error when credentials file is missing", async () => {
    // Ensure gateway.json does NOT exist
    const configPath = path.join(mockConfigDir, "gateway.json")
    try {
      await fs.unlink(configPath)
    } catch {}

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    expect(output).toContain("Credentials config missing")
    expect(output).toContain("sleepy login")
  })

  test("displays credentials when gateway.json exists", async () => {
    const configPath = path.join(mockConfigDir, "gateway.json")
    await fs.writeFile(
      configPath,
      JSON.stringify({
        endpoint: "https://api.sleepy.ai",
        email: "test@example.com",
        tier: "pro",
        access_token: "sk_sleepy_vk_abcdefgh1234567890xxxx",
      }),
    )

    // Mock fetch for latency test
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      }),
    ) as unknown as typeof fetch
    global.fetch = mockFetch

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    expect(output).toContain("Credentials found")
    expect(output).toContain("https://api.sleepy.ai")
    expect(output).toContain("test@example.com")
    expect(output).toContain("pro")
    // Token should be masked
    expect(output).toContain("sk_sleepy_vk...")
    expect(output).toContain("responsive")
  })

  test("logs warning when gateway endpoint is unreachable", async () => {
    const configPath = path.join(mockConfigDir, "gateway.json")
    await fs.writeFile(
      configPath,
      JSON.stringify({
        endpoint: "https://api.sleepy.ai",
        email: "test@example.com",
        tier: "pro",
        access_token: "sk_sleepy_vk_test1234",
      }),
    )

    // Mock fetch to throw
    global.fetch = mock(() => Promise.reject(new Error("Network error"))) as unknown as typeof fetch

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    expect(output).toContain("Failed to connect")
    expect(output).toContain("https://api.sleepy.ai/api/monitoring/health")
  })

  test("warns when sleepy.json is missing from workspace", async () => {
    // Run from a temp dir without sleepy.json
    const originalCwd = process.cwd()
    const tmpDir = path.join(os.tmpdir(), `sleepy-doctor-workspace-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    process.chdir(tmpDir)

    // Ensure gateway.json does NOT exist (skip credentials check)
    const configPath = path.join(mockConfigDir, "gateway.json")
    try {
      await fs.unlink(configPath)
    } catch {}

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    expect(output).toContain("sleepy.json not found")
    expect(output).toContain("sleepy init")

    process.chdir(originalCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("shows success when workspace config files exist", async () => {
    const originalCwd = process.cwd()
    const tmpDir = path.join(os.tmpdir(), `sleepy-doctor-workspace-ok-${Date.now()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    process.chdir(tmpDir)

    // Create workspace files
    await fs.writeFile(path.join(tmpDir, "sleepy.json"), "{}")
    await fs.writeFile(path.join(tmpDir, "AGENTS.md"), "# Agents")

    // Ensure gateway.json does NOT exist
    const configPath = path.join(mockConfigDir, "gateway.json")
    try {
      await fs.unlink(configPath)
    } catch {}

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    expect(output).toContain("sleepy.json found")
    expect(output).toContain("AGENTS.md found")

    process.chdir(originalCwd)
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("token is properly masked", async () => {
    const configPath = path.join(mockConfigDir, "gateway.json")
    const fullToken = "sk_sleepy_vk_abcdefghij1234567890xxxx"
    await fs.writeFile(
      configPath,
      JSON.stringify({
        endpoint: "https://api.sleepy.ai",
        email: "test@example.com",
        tier: "pro",
        access_token: fullToken,
      }),
    )

    // Mock fetch for latency test
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
      }),
    ) as unknown as typeof fetch
    global.fetch = mockFetch

    const { DoctorCommand } = await import("../../src/cli/cmd/doctor")
    await (DoctorCommand.handler as Function)({} as any)

    const output = stripAnsi(stderrOutput)
    // Full token should NOT appear
    expect(output).not.toContain(fullToken)
    // Masked version should appear
    expect(output).toContain("sk_sleepy_vk...")
  })
})
