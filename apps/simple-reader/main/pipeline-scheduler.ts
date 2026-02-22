import { BrowserWindow } from "electron"

import { loadPreferences } from "./preferences"

let timerId: ReturnType<typeof setTimeout> | null = null
let lastRunDate: string | null = null

/**
 * Start (or restart) the pipeline scheduler.
 * Calculates the ms until the next scheduled time and sets a timeout.
 * Should be called on app start and whenever preferences change.
 */
export function startPipelineScheduler(): void {
  stopPipelineScheduler()

  const prefs = loadPreferences()
  const schedule = prefs.pipelineSchedule?.trim()
  if (!schedule || !/^\d{2}:\d{2}$/.test(schedule)) {
    console.info("[pipeline-scheduler] No schedule configured, idle")
    return
  }

  scheduleNext(schedule)
}

export function stopPipelineScheduler(): void {
  if (timerId) {
    clearTimeout(timerId)
    timerId = null
  }
}

export function getSchedulerStatus(): {
  enabled: boolean
  schedule: string
  nextRun: string | null
  lastRunDate: string | null
} {
  const prefs = loadPreferences()
  const schedule = prefs.pipelineSchedule?.trim() || ""
  const enabled = /^\d{2}:\d{2}$/.test(schedule)

  let nextRun: string | null = null
  if (enabled) {
    const ms = msUntilNext(schedule)
    const nextDate = new Date(Date.now() + ms)
    nextRun = nextDate.toISOString()
  }

  return { enabled, schedule, nextRun, lastRunDate }
}

function scheduleNext(schedule: string): void {
  const ms = msUntilNext(schedule)
  const nextDate = new Date(Date.now() + ms)
  console.info(
    `[pipeline-scheduler] Next run at ${nextDate.toLocaleString()} (in ${Math.round(ms / 60000)} min)`,
  )

  timerId = setTimeout(() => {
    timerId = null
    triggerPipeline(schedule)
  }, ms)
}

function msUntilNext(schedule: string): number {
  const [hours, minutes] = schedule.split(":").map(Number)
  const now = new Date()
  const target = new Date(now)
  target.setHours(hours!, minutes!, 0, 0)

  // If target time already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

async function triggerPipeline(schedule: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // Prevent duplicate runs on the same day
  if (lastRunDate === today) {
    console.info("[pipeline-scheduler] Already ran today, skipping")
    scheduleNext(schedule)
    return
  }

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.warn("[pipeline-scheduler] No window available, skipping")
    scheduleNext(schedule)
    return
  }

  console.info("[pipeline-scheduler] Triggering pipeline...")
  lastRunDate = today

  // Notify renderer to start the pipeline (same as clicking the button)
  win.webContents.send("pipeline-auto-trigger")

  // Schedule next run
  scheduleNext(schedule)
}
