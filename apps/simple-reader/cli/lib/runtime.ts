import { fileURLToPath } from "node:url"

import path from "pathe"

import { initDatabase } from "../../main/database"
import { initChannels } from "../../main/pipeline/channel-init"
import { registerBroadcastListener } from "../../main/runtime/broadcast"
import { setAppPath, setIsPackaged } from "../../main/runtime/paths"
import { initWorkspace } from "../../main/workspace"

let initialized = false

/**
 * Bootstrap the shared main/ modules for CLI use. Must be called before any
 * command touches the database, prefs, or channels.
 */
export async function initRuntime(options?: { verbose?: boolean }): Promise<void> {
  if (initialized) return
  initialized = true

  // Resolve the simple-reader app root: cli/lib/runtime.ts lives at
  // `<app>/cli/lib/runtime.ts`, so going up two dirs from __dirname gives us
  // the app root (where package.json + workspace/ live).
  const here = path.dirname(fileURLToPath(import.meta.url))
  const appRoot = path.resolve(here, "..", "..")
  setAppPath(appRoot)
  setIsPackaged(false)

  if (options?.verbose) {
    registerBroadcastListener((event, ...args) => {
      console.info(`[broadcast] ${event}`, ...args)
    })
  }

  await initDatabase()
  initWorkspace()
  initChannels()
}
