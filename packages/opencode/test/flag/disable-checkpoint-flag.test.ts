import { afterEach, describe, expect, test } from "bun:test"
import { Flag } from "../../src/flag/flag"

const original = process.env.SLEEPYCODE_DISABLE_CHECKPOINT

function set(value?: string) {
  if (value === undefined) delete process.env.SLEEPYCODE_DISABLE_CHECKPOINT
  else process.env.SLEEPYCODE_DISABLE_CHECKPOINT = value
}

afterEach(() => set(original))

describe("SLEEPYCODE_DISABLE_CHECKPOINT", () => {
  test("keeps checkpointing enabled by default", () => {
    set(undefined)
    expect(Flag.SLEEPYCODE_DISABLE_CHECKPOINT).toBe(false)
  })

  test("tracks runtime env changes", () => {
    set("true")
    expect(Flag.SLEEPYCODE_DISABLE_CHECKPOINT).toBe(true)
    set("false")
    expect(Flag.SLEEPYCODE_DISABLE_CHECKPOINT).toBe(false)
  })

  test("accepts 1 as the truthy alias", () => {
    set("1")
    expect(Flag.SLEEPYCODE_DISABLE_CHECKPOINT).toBe(true)
    set("0")
    expect(Flag.SLEEPYCODE_DISABLE_CHECKPOINT).toBe(false)
  })
})
