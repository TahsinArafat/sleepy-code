import { describe, expect, test } from "bun:test"
import path from "path"
import { resolveSleepyHome } from "@sleepy-ai/shared/global"

describe("resolveSleepyHome", () => {
  test("with SLEEPY_HOME set, resolves 4 subdirs under root", () => {
    const result = resolveSleepyHome({
      SLEEPY_HOME: "/tmp/profile-a",
    })
    expect(result.mode).toBe("sleepy_home")
    expect(result.root).toBe("/tmp/profile-a")
    expect(result.config).toBe(path.join("/tmp/profile-a", "config"))
    expect(result.data).toBe(path.join("/tmp/profile-a", "data"))
    expect(result.state).toBe(path.join("/tmp/profile-a", "state"))
    expect(result.cache).toBe(path.join("/tmp/profile-a", "cache"))
  })

  test("without SLEEPY_HOME, falls through to xdg mode", () => {
    const result = resolveSleepyHome({})
    expect(result.mode).toBe("xdg")
    expect(result.root).toBeUndefined()
    // xdg paths end with "/sleepycode"
    expect(result.config.endsWith(path.join("", "sleepycode"))).toBe(true)
    expect(result.data.endsWith(path.join("", "sleepycode"))).toBe(true)
    expect(result.state.endsWith(path.join("", "sleepycode"))).toBe(true)
    expect(result.cache.endsWith(path.join("", "sleepycode"))).toBe(true)
  })

  test("empty SLEEPY_HOME string is treated as unset (xdg mode)", () => {
    const result = resolveSleepyHome({ SLEEPY_HOME: "" })
    expect(result.mode).toBe("xdg")
  })

  test("relative SLEEPY_HOME path throws with clear error", () => {
    expect(() => resolveSleepyHome({ SLEEPY_HOME: "./foo" })).toThrow(
      /SLEEPY_HOME must be an absolute path/,
    )
    expect(() => resolveSleepyHome({ SLEEPY_HOME: "foo/bar" })).toThrow(
      /SLEEPY_HOME must be an absolute path/,
    )
  })

  test("tilde-prefixed SLEEPY_HOME throws (not treated as absolute)", () => {
    expect(() => resolveSleepyHome({ SLEEPY_HOME: "~/profiles/a" })).toThrow(
      /SLEEPY_HOME must be an absolute path/,
    )
  })

  test("error message includes the offending value", () => {
    expect(() => resolveSleepyHome({ SLEEPY_HOME: "./relative" })).toThrow(
      /\.\/relative/,
    )
  })
})
