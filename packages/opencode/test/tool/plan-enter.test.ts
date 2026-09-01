import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Instance } from "../../src/project/instance"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { ToolRegistry } from "../../src/tool"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, CrossSpawnSpawner.defaultLayer))

afterEach(async () => {
  await Instance.disposeAll()
})

// The fork intentionally registers plan_enter via plan-enter.txt (a fork feature).
// Upstream removed it; this test verifies the fork preserves it.
describe("plan_enter registration", () => {
  it.live("plan_enter is registered alongside plan_exit", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const ids = yield* (yield* ToolRegistry.Service).ids()
        expect(ids).toContain("plan_enter")
        expect(ids).toContain("plan_exit")
      }),
    ),
  )
})
