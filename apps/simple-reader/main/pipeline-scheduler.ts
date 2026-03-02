import { BrowserWindow } from "electron"

import type { FeedGroup } from "./database"
import { queryAll } from "./database"
import { loadPreferences } from "./preferences"

// Track timers: groupId -> timerId (null key = global)
const timers = new Map<string | null, ReturnType<typeof setTimeout>>()
const lastRunDates = new Map<string | null, string>()

/**
 * Start (or restart) the pipeline scheduler.
 * Manages independent timers for the global schedule and per-group schedules.
 * Should be called on app start and whenever preferences change.
 */
export function startPipelineScheduler(): void {
  // Clear all existing timers
  for (const [, timerId] of timers) {
    clearTimeout(timerId)
  }
  timers.clear()

  // Schedule global pipeline
  const prefs = loadPreferences()
  const schedule = prefs.pipelineSchedule?.trim()
  if (schedule && /^\d{2}:\d{2}$/.test(schedule)) {
    scheduleNext(schedule, null)
  } else {
    console.info("[pipeline-scheduler] No global schedule configured, idle")
  }

  // Schedule per-group pipelines
  const groups = queryAll<FeedGroup>(
    `SELECT * FROM feed_groups WHERE pipeline_schedule IS NOT NULL`,
  )
  for (const group of groups) {
    if (group.pipeline_schedule && /^\d{2}:\d{2}$/.test(group.pipeline_schedule)) {
      scheduleNext(group.pipeline_schedule, group.id)
    }
  }
}

export function stopPipelineScheduler(): void {
  for (const [, timerId] of timers) {
    clearTimeout(timerId)
  }
  timers.clear()
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

  return { enabled, schedule, nextRun, lastRunDate: lastRunDates.get(null) || null }
}

function scheduleNext(schedule: string, groupId: string | null): void {
  const ms = msUntilNext(schedule)
  const nextDate = new Date(Date.now() + ms)
  const label = groupId ? `group:${groupId}` : "global"
  console.info(
    `[pipeline-scheduler] ${label} next run at ${nextDate.toLocaleString()} (in ${Math.round(ms / 60000)} min)`,
  )

  const timerId = setTimeout(() => {
    timers.delete(groupId)
    triggerPipeline(schedule, groupId)
  }, ms)
  timers.set(groupId, timerId)
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

async function triggerPipeline(schedule: string, groupId: string | null): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  // Prevent duplicate runs on the same day
  if (lastRunDates.get(groupId) === today) {
    const label = groupId ? `group:${groupId}` : "global"
    console.info(`[pipeline-scheduler] ${label} already ran today, skipping`)
    scheduleNext(schedule, groupId)
    return
  }

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    console.warn("[pipeline-scheduler] No window available, skipping")
    scheduleNext(schedule, groupId)
    return
  }

  const label = groupId ? `group:${groupId}` : "global"
  console.info(`[pipeline-scheduler] Triggering pipeline for ${label}...`)
  lastRunDates.set(groupId, today)

  // Notify renderer to start the pipeline with optional groupId
  win.webContents.send("pipeline-auto-trigger", groupId)

  // Schedule next run
  scheduleNext(schedule, groupId)
}
