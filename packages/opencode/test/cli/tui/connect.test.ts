import { describe, expect, test } from "bun:test"
import { connectDialog } from "../../../src/cli/cmd/tui/util/connect"

describe("connectDialog", () => {
  test("opens Sleepy login when the gateway is not logged in", () => {
    expect(connectDialog(false)).toBe("login")
  })

  test("opens the provider picker when the gateway is already logged in", () => {
    expect(connectDialog(true)).toBe("providers")
  })
})
