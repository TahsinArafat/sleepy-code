import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "os"

// Mock the Global.Path module
const mockConfigPath = path.join(os.tmpdir(), `sleepy-init-test-${Date.now()}`)
mock.module("../../src/global/index.js", () => ({
  Global: {
    Path: {
      config: mockConfigPath,
      home: os.homedir(),
    },
  },
}))

import { InitCommand } from "../../src/cli/cmd/init"

describe("init command", () => {
  let testDir: string
  let originalCwd: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `sleepy-init-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    originalCwd = process.cwd()
    process.chdir(testDir)
  })

  afterEach(async () => {
    process.chdir(originalCwd)
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch {}
  })

  test("InitCommand has correct command name", () => {
    expect(InitCommand.command).toBe("init")
  })

  test("InitCommand has describe", () => {
    expect(InitCommand.describe).toBeDefined()
  })

  test("InitCommand has handler function", () => {
    expect(typeof InitCommand.handler).toBe("function")
  })

  test("handler creates sleepy.json with default config", async () => {
    await InitCommand.handler!({} as any)

    const sleepyJsonPath = path.join(testDir, "sleepy.json")
    const content = await fs.readFile(sleepyJsonPath, "utf-8")
    const config = JSON.parse(content)

    expect(config).toHaveProperty("$schema")
    expect(config).toHaveProperty("model")
    expect(config).toHaveProperty("small_model")
    expect(config).toHaveProperty("mcp")
    expect(config.mcp).toHaveProperty("supabase")
    expect(config.mcp).toHaveProperty("websearch")
  })

  test("handler creates AGENTS.md with workflow guidelines", async () => {
    await InitCommand.handler!({} as any)

    const agentsMdPath = path.join(testDir, "AGENTS.md")
    const content = await fs.readFile(agentsMdPath, "utf-8")

    expect(content).toContain("Test-Driven Development")
    expect(content).toContain("Commit Guidelines")
    expect(content).toContain("Code Quality")
    expect(content).toContain("Testing")
  })

  test("handler creates both files in current directory", async () => {
    await InitCommand.handler!({} as any)

    const sleepyJsonExists = await fs
      .stat(path.join(testDir, "sleepy.json"))
      .then(() => true)
      .catch(() => false)
    const agentsMdExists = await fs
      .stat(path.join(testDir, "AGENTS.md"))
      .then(() => true)
      .catch(() => false)

    expect(sleepyJsonExists).toBe(true)
    expect(agentsMdExists).toBe(true)
  })

  test("sleepy.json contains valid JSON", async () => {
    await InitCommand.handler!({} as any)

    const content = await fs.readFile(path.join(testDir, "sleepy.json"), "utf-8")
    expect(() => JSON.parse(content)).not.toThrow()
  })

  test("sleepy.json has correct schema reference", async () => {
    await InitCommand.handler!({} as any)

    const content = await fs.readFile(path.join(testDir, "sleepy.json"), "utf-8")
    const config = JSON.parse(content)
    expect(config.$schema).toBe("https://opencode.ai/config.json")
  })

  test("sleepy.json includes supabase MCP template", async () => {
    await InitCommand.handler!({} as any)

    const content = await fs.readFile(path.join(testDir, "sleepy.json"), "utf-8")
    const config = JSON.parse(content)
    expect(config.mcp.supabase.type).toBe("remote")
    expect(config.mcp.supabase.url).toBe("https://mcp.supabase.com/sse")
  })

  test("sleepy.json includes websearch MCP template", async () => {
    await InitCommand.handler!({} as any)

    const content = await fs.readFile(path.join(testDir, "sleepy.json"), "utf-8")
    const config = JSON.parse(content)
    expect(config.mcp.websearch.type).toBe("local")
    expect(config.mcp.websearch.command).toBe("npx")
  })

  test("handler overwrites existing files with defaults", async () => {
    // Pre-create sleepy.json with custom content
    const customConfig = { custom: true }
    await fs.writeFile(path.join(testDir, "sleepy.json"), JSON.stringify(customConfig), "utf-8")

    await InitCommand.handler!({} as any)

    const content = await fs.readFile(path.join(testDir, "sleepy.json"), "utf-8")
    const config = JSON.parse(content)
    expect(config).toHaveProperty("$schema")
    expect(config).toHaveProperty("model")
    expect(config).not.toHaveProperty("custom")
  })
})
