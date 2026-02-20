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
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
  `)

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
  saveDatabase()
}
