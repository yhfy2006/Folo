import { defineCommand } from "citty"

import { loadChannelByGroupId } from "../../main/pipeline/channel-loader"
import {
  getSchedulerStatus,
  startPipelineScheduler,
  stopPipelineScheduler,
} from "../../main/pipeline-scheduler"
import { loadPreferences, savePreferences } from "../../main/preferences"
import { registerBroadcastListener } from "../../main/runtime/broadcast"
import { runChannelPipeline } from "../../main/services/pipeline"
import { fail, printJson } from "../lib/output"
import { initRuntime } from "../lib/runtime"

const statusCmd = defineCommand({
  meta: { name: "status", description: "Show whether a scheduled run is configured" },
  args: {
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const status = getSchedulerStatus()
    if (args.json) {
      printJson(status)
      return
    }
    if (!status.enabled) {
      console.info("[schedule] disabled")
      return
    }
    console.info(`[schedule] enabled — ${status.schedule}`)
    if (status.nextRun) console.info(`[schedule] next run: ${status.nextRun}`)
    if (status.lastRunDate) console.info(`[schedule] last run date: ${status.lastRunDate}`)
  },
})

const enableCmd = defineCommand({
  meta: { name: "enable", description: "Set daily pipeline run time (HH:mm)" },
  args: {
    time: { type: "positional", required: true, description: "Time like 07:00" },
  },
  async run({ args }) {
    await initRuntime()
    if (!/^\d{2}:\d{2}$/.test(args.time)) fail("time must be HH:mm")
    const prefs = loadPreferences()
    prefs.pipelineSchedule = args.time
    savePreferences(prefs)
    console.info(`[schedule] set daily run to ${args.time}`)
    console.info(
      "[schedule] tip: run `sr schedule run-daemon` in a long-lived process to trigger it",
    )
  },
})

const disableCmd = defineCommand({
  meta: { name: "disable", description: "Disable the daily pipeline schedule" },
  async run() {
    await initRuntime()
    const prefs = loadPreferences()
    prefs.pipelineSchedule = ""
    savePreferences(prefs)
    console.info("[schedule] disabled")
  },
})

const daemonCmd = defineCommand({
  meta: {
    name: "run-daemon",
    description: "Run a foreground process that fires the scheduled pipeline",
  },
  args: {
    verbose: { type: "boolean", alias: "v", description: "Stream stage logs to stdout" },
  },
  async run({ args }) {
    await initRuntime({ verbose: Boolean(args.verbose) })
    const status = getSchedulerStatus()
    if (!status.enabled) {
      fail("no schedule configured. Run `sr schedule enable HH:mm` first.")
    }

    console.info(`[schedule] daemon started — schedule ${status.schedule}`)
    if (status.nextRun) console.info(`[schedule] next run: ${status.nextRun}`)

    const unregister = registerBroadcastListener((event, ...eventArgs) => {
      if (event !== "pipeline-auto-trigger") return
      const groupId = eventArgs[0] as string | null
      const channel = groupId ? loadChannelByGroupId(groupId) : null
      if (!channel) {
        console.warn(
          `[schedule] trigger received but no channel matches groupId=${groupId ?? "(global)"}`,
        )
        return
      }
      console.info(`[schedule] running pipeline for channel ${channel.id}`)
      runChannelPipeline(channel.id, { verbose: Boolean(args.verbose) })
        .then((result) => console.info(`[schedule] run done:`, result))
        .catch((err: Error) => console.error(`[schedule] run failed:`, err.message))
    })

    startPipelineScheduler()

    const shutdown = () => {
      console.info("[schedule] stopping…")
      unregister()
      stopPipelineScheduler()
      // eslint-disable-next-line unicorn/no-process-exit -- CLI daemon shutdown
      process.exit(0)
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)

    // Keep the event loop alive forever.
    await new Promise(() => {})
  },
})

export const scheduleCommand = defineCommand({
  meta: { name: "schedule", description: "Control the daily pipeline scheduler" },
  subCommands: {
    status: statusCmd,
    enable: enableCmd,
    disable: disableCmd,
    "run-daemon": daemonCmd,
  },
})
