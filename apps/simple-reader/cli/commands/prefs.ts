import { defineCommand } from "citty"

import { loadPreferences, savePreferences } from "../../main/preferences"
import { fail, printJson } from "../lib/output"
import { initRuntime } from "../lib/runtime"

const SENSITIVE_KEYS = new Set([
  "minimaxApiKey",
  "githubToken",
  "workerSecret",
  "deepgramApiKey",
  "youtubeClientSecret",
  "youtubeRefreshToken",
])

function redact(prefs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(prefs)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === "string" && value.length > 0) {
      out[key] = `***${value.slice(-4)}`
    } else {
      out[key] = value
    }
  }
  return out
}

const getCmd = defineCommand({
  meta: { name: "get", description: "Read preferences (redacts secrets by default)" },
  args: {
    key: { type: "positional", required: false, description: "Specific key to read" },
    raw: { type: "boolean", description: "Show secrets unredacted" },
    json: { type: "boolean", description: "Emit JSON" },
  },
  async run({ args }) {
    await initRuntime()
    const prefs = loadPreferences() as unknown as Record<string, unknown>
    const view = args.raw ? prefs : redact(prefs)

    if (args.key) {
      const value = view[args.key]
      if (value === undefined) fail(`unknown key: ${args.key}`)
      if (args.json) {
        printJson(value)
        return
      }
      console.info(String(value))
      return
    }

    if (args.json) {
      printJson(view)
      return
    }
    for (const [k, v] of Object.entries(view)) {
      console.info(`${k} = ${typeof v === "object" ? JSON.stringify(v) : v}`)
    }
  },
})

const setCmd = defineCommand({
  meta: { name: "set", description: "Write one preference value" },
  args: {
    key: { type: "positional", required: true, description: "Preference key" },
    value: { type: "positional", required: true, description: "Preference value (string)" },
  },
  async run({ args }) {
    await initRuntime()
    const prefs = loadPreferences() as unknown as Record<string, unknown>
    if (!(args.key in prefs)) fail(`unknown key: ${args.key}`)

    const current = prefs[args.key]
    let next: unknown = args.value

    if (typeof current === "number") next = Number(args.value)
    else if (typeof current === "boolean") next = args.value === "true"
    else if (Array.isArray(current)) {
      try {
        next = JSON.parse(args.value)
      } catch {
        fail(`value must be JSON array for key: ${args.key}`)
      }
    }

    prefs[args.key] = next
    savePreferences(prefs as never)
    console.info(`[prefs] set ${args.key}`)
  },
})

export const prefsCommand = defineCommand({
  meta: { name: "prefs", description: "Read/write user preferences" },
  subCommands: { get: getCmd, set: setCmd },
})
