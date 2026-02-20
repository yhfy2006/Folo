import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

export interface UserPreferences {
  language: string
  interests: string[]
  reportStyle: "concise" | "detailed"
  timeRange: number // hours
}

const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  interests: [],
  reportStyle: "detailed",
  timeRange: 24,
}

function getPreferencesPath(): string {
  return path.join(app.getPath("userData"), "simple-reader-preferences.json")
}

export function loadPreferences(): UserPreferences {
  const filePath = getPreferencesPath()
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_PREFERENCES }
  }
  try {
    const data = fs.readFileSync(filePath, "utf-8")
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(prefs: UserPreferences): void {
  const filePath = getPreferencesPath()
  fs.writeFileSync(filePath, JSON.stringify(prefs, null, 2), "utf-8")
}
