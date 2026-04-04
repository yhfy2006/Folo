/**
 * Standalone CLI runner for the Shorts pipeline stage.
 * Runs outside Electron by registering a loader hook to mock `electron`.
 *
 * Usage:
 *   cd apps/simple-reader
 *   npx tsx scripts/run-shorts.ts
 */

import fs from "node:fs"
import { register } from "node:module"
import os from "node:os"
import { pathToFileURL } from "node:url"

import path from "pathe"

// Register the electron mock loader BEFORE any dynamic imports
register(
  pathToFileURL(path.resolve(import.meta.dirname!, "electron-loader.mjs")).href,
  import.meta.url,
)

// ---- Load report from SQLite directly (bypass Electron IPC) ----

const dbPath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "simple-reader",
  "simple-reader.db",
)

if (!fs.existsSync(dbPath)) {
  throw new Error(`Database not found: ${dbPath}`)
}

const SQL = (await import("sql.js")).default
const initSql = await SQL()
const buffer = fs.readFileSync(dbPath)
const db = new initSql.Database(buffer)

// Use --date=YYYY-MM-DD or fall back to today, then try the latest report
const dateArg = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1]
let date = dateArg || new Date().toISOString().slice(0, 10)

let reportRow = db.exec(
  `SELECT content, title FROM reports WHERE type = 'report' AND title LIKE '%${date}%' ORDER BY created_at DESC LIMIT 1`,
)
// Fall back to most recent report if none found for the date
if (reportRow.length === 0 || reportRow[0]!.values.length === 0) {
  console.info(`No report for ${date}, trying latest...`)
  reportRow = db.exec(
    `SELECT content, title FROM reports WHERE type = 'report' ORDER BY created_at DESC LIMIT 1`,
  )
  if (reportRow.length === 0 || reportRow[0]!.values.length === 0) {
    throw new Error("No reports found in database")
  }
  // Extract date from title (e.g. "Morning Report - 2026-04-03")
  const titleStr = reportRow[0]!.values[0]![1] as string
  const m = titleStr.match(/(\d{4}-\d{2}-\d{2})/)
  if (m) date = m[1]!
}
const reportContent = reportRow[0]!.values[0]![0] as string
console.info(`\n[runner] Loaded report for ${date} (${reportContent.length} chars)\n`)

db.close()

// ---- Import the modular pipeline (loader is now active) ----

const { createContext } = await import("../main/pipeline/context.js")
const { shortsStage } = await import("../main/pipeline/stages/shorts.js")

// ---- Build context ----

const skipUpload = process.argv.includes("--skip-upload")

const ctx = createContext({
  date,
  reportContent,
  pageUrl: `https://daily.yomoo.net/episodes/${date}/index.html`,
  skipUpload,
})

console.info("[runner] shouldRun:", shortsStage.shouldRun(ctx))
console.info("[runner] Starting Shorts stage...\n")

// ---- Run ----

try {
  const result = await shortsStage.run(ctx, {
    onStatus: (status) => console.info(`  [status] ${status}`),
  })

  console.info("\n[runner] Done!")
  console.info("[runner] Shorts URL:", result.shortsUrl)
} catch (err) {
  throw new Error(`Shorts stage failed: ${err}`)
}
