import os from "node:os"

import path from "pathe"

const APP_NAME = "simple-reader"

let overrideUserDataPath: string | null = null
let overrideAppPath: string | null = null
let overrideIsPackaged: boolean | null = null

/**
 * Electron (main/index.ts) calls this during whenReady so the DB/prefs/channels
 * land in the exact folder Electron would have used. CLI bootstrap leaves it
 * unset and relies on the platform-default fallback below.
 */
export function setUserDataPath(p: string): void {
  overrideUserDataPath = p
}

export function setAppPath(p: string): void {
  overrideAppPath = p
}

export function setIsPackaged(value: boolean): void {
  overrideIsPackaged = value
}

/**
 * Default matches Electron's `app.getPath("userData")` for an app named
 * `simple-reader`, so CLI and GUI share one DB during Phase 1 coexistence.
 */
export function getUserDataPath(): string {
  if (overrideUserDataPath) return overrideUserDataPath

  const home = os.homedir()
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_NAME)
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming")
    return path.join(appData, APP_NAME)
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
  return path.join(xdg, APP_NAME)
}

/**
 * The root of the simple-reader app (where `package.json` lives). Electron
 * sets this via `app.getAppPath()`; CLI bootstrap sets it from its own entry.
 */
export function getAppPath(): string {
  if (overrideAppPath) return overrideAppPath
  // Sensible last-resort: current working directory. Only hit if a consumer
  // imports this module before any bootstrap ran.
  return process.cwd()
}

export function isPackaged(): boolean {
  return overrideIsPackaged ?? false
}
