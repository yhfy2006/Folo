import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

export interface UserPreferences {
  language: string
  interests: string[]
  reportStyle: "concise" | "detailed"
  timeRange: number // hours
  minimaxApiKey: string
  ttsVoiceId: string
  ttsModel: string
  githubToken: string
  githubOwner: string
  pipelineSchedule: string // HH:mm format, empty = disabled
  workerUrl: string
  workerSecret: string
}

const DEFAULT_PREFERENCES: UserPreferences = {
  language: "en",
  interests: [],
  reportStyle: "detailed",
  timeRange: 24,
  minimaxApiKey: "",
  ttsVoiceId: "English_Graceful_Lady",
  ttsModel: "speech-2.8-hd",
  githubToken: "",
  githubOwner: "",
  pipelineSchedule: "",
  workerUrl: "",
  workerSecret: "",
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
