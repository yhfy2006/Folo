import { exec } from "node:child_process"
import fs from "node:fs"
import os from "node:os"

import { defineCommand } from "citty"
import path from "pathe"

import { queryAll } from "../../main/database"
import { fail, printJson, printTable } from "../lib/output"
import { initRuntime } from "../lib/runtime"

interface VideoUploadRow {
  id: string
  video_id: string
  type: string
  title: string | null
  date: string
  group_id: string | null
  created_at: number
}

function findLocalShorts(date: string): string[] {
  const workDir = path.join(os.tmpdir(), `signalist-${date}`)
  if (!fs.existsSync(workDir)) return []
  return fs
    .readdirSync(workDir)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => path.join(workDir, f))
}

const listCmd = defineCommand({
  meta: { name: "list", description: "List published outputs from DB + /tmp render dirs" },
  args: {
    channel: { type: "string", description: "Filter by channel/group id" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const uploads = queryAll<VideoUploadRow>(
      "SELECT * FROM video_uploads ORDER BY created_at DESC LIMIT 50",
    )
    const filtered = args.channel ? uploads.filter((u) => u.group_id === args.channel) : uploads

    if (args.json) {
      printJson(filtered)
      return
    }
    if (filtered.length === 0) {
      console.info("(no uploads recorded)")
      return
    }
    printTable(
      filtered.map((u) => ({
        videoId: u.video_id,
        type: u.type,
        date: u.date,
        title: (u.title ?? "").slice(0, 40),
      })),
      ["videoId", "type", "date", "title"],
    )
  },
})

const openCmd = defineCommand({
  meta: { name: "open", description: "Open an output locally (shells out to `open`)" },
  args: {
    target: {
      type: "positional",
      required: true,
      description: "video id, upload id, or a date like 2026-04-19",
    },
  },
  async run({ args }) {
    await initRuntime()
    const { target } = args

    // 1. Try local shorts render dir keyed by date
    if (/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      const files = findLocalShorts(target)
      if (files.length === 0) fail(`no local shorts found for ${target}`)
      exec(`open "${files[0]}"`)
      console.info(`[output] opened ${files[0]}`)
      return
    }

    // 2. Try DB — youtube video id
    const upload = queryAll<VideoUploadRow>(
      "SELECT * FROM video_uploads WHERE video_id = ? OR id = ? LIMIT 1",
      [target, target],
    )[0]
    if (upload) {
      const url =
        upload.type === "shorts"
          ? `https://www.youtube.com/shorts/${upload.video_id}`
          : `https://www.youtube.com/watch?v=${upload.video_id}`
      exec(`open "${url}"`)
      console.info(`[output] opened ${url}`)
      return
    }

    fail(`no output found for: ${target}`)
  },
})

export const outputCommand = defineCommand({
  meta: { name: "output", description: "Inspect and open generated outputs" },
  subCommands: { list: listCmd, open: openCmd },
})
