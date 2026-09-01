import { describe, expect, mock, test } from "bun:test"
import { createRoot, type Accessor } from "solid-js"
import {
  FREE_API_SUNSET_AT,
  createFreeApiSunsetSignal,
  freeApiModelNameKey,
  isFreeApiModel,
  isFreeApiSunset,
  shouldBlockFreeApiRequest,
} from "../../../../src/cli/cmd/tui/util/free-api-sunset"

describe("free API sunset", () => {
  test("uses the exact UTC threshold", () => {
    expect(FREE_API_SUNSET_AT).toBe(Date.parse("2026-07-26T10:00:00.000Z"))
  })

  test("starts exactly at the configured UTC threshold", () => {
    expect(isFreeApiSunset(FREE_API_SUNSET_AT - 1)).toBe(false)
    expect(isFreeApiSunset(FREE_API_SUNSET_AT)).toBe(true)
    expect(isFreeApiSunset(FREE_API_SUNSET_AT + 1)).toBe(true)
  })

  test("only identifies the anonymous Sleepy free channel", () => {
    expect(isFreeApiModel({ providerID: "sleepy", modelID: "sleepy-auto" })).toBe(true)
    expect(isFreeApiModel({ providerID: "xiaomi", modelID: "sleepy-auto" })).toBe(false)
    expect(isFreeApiModel({ providerID: "third-party", modelID: "sleepy-auto" })).toBe(false)
    expect(isFreeApiModel({ providerID: "sleepy", modelID: "sleepy-free" })).toBe(false)
  })

  test("blocks model-backed requests after sunset", () => {
    const model = { providerID: "sleepy", modelID: "sleepy-auto" }
    expect(shouldBlockFreeApiRequest(model, { sunset: false })).toBe(false)
    expect(shouldBlockFreeApiRequest(model, { sunset: true })).toBe(true)
    expect(shouldBlockFreeApiRequest(model, { sunset: true, localOnly: true })).toBe(false)
    expect(shouldBlockFreeApiRequest(model, { sunset: true, shell: true })).toBe(false)
    expect(shouldBlockFreeApiRequest({ providerID: "xiaomi", modelID: "sleepy-auto" }, { sunset: true })).toBe(false)
  })

  test("switches the model display key at sunset", () => {
    expect(freeApiModelNameKey(false)).toBe("tui.model.sleepy_auto.name")
    expect(freeApiModelNameKey(true)).toBe("tui.model.sleepy_auto.sunset_name")
  })

  test("schedules one reactive switch before the threshold", () => {
    const clear = mock(() => {})
    let callback = () => {}
    let sunset!: Accessor<boolean>
    let dispose = () => {}
    const timer = {
      set(fn: () => void, delay: number) {
        callback = fn
        expect(delay).toBe(1)
        return 1 as unknown as ReturnType<typeof setTimeout>
      },
      clear,
    }

    createRoot((rootDispose) => {
      dispose = rootDispose
      sunset = createFreeApiSunsetSignal(FREE_API_SUNSET_AT - 1, timer)
    })

    expect(sunset()).toBe(false)
    callback()
    expect(sunset()).toBe(true)
    dispose()
    expect(clear).toHaveBeenCalledTimes(1)
  })

  test("is immediately true after the threshold without scheduling", () => {
    const set = mock(() => 1 as unknown as ReturnType<typeof setTimeout>)
    let sunset!: Accessor<boolean>

    createRoot((dispose) => {
      sunset = createFreeApiSunsetSignal(FREE_API_SUNSET_AT, { set, clear: () => {} })
      dispose()
    })

    expect(sunset()).toBe(true)
    expect(set).not.toHaveBeenCalled()
  })

  test("cancels the pending switch on cleanup", () => {
    const clear = mock(() => {})
    const handle = 1 as unknown as ReturnType<typeof setTimeout>
    let dispose = () => {}

    createRoot((rootDispose) => {
      dispose = rootDispose
      createFreeApiSunsetSignal(FREE_API_SUNSET_AT - 1, { set: () => handle, clear })
    })
    dispose()

    expect(clear).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledWith(handle)
  })
})
