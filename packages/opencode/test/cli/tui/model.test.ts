import { describe, expect, test } from "bun:test"
import type { Provider } from "@sleepy-ai/sdk/v2"
import { initial, pinnedSleepyModels } from "../../../src/cli/cmd/tui/util/model"

const providers = [
  {
    id: "openai",
    models: {
      "gpt-5.6-sol": {},
    },
  },
  {
    id: "ppio",
    models: {
      "deepseek-v3": {},
    },
  },
] as unknown as Provider[]

describe("initial model", () => {
  test("restores the most recent model before the configured default", () => {
    expect(
      initial(providers, {
        ready: true,
        recent: [{ providerID: "openai", modelID: "gpt-5.6-sol" }],
        configured: "ppio/deepseek-v3",
      }),
    ).toEqual({ providerID: "openai", modelID: "gpt-5.6-sol" })
  })

  test("keeps an explicit model argument highest priority", () => {
    expect(
      initial(providers, {
        argument: "ppio/deepseek-v3",
        ready: false,
        recent: [{ providerID: "openai", modelID: "gpt-5.6-sol" }],
        configured: "openai/gpt-5.6-sol",
      }),
    ).toEqual({ providerID: "ppio", modelID: "deepseek-v3" })
  })

  test("skips unavailable recent models", () => {
    expect(
      initial(providers, {
        ready: true,
        recent: [{ providerID: "openai", modelID: "removed-model" }],
        configured: "ppio/deepseek-v3",
      }),
    ).toEqual({ providerID: "ppio", modelID: "deepseek-v3" })
  })

  test("waits for recent state before using the configured default", () => {
    expect(
      initial(providers, {
        ready: false,
        recent: [],
        configured: "ppio/deepseek-v3",
      }),
    ).toBeUndefined()
  })
})

describe("pinnedSleepyModels", () => {
  const gatewayProvider = (models: Record<string, { status?: string }>) =>
    ({
      id: "sleepy",
      models,
    }) as unknown as Provider

  test("pins sleepy-auto alone when the gateway publishes the alias", () => {
    expect(
      pinnedSleepyModels(
        gatewayProvider({
          "sleepy-auto": { status: "active" },
          "mimo-2.5-pro": { status: "active" },
        }),
      ),
    ).toEqual([{ providerID: "sleepy", modelID: "sleepy-auto" }])
  })

  test("pins ALL sleepy models when the sleepy-auto alias is absent (regression: empty picker)", () => {
    // The Sleepy gateway's model list is dynamic (dashboard API) and contains
    // ids like "auto:free" — no "sleepy-auto". Pinning only the absent alias
    // while the regular list excludes the sleepy provider left the picker with
    // zero sleepy models (v0.1.18 regression).
    expect(
      pinnedSleepyModels(
        gatewayProvider({
          "auto:free": { status: "active" },
          "auto:cheap": { status: "active" },
          "mimo-2.5-pro": { status: "active" },
        }),
      ),
    ).toEqual([
      { providerID: "sleepy", modelID: "auto:free" },
      { providerID: "sleepy", modelID: "auto:cheap" },
      { providerID: "sleepy", modelID: "mimo-2.5-pro" },
    ])
  })

  test("falls back to all models when sleepy-auto is deprecated", () => {
    expect(
      pinnedSleepyModels(
        gatewayProvider({
          "sleepy-auto": { status: "deprecated" },
          "auto:free": { status: "active" },
        }),
      ),
    ).toEqual([{ providerID: "sleepy", modelID: "auto:free" }])
  })

  test("skips deprecated models in the fallback list", () => {
    expect(
      pinnedSleepyModels(
        gatewayProvider({
          "auto:free": { status: "active" },
          "old-model": { status: "deprecated" },
        }),
      ),
    ).toEqual([{ providerID: "sleepy", modelID: "auto:free" }])
  })

  test("returns empty for a missing provider or empty model list", () => {
    expect(pinnedSleepyModels(undefined)).toEqual([])
    expect(pinnedSleepyModels(gatewayProvider({}))).toEqual([])
  })
})
