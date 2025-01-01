import path from "path"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"

const APP = "sleepy"

export type ResolvedPaths = {
  mode: "sleepy_home" | "xdg"
  root?: string
  data: string
  cache: string
  config: string
  state: string
}

/**
 * Resolve sleepy's four base directories (config/data/state/cache)
 * from environment variables.
 *
 * If SLEEPY_HOME is set and non-empty, the four paths are subdirectories
 * of it. Otherwise, falls through to XDG Base Directory defaults.
 *
 * @throws if SLEEPY_HOME is set but not an absolute path
 */
export function resolveSleepyHome(env: NodeJS.ProcessEnv = process.env): ResolvedPaths {
  const home = env.SLEEPY_HOME
  if (home) {
    if (!path.isAbsolute(home)) {
      throw new Error(
        `SLEEPY_HOME must be an absolute path, got: ${JSON.stringify(home)}`,
      )
    }
    return {
      mode: "sleepy_home",
      root: home,
      data: path.join(home, "data"),
      cache: path.join(home, "cache"),
      config: path.join(home, "config"),
      state: path.join(home, "state"),
    }
  }
  const dataHome = env.XDG_DATA_HOME || (os.homedir() ? path.join(os.homedir(), ".local", "share") : os.tmpdir())
  const cacheHome = env.XDG_CACHE_HOME || (os.homedir() ? path.join(os.homedir(), ".cache") : os.tmpdir())
  const configHome = env.XDG_CONFIG_HOME || (os.homedir() ? path.join(os.homedir(), ".config") : os.tmpdir())
  const stateHome = env.XDG_STATE_HOME || (os.homedir() ? path.join(os.homedir(), ".local", "state") : os.tmpdir())

  return {
    mode: "xdg",
    data: path.join(dataHome, APP),
    cache: path.join(cacheHome, APP),
    config: path.join(configHome, APP),
    state: path.join(stateHome, APP),
  }
}

export namespace Global {
  export class Service extends Context.Service<Service, Interface>()("@opencode/Global") {}

  export interface Interface {
    readonly home: string
    readonly data: string
    readonly cache: string
    readonly config: string
    readonly state: string
    readonly bin: string
    readonly log: string
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const home = process.env.HOME || process.env.USERPROFILE || os.homedir()
      const { data, cache, config, state } = yield* Effect.sync(() => resolveSleepyHome())
      const bin = path.join(cache, "bin")
      const log = path.join(data, "log")

      return Service.of({
        home,
        data,
        cache,
        config,
        state,
        bin,
        log,
      })
    }),
  )
}
