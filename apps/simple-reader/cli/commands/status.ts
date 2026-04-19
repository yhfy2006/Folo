import { defineCommand } from "citty"

import { listChannels } from "../../main/services/channels"
import { getChannelStatus } from "../../main/services/status"
import { fail, printJson } from "../lib/output"
import { initRuntime } from "../lib/runtime"

export const statusCommand = defineCommand({
  meta: { name: "status", description: "Show recent run state for one or all channels" },
  args: {
    channel: { type: "string", description: "Channel id (defaults to all)" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const channels = args.channel ? [args.channel] : listChannels().map((c) => c.id)
    if (channels.length === 0) fail("no channels configured")

    const rows = channels.map((id) => getChannelStatus(id))

    if (args.json) {
      printJson(rows)
      return
    }

    for (const row of rows) {
      console.info(`# ${row.name} (${row.channelId})`)
      console.info(`  type:      ${row.pipelineType}`)
      console.info(`  groupId:   ${row.groupId || "(unbound)"}`)
      console.info(`  processed: ${row.processedCount} videos`)
      if (row.processedVideos.length > 0) {
        const preview = row.processedVideos.slice(0, 5)
        for (const v of preview) console.info(`    ✓ ${v.videoId} (${v.date})`)
        if (row.processedVideos.length > preview.length) {
          console.info(`    … and ${row.processedVideos.length - preview.length} more`)
        }
      }
      if (row.scheduler.enabled) {
        console.info(`  schedule:  ${row.scheduler.schedule} (next ${row.scheduler.nextRun})`)
      } else {
        console.info(`  schedule:  (disabled)`)
      }
      console.info()
    }
  },
})
