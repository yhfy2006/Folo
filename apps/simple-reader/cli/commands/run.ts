import { defineCommand } from "citty"

import { runChannelPipeline } from "../../main/services/pipeline"
import { fail, printJson } from "../lib/output"
import { initRuntime } from "../lib/runtime"

export const runCommand = defineCommand({
  meta: { name: "run", description: "Run a channel's pipeline end-to-end" },
  args: {
    channel: { type: "string", required: true, description: "Channel id to run" },
    "dry-run": { type: "boolean", description: "Skip upload/publish stages" },
    verbose: { type: "boolean", alias: "v", description: "Stream stage logs to stdout" },
    json: { type: "boolean", description: "Emit result as JSON" },
  },
  async run({ args }) {
    await initRuntime({ verbose: Boolean(args.verbose) })
    try {
      const result = await runChannelPipeline(args.channel, {
        dryRun: Boolean(args["dry-run"]),
        verbose: Boolean(args.verbose),
      })
      if (args.json) {
        printJson(result)
        return
      }
      console.info(`[run] done — date=${result.date}`)
      if (result.pageUrl) console.info(`[run] pageUrl=${result.pageUrl}`)
      if (result.youtubeUrl) console.info(`[run] youtubeUrl=${result.youtubeUrl}`)
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err))
    }
  },
})
