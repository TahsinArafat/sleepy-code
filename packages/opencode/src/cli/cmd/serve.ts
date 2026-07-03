import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless sleepycode server",
  handler: async (args) => {
    const opts = await resolveNetworkOptions(args)
    const isLoopback = opts.hostname === "127.0.0.1" || opts.hostname === "localhost" || opts.hostname === "::1"

    if (!isLoopback && !Flag.SLEEPYCODE_SERVER_PASSWORD && !opts.noAuth) {
      console.error("ERROR: Binding to non-loopback address without SLEEPYCODE_SERVER_PASSWORD is not allowed.")
      console.error("Set SLEEPYCODE_SERVER_PASSWORD or pass --no-auth to override (DANGEROUS).")
      process.exit(1)
    }

    if (!Flag.SLEEPYCODE_SERVER_PASSWORD) {
      console.log("Warning: SLEEPYCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }

    const server = await Server.listen(opts)
    console.log(`sleepycode server listening on http://${server.hostname}:${server.port}`)

    await new Promise(() => {})
    await server.stop()
  },
})
