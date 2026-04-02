import fs from "node:fs"

import { app } from "electron"
import path from "pathe"
import type { Database as SqlJsDatabase } from "sql.js"
import initSqlJs from "sql.js"

// Types
export interface Feed {
  id: string
  title: string | null
  url: string
  site_url: string | null
  description: string | null
  image: string | null
  category: string | null
  error_at: string | null
  error_message: string | null
  last_fetched_at: string | null
  etag: string | null
  last_modified: string | null
}

export interface Entry {
  id: string
  feed_id: string
  guid: string
  title: string | null
  url: string | null
  content: string | null
  description: string | null
  author: string | null
  published_at: number | null
  inserted_at: number
  read: number
}

export interface FeedGroup {
  id: string
  name: string
  language: string | null
  report_style: string | null
  interests: string | null // JSON array string
  time_range: number | null
  pipeline_schedule: string | null
  created_at: number
}

export interface ReportTopics {
  id: string
  report_id: string
  group_id: string | null
  topics_json: string // JSON string of TopicEntry[]
  digest: string
  created_at: number
}

export interface TopicEntry {
  name: string
  keywords: string[]
  summary: string
}

// Database singleton
let db: SqlJsDatabase | null = null
let dbPath = ""

export async function initDatabase() {
  const SQL = await initSqlJs()
  dbPath = path.join(app.getPath("userData"), "simple-reader.db")

  // Load existing database if it exists
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      title TEXT,
      url TEXT NOT NULL UNIQUE,
      site_url TEXT,
      description TEXT,
      image TEXT,
      category TEXT,
      error_at TEXT,
      error_message TEXT,
      last_fetched_at TEXT,
      etag TEXT,
      last_modified TEXT
    );

    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      title TEXT,
      url TEXT,
      content TEXT,
      description TEXT,
      author TEXT,
      published_at INTEGER,
      inserted_at INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      UNIQUE(feed_id, guid)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_feed_id ON entries(feed_id);
    CREATE INDEX IF NOT EXISTS idx_entries_published_at ON entries(published_at);
    CREATE INDEX IF NOT EXISTS idx_entries_read ON entries(read);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT NOT NULL,
      language TEXT,
      time_range INTEGER,
      entry_count INTEGER,
      type TEXT NOT NULL DEFAULT 'report',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

    CREATE TABLE IF NOT EXISTS report_entries (
      report_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      PRIMARY KEY (report_id, entry_id)
    );

    CREATE INDEX IF NOT EXISTS idx_report_entries_entry_id ON report_entries(entry_id);

    CREATE TABLE IF NOT EXISTS feed_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT,
      report_style TEXT,
      interests TEXT,
      time_range INTEGER,
      pipeline_schedule TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_group_feeds (
      group_id TEXT NOT NULL REFERENCES feed_groups(id),
      feed_id TEXT NOT NULL REFERENCES feeds(id),
      PRIMARY KEY (group_id, feed_id)
    );

    CREATE TABLE IF NOT EXISTS report_topics (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      group_id TEXT,
      topics_json TEXT NOT NULL,
      digest TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_report_topics_report ON report_topics(report_id);
    CREATE INDEX IF NOT EXISTS idx_report_topics_group ON report_topics(group_id);
    CREATE INDEX IF NOT EXISTS idx_report_topics_created ON report_topics(created_at);
  `)

  // Migrate: add type column if missing
  try {
    db.run("ALTER TABLE reports ADD COLUMN type TEXT NOT NULL DEFAULT 'report'")
  } catch {
    // Column already exists
  }

  // Migration: add group_id to reports
  try {
    db.run(`ALTER TABLE reports ADD COLUMN group_id TEXT`)
  } catch {
    // Column already exists
  }

  saveDatabase()
  return db
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized")
  return db
}

export function saveDatabase() {
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function closeDatabase() {
  if (db) {
    saveDatabase()
    db.close()
    db = null
  }
}

// Helper to run a query and return results as typed objects
export function queryAll<T>(sql: string, params: any[] = []): T[] {
  const stmt = getDb().prepare(sql)
  if (params.length > 0) stmt.bind(params)

  const results: T[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return results
}

export function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  const results = queryAll<T>(sql, params)
  return results[0]
}

export function execute(sql: string, params: any[] = []) {
  getDb().run(sql, params)
}
