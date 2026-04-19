import { defineCommand } from "citty"

import { getChannel, listChannels } from "../../main/services/channels"
import { fail, printJson, printTable } from "../lib/output"
import { initRuntime } from "../lib/runtime"

const listCmd = defineCommand({
  meta: { name: "list", description: "List all channels" },
  args: {
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const channels = listChannels()
    if (args.json) {
      printJson(channels)
      return
    }
    printTable(
      channels.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.pipelineType ?? "standard",
        language: c.language,
        groupId: c.groupId || "(unbound)",
        stages: c.stages.length,
      })),
      ["id", "name", "type", "language", "groupId", "stages"],
    )
  },
})

const showCmd = defineCommand({
  meta: { name: "show", description: "Show one channel's config" },
  args: {
    id: { type: "positional", required: true, description: "Channel id" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const channel = getChannel(args.id)
    if (!channel) fail(`channel not found: ${args.id}`)
    if (args.json) {
      printJson(channel)
      return
    }
    for (const [key, value] of Object.entries(channel)) {
      console.info(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`)
    }
  },
})

export const channelsCommand = defineCommand({
  meta: { name: "channels", description: "Inspect channel definitions" },
  subCommands: { list: listCmd, show: showCmd },
})
