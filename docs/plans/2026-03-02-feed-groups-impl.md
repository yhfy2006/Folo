# Feed Groups Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add feed group support so each OPML import creates a named group with its own pipeline configuration, enabling per-topic daily newsletters.

**Architecture:** New `feed_groups` + `feed_group_feeds` tables in SQLite. `generateReport` and `runPipeline` accept optional `groupId` to filter entries and resolve per-group config. Scheduler manages independent timers per group. UI sidebar adds group navigation and management.

**Tech Stack:** sql.js (SQLite), Electron IPC, React + Zustand, existing Claude CLI pipeline

---

### Task 1: Database Schema — Add feed_groups and feed_group_feeds tables

**Files:**

- Modify: `apps/simple-reader/main/database.ts:9-22` (add FeedGroup interface)
- Modify: `apps/simple-reader/main/database.ts:55-117` (add CREATE TABLE + migration)

**Step 1: Add FeedGroup type after existing interfaces**

In `database.ts`, after the `Entry` interface (line 36), add:

```typescript
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
```

**Step 2: Add CREATE TABLE statements in initDatabase**

In `database.ts`, after the `report_entries` index (line 109), add:

```typescript
// Feed groups
db.run(`
      CREATE TABLE IF NOT EXISTS feed_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        language TEXT,
        report_style TEXT,
        interests TEXT,
        time_range INTEGER,
        pipeline_schedule TEXT,
        created_at INTEGER NOT NULL
      )
    `)

db.run(`
      CREATE TABLE IF NOT EXISTS feed_group_feeds (
        group_id TEXT NOT NULL REFERENCES feed_groups(id),
        feed_id TEXT NOT NULL REFERENCES feeds(id),
        PRIMARY KEY (group_id, feed_id)
      )
    `)
```

**Step 3: Add migration for reports.group_id**

After the existing migration block (line 117), add:

```typescript
// Migration: add group_id to reports
try {
  db.run(`ALTER TABLE reports ADD COLUMN group_id TEXT`)
} catch {
  // Column already exists
}
```

**Step 4: Verify the app starts without errors**

Run: `cd apps/simple-reader && pnpm run dev:electron`
Expected: App starts, no SQL errors in console. Existing data intact.

**Step 5: Commit**

```bash
git add apps/simple-reader/main/database.ts
git commit -m "feat(simple-reader): add feed_groups and feed_group_feeds tables"
```

---

### Task 2: IPC Handlers — CRUD for feed groups

**Files:**

- Modify: `apps/simple-reader/main/ipc-handlers.ts` (add group CRUD handlers)
- Modify: `apps/simple-reader/main/preload.ts` (expose group APIs)

**Step 1: Add group CRUD IPC handlers**

In `ipc-handlers.ts`, inside `registerIpcHandlers()`, after the existing handlers (before the closing `}`), add:

```typescript
// Feed Groups
ipcMain.handle("get-feed-groups", async () => {
  return queryAll(`SELECT * FROM feed_groups ORDER BY created_at DESC`)
})

ipcMain.handle("get-feed-group", async (_event, groupId: string) => {
  return queryOne(`SELECT * FROM feed_groups WHERE id = ?`, [groupId])
})

ipcMain.handle("create-feed-group", async (_event, name: string) => {
  const id = generateId()
  execute(`INSERT INTO feed_groups (id, name, created_at) VALUES (?, ?, ?)`, [id, name, Date.now()])
  return id
})

ipcMain.handle(
  "update-feed-group",
  async (
    _event,
    groupId: string,
    updates: {
      name?: string
      language?: string | null
      report_style?: string | null
      interests?: string | null
      time_range?: number | null
      pipeline_schedule?: string | null
    },
  ) => {
    const fields: string[] = []
    const values: any[] = []
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`)
        values.push(value)
      }
    }
    if (fields.length > 0) {
      values.push(groupId)
      execute(`UPDATE feed_groups SET ${fields.join(", ")} WHERE id = ?`, values)
    }
  },
)

ipcMain.handle("delete-feed-group", async (_event, groupId: string) => {
  execute(`DELETE FROM feed_group_feeds WHERE group_id = ?`, [groupId])
  execute(`DELETE FROM feed_groups WHERE id = ?`, [groupId])
})

ipcMain.handle("get-group-feeds", async (_event, groupId: string) => {
  return queryAll(
    `SELECT f.* FROM feeds f
       INNER JOIN feed_group_feeds gf ON f.id = gf.feed_id
       WHERE gf.group_id = ?
       ORDER BY f.category, f.title`,
    [groupId],
  )
})

ipcMain.handle("add-feeds-to-group", async (_event, groupId: string, feedIds: string[]) => {
  for (const feedId of feedIds) {
    execute(`INSERT OR IGNORE INTO feed_group_feeds (group_id, feed_id) VALUES (?, ?)`, [
      groupId,
      feedId,
    ])
  }
})

ipcMain.handle("remove-feed-from-group", async (_event, groupId: string, feedId: string) => {
  execute(`DELETE FROM feed_group_feeds WHERE group_id = ? AND feed_id = ?`, [groupId, feedId])
})
```

Also add the `FeedGroup` import at the top of ipc-handlers.ts:

```typescript
import type { Entry, Feed, FeedGroup } from "./database"
```

**Step 2: Add preload API bridge**

In `preload.ts`, add after the `addFeed` line (line 11) and before the `getUnreadCounts` line:

```typescript
  // Feed Groups
  getFeedGroups: () => ipcRenderer.invoke("get-feed-groups"),
  getFeedGroup: (groupId: string) => ipcRenderer.invoke("get-feed-group", groupId),
  createFeedGroup: (name: string) => ipcRenderer.invoke("create-feed-group", name),
  updateFeedGroup: (groupId: string, updates: any) =>
    ipcRenderer.invoke("update-feed-group", groupId, updates),
  deleteFeedGroup: (groupId: string) => ipcRenderer.invoke("delete-feed-group", groupId),
  getGroupFeeds: (groupId: string) => ipcRenderer.invoke("get-group-feeds", groupId),
  addFeedsToGroup: (groupId: string, feedIds: string[]) =>
    ipcRenderer.invoke("add-feeds-to-group", groupId, feedIds),
  removeFeedFromGroup: (groupId: string, feedId: string) =>
    ipcRenderer.invoke("remove-feed-from-group", groupId, feedId),
```

**Step 3: Commit**

```bash
git add apps/simple-reader/main/ipc-handlers.ts apps/simple-reader/main/preload.ts
git commit -m "feat(simple-reader): add feed group CRUD IPC handlers and preload API"
```

---

### Task 3: Modify OPML Import to Create a Group

**Files:**

- Modify: `apps/simple-reader/main/ipc-handlers.ts:16-50` (import-opml handler)

**Step 1: Update the import-opml handler**

Replace the existing `import-opml` handler (lines 16-50) with a version that:

1. Opens the file dialog
2. Prompts for a group name (using the filename as default)
3. Parses OPML and inserts feeds
4. Creates a feed_group and links all feeds

```typescript
ipcMain.handle("import-opml", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, "utf-8")
  const feeds = parseOPML(content)

  if (feeds.length === 0) return null

  // Derive default group name from filename
  const fileName = path.basename(filePath, path.extname(filePath))

  // Prompt user for group name
  const win = BrowserWindow.getFocusedWindow()
  // We'll return the feeds + suggested name, let renderer handle the dialog
  const feedIds: string[] = []
  for (const feed of feeds) {
    const id = generateId()
    execute(
      `INSERT OR IGNORE INTO feeds (id, title, url, site_url, category) VALUES (?, ?, ?, ?, ?)`,
      [id, feed.title, feed.xmlUrl, feed.htmlUrl || null, feed.category || null],
    )
    // Get the actual id (might already exist due to OR IGNORE)
    const existing = queryOne<{ id: string }>(`SELECT id FROM feeds WHERE url = ?`, [feed.xmlUrl])
    if (existing) feedIds.push(existing.id)
  }

  // Create feed group
  const groupId = generateId()
  execute(`INSERT INTO feed_groups (id, name, created_at) VALUES (?, ?, ?)`, [
    groupId,
    fileName,
    Date.now(),
  ])

  // Link feeds to group
  for (const feedId of feedIds) {
    execute(`INSERT OR IGNORE INTO feed_group_feeds (group_id, feed_id) VALUES (?, ?)`, [
      groupId,
      feedId,
    ])
  }

  await refreshAllFeeds()
  return { groupId, groupName: fileName, feedCount: feedIds.length }
})
```

Add the `path` import at the top of ipc-handlers.ts if not already present:

```typescript
import path from "pathe"
```

**Step 2: Update preload.ts import-opml return type awareness**

No change needed — the return type is inferred.

**Step 3: Commit**

```bash
git add apps/simple-reader/main/ipc-handlers.ts
git commit -m "feat(simple-reader): OPML import now creates a feed group automatically"
```

---

### Task 4: Modify AI Report Generation to Support groupId

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts:35-165` (generateReport function)
- Modify: `apps/simple-reader/main/ai-report.ts:168-175` (generateReportTitle)
- Modify: `apps/simple-reader/main/ai-report.ts:505-520` (generateReportToString)

**Step 1: Add groupId parameter to generateReport**

Change the `generateReport` signature (line 35) to:

```typescript
export async function generateReport(
  onChunk: (chunk: string) => void,
  onStatus: (status: string) => void,
  onDone: (reportId: string) => void,
  onError: (error: string) => void,
  groupId?: string,
): Promise<void> {
```

**Step 2: Add group config resolution**

After `const prefs = loadPreferences()` (around line 38), add:

```typescript
// Resolve group-specific config
let effectivePrefs = { ...prefs }
let groupName: string | undefined
if (groupId) {
  const group = queryOne<FeedGroup>(`SELECT * FROM feed_groups WHERE id = ?`, [groupId])
  if (group) {
    groupName = group.name
    if (group.language) effectivePrefs.language = group.language
    if (group.report_style) effectivePrefs.reportStyle = group.report_style as any
    if (group.interests) effectivePrefs.interests = JSON.parse(group.interests)
    if (group.time_range) effectivePrefs.timeRange = group.time_range
  }
}
```

Add the import for FeedGroup:

```typescript
import type { Entry, FeedGroup } from "./database"
```

**Step 3: Modify the entry query to filter by group**

Replace the entry query (lines 49-57) with a conditional:

```typescript
const cutoffMs = Date.now() - effectivePrefs.timeRange * 60 * 60 * 1000
const cutoffSec = Math.floor(cutoffMs / 1000)

let entries: EntryWithFeed[]
if (groupId) {
  entries = queryAll<EntryWithFeed>(
    `SELECT e.*, f.title as feed_title, f.category as feed_category
       FROM entries e
       LEFT JOIN feeds f ON e.feed_id = f.id
       INNER JOIN feed_group_feeds gf ON f.id = gf.feed_id
       WHERE gf.group_id = ?
         AND (e.published_at > ? OR e.inserted_at > ?)
         AND e.id NOT IN (SELECT entry_id FROM report_entries)
       ORDER BY e.published_at DESC`,
    [groupId, cutoffSec, cutoffSec],
  )
} else {
  entries = queryAll<EntryWithFeed>(
    `SELECT e.*, f.title as feed_title, f.category as feed_category
       FROM entries e
       LEFT JOIN feeds f ON e.feed_id = f.id
       WHERE (e.published_at > ? OR e.inserted_at > ?)
         AND e.id NOT IN (SELECT entry_id FROM report_entries)
       ORDER BY e.published_at DESC`,
    [cutoffSec, cutoffSec],
  )
}
```

**Step 4: Use effectivePrefs throughout**

Replace all references to `prefs` with `effectivePrefs` in the rest of the function for `buildScreeningPrompt`, `buildReportPrompt`, and language/style usage.

**Step 5: Update report title to include group name**

Change `generateReportTitle` (line 168) to accept an optional group name:

```typescript
function generateReportTitle(_prefs: UserPreferences, groupName?: string): string {
  const now = new Date()
  const hour = now.getHours()
  const period = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  const date = now.toISOString().split("T")[0]
  const prefix = groupName ? `${groupName} ` : ""
  return `${prefix}${period} Report - ${date}`
}
```

Update the call site to pass `groupName`.

**Step 6: Save report with group_id**

In the INSERT statement for the report (line 133), add group_id:

```typescript
execute(
  `INSERT INTO reports (id, title, content, language, time_range, entry_count, type, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    reportId,
    reportTitle,
    fullContent,
    effectivePrefs.language,
    effectivePrefs.timeRange,
    selectedEntries.length,
    "report",
    groupId || null,
    Date.now(),
  ],
)
```

**Step 7: Update generateReportToString**

Add `groupId` parameter:

```typescript
export async function generateReportToString(
  onStatus: (status: string) => void,
  groupId?: string,
): Promise<string> {
```

And pass it to `generateReport(..., groupId)`.

**Step 8: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts
git commit -m "feat(simple-reader): generateReport supports per-group filtering and config"
```

---

### Task 5: Modify Pipeline to Support groupId

**Files:**

- Modify: `apps/simple-reader/main/pipeline.ts:62-390` (runPipeline)
- Modify: `apps/simple-reader/main/pipeline.ts:396+` (runVideoOnly)

**Step 1: Add groupId to PipelineCallbacks or as separate param**

Change `runPipeline` signature (line 62):

```typescript
export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
): Promise<void> {
```

**Step 2: Pass groupId to report generation**

In Stage 1 (report, line 107), change:

```typescript
const reportContent = await generateReportToString(statusCb, groupId)
```

**Step 3: Resolve group name for publishing paths**

After loading prefs, add:

```typescript
let groupName: string | undefined
if (groupId) {
  const group = queryOne<{ name: string }>(`SELECT name FROM feed_groups WHERE id = ?`, [groupId])
  groupName = group?.name
}
```

**Step 4: Modify publishing path**

In Stage 5 (publish), when calling `commitFile`, prefix the path with group name:

```typescript
const pagePath = groupName ? `${groupName}/${date}.html` : `${date}.html`
```

Apply the same pattern to `email.html` path and sitemap entries.

**Step 5: Update IPC handler for run-yomoo-pipeline**

In `ipc-handlers.ts`, update the `run-yomoo-pipeline` handler (line 248) to accept groupId:

```typescript
ipcMain.handle("run-yomoo-pipeline", async (_event, groupId?: string) => {
  // ... existing code ...
  const { runPipeline } = await import("./pipeline")
  await runPipeline(callbacks, groupId)
  // ...
})
```

Update preload.ts:

```typescript
  runYomooPipeline: (groupId?: string) => ipcRenderer.invoke("run-yomoo-pipeline", groupId),
```

**Step 6: Commit**

```bash
git add apps/simple-reader/main/pipeline.ts apps/simple-reader/main/ipc-handlers.ts apps/simple-reader/main/preload.ts
git commit -m "feat(simple-reader): pipeline accepts groupId for per-group runs"
```

---

### Task 6: Per-Group Scheduler

**Files:**

- Modify: `apps/simple-reader/main/pipeline-scheduler.ts` (rewrite for multi-group)

**Step 1: Rewrite scheduler to support multiple groups**

Replace the module-level state and functions:

```typescript
import { BrowserWindow } from "electron"

import { queryAll } from "./database"
import type { FeedGroup } from "./database"
import { loadPreferences } from "./preferences"

// Track timers: groupId -> timerId (null key = global)
const timers = new Map<string | null, ReturnType<typeof setTimeout>>()
const lastRunDates = new Map<string | null, string>()

export function startPipelineScheduler(): void {
  // Clear all existing timers
  for (const [, timerId] of timers) {
    clearTimeout(timerId)
  }
  timers.clear()

  // Schedule global pipeline
  const prefs = loadPreferences()
  if (prefs.pipelineSchedule && /^\d{2}:\d{2}$/.test(prefs.pipelineSchedule)) {
    scheduleNext(prefs.pipelineSchedule, null)
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

export function getSchedulerStatus() {
  const prefs = loadPreferences()
  const globalEnabled = !!prefs.pipelineSchedule
  const globalSchedule = prefs.pipelineSchedule || null

  return {
    enabled: globalEnabled,
    schedule: globalSchedule,
    nextRun: globalSchedule
      ? new Date(Date.now() + msUntilNext(globalSchedule)).toISOString()
      : null,
    lastRunDate: lastRunDates.get(null) || null,
  }
}

function scheduleNext(schedule: string, groupId: string | null): void {
  const ms = msUntilNext(schedule)
  const timerId = setTimeout(() => triggerPipeline(schedule, groupId), ms)
  timers.set(groupId, timerId)
}

function msUntilNext(schedule: string): number {
  const [hours, minutes] = schedule.split(":").map(Number)
  const now = new Date()
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  if (target <= now) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime() - now.getTime()
}

async function triggerPipeline(schedule: string, groupId: string | null): Promise<void> {
  const today = new Date().toISOString().split("T")[0]
  const key = groupId ?? null
  if (lastRunDates.get(key) === today) {
    scheduleNext(schedule, groupId)
    return
  }

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    scheduleNext(schedule, groupId)
    return
  }

  lastRunDates.set(key, today)
  // Send trigger with groupId so renderer knows which group
  win.webContents.send("pipeline-auto-trigger", groupId)
  scheduleNext(schedule, groupId)
}
```

**Step 2: Update preload for auto-trigger with groupId**

In `preload.ts`, update the `onPipelineAutoTrigger`:

```typescript
  onPipelineAutoTrigger: (callback: (groupId?: string) => void) => {
    const handler = (_event: any, groupId?: string) => callback(groupId)
    ipcRenderer.on("pipeline-auto-trigger", handler)
    return () => ipcRenderer.removeListener("pipeline-auto-trigger", handler)
  },
```

**Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline-scheduler.ts apps/simple-reader/main/preload.ts
git commit -m "feat(simple-reader): per-group pipeline scheduling"
```

---

### Task 7: Renderer — Feed Group Store

**Files:**

- Create: `apps/simple-reader/renderer/stores/group-store.ts`

**Step 1: Create the group store**

```typescript
import { create } from "zustand"

export interface FeedGroup {
  id: string
  name: string
  language: string | null
  report_style: string | null
  interests: string | null
  time_range: number | null
  pipeline_schedule: string | null
  created_at: number
}

interface GroupState {
  groups: FeedGroup[]
  selectedGroupId: string | null

  setGroups: (groups: FeedGroup[]) => void
  setSelectedGroupId: (id: string | null) => void

  loadGroups: () => Promise<void>
}

export const useGroupStore = create<GroupState>((set) => ({
  groups: [],
  selectedGroupId: null,

  setGroups: (groups) => set({ groups }),
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),

  loadGroups: async () => {
    const groups = await window.api.getFeedGroups()
    set({ groups })
  },
}))
```

**Step 2: Commit**

```bash
git add apps/simple-reader/renderer/stores/group-store.ts
git commit -m "feat(simple-reader): add feed group Zustand store"
```

---

### Task 8: Renderer — Sidebar Group Navigation

**Files:**

- Modify: `apps/simple-reader/renderer/components/FeedSidebar.tsx`

**Step 1: Add group list to sidebar**

Import the group store and add group navigation above the feed list:

```typescript
import { useGroupStore } from "../stores/group-store"
```

In the component, add:

```typescript
const { groups, selectedGroupId, setSelectedGroupId, loadGroups } = useGroupStore()
```

Load groups on mount (in the same useEffect or a new one):

```typescript
React.useEffect(() => {
  loadGroups()
}, [])
```

**Step 2: Add group selector UI**

Before the "All Feeds" button, add a group list section:

```tsx
{
  /* Group selector */
}
;<div className="mb-2">
  <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase">Groups</div>
  <button
    onClick={() => {
      setSelectedGroupId(null)
      handleSelectFeed(null)
    }}
    className={`w-full px-3 py-1.5 text-left text-sm ${
      selectedGroupId === null ? "bg-blue-50 font-medium text-blue-700" : "hover:bg-gray-50"
    }`}
  >
    All Feeds
  </button>
  {groups.map((group) => (
    <button
      key={group.id}
      onClick={() => {
        setSelectedGroupId(group.id)
        handleSelectFeed(null)
      }}
      className={`w-full px-3 py-1.5 text-left text-sm ${
        selectedGroupId === group.id ? "bg-blue-50 font-medium text-blue-700" : "hover:bg-gray-50"
      }`}
    >
      {group.name}
    </button>
  ))}
</div>
```

**Step 3: Filter feeds by selected group**

When a group is selected, fetch group-specific feeds:

```typescript
React.useEffect(() => {
  if (selectedGroupId) {
    window.api.getGroupFeeds(selectedGroupId).then((feeds) => {
      setFeeds(feeds)
    })
  } else {
    loadFeeds()
  }
}, [selectedGroupId])
```

**Step 4: Update OPML import handler**

After importing, reload groups:

```typescript
const handleImportOPML = useCallback(async () => {
  const result = await window.api.importOPML()
  if (result) {
    await loadGroups()
    await loadFeeds()
    await loadUnreadCounts()
    // Auto-select the newly created group
    setSelectedGroupId(result.groupId)
  }
}, [loadFeeds, loadUnreadCounts, loadGroups, setSelectedGroupId])
```

**Step 5: Commit**

```bash
git add apps/simple-reader/renderer/components/FeedSidebar.tsx
git commit -m "feat(simple-reader): add group navigation to sidebar"
```

---

### Task 9: Renderer — Group Settings Panel

**Files:**

- Create: `apps/simple-reader/renderer/components/GroupSettings.tsx`
- Modify: `apps/simple-reader/renderer/components/FeedSidebar.tsx` (add settings trigger)

**Step 1: Create GroupSettings component**

A panel/modal that shows when clicking a group's settings icon. Allows editing:

- Group name
- Language (dropdown, same options as global prefs)
- Report style (concise/detailed)
- Interests (text input, comma-separated)
- Pipeline schedule (HH:mm input)

```typescript
import * as React from "react"
import { useCallback, useEffect, useState } from "react"

import type { FeedGroup } from "../stores/group-store"
import { useGroupStore } from "../stores/group-store"

interface Props {
  group: FeedGroup
  onClose: () => void
}

export function GroupSettings({ group, onClose }: Props) {
  const { loadGroups } = useGroupStore()
  const [name, setName] = useState(group.name)
  const [language, setLanguage] = useState(group.language || "")
  const [reportStyle, setReportStyle] = useState(group.report_style || "")
  const [interests, setInterests] = useState(
    group.interests ? JSON.parse(group.interests).join(", ") : "",
  )
  const [schedule, setSchedule] = useState(group.pipeline_schedule || "")
  const [timeRange, setTimeRange] = useState(group.time_range?.toString() || "")

  const handleSave = useCallback(async () => {
    await window.api.updateFeedGroup(group.id, {
      name,
      language: language || null,
      report_style: reportStyle || null,
      interests: interests.trim()
        ? JSON.stringify(interests.split(",").map((s: string) => s.trim()))
        : null,
      time_range: timeRange ? parseInt(timeRange, 10) : null,
      pipeline_schedule: schedule || null,
    })
    await loadGroups()
    onClose()
  }, [name, language, reportStyle, interests, schedule, timeRange, group.id, loadGroups, onClose])

  const handleDelete = useCallback(async () => {
    await window.api.deleteFeedGroup(group.id)
    await loadGroups()
    onClose()
  }, [group.id, loadGroups, onClose])

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-lg font-semibold">Group Settings: {group.name}</h3>
      {/* Form fields for name, language, reportStyle, interests, schedule, timeRange */}
      {/* Each as a labeled input */}
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1" />
      </div>
      <div>
        <label className="block text-sm font-medium">Language (blank = use global)</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full border rounded px-2 py-1">
          <option value="">Default (global)</option>
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
          <option value="zh-TW">繁體中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="es">Español</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Report Style (blank = use global)</label>
        <select value={reportStyle} onChange={(e) => setReportStyle(e.target.value)} className="w-full border rounded px-2 py-1">
          <option value="">Default (global)</option>
          <option value="concise">Concise</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Interests (comma-separated, blank = use global)</label>
        <input value={interests} onChange={(e) => setInterests(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="AI, crypto, tech" />
      </div>
      <div>
        <label className="block text-sm font-medium">Time Range (hours, blank = use global)</label>
        <input value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="w-full border rounded px-2 py-1" type="number" />
      </div>
      <div>
        <label className="block text-sm font-medium">Pipeline Schedule (HH:mm, blank = manual only)</label>
        <input value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="08:00" />
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={handleSave} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">Save</button>
        <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 rounded text-sm">Cancel</button>
        <button onClick={handleDelete} className="px-4 py-1.5 bg-red-100 text-red-700 rounded text-sm ml-auto">Delete Group</button>
      </div>
    </div>
  )
}
```

**Step 2: Wire into sidebar**

Add a settings icon button next to each group in the sidebar. Clicking it opens the GroupSettings panel.

**Step 3: Commit**

```bash
git add apps/simple-reader/renderer/components/GroupSettings.tsx apps/simple-reader/renderer/components/FeedSidebar.tsx
git commit -m "feat(simple-reader): add group settings panel"
```

---

### Task 10: Renderer — Pipeline Panel Group Selection

**Files:**

- Modify: Whichever component has the "Run Pipeline" button (likely in a pipeline/report panel component)

**Step 1: Add group selector to pipeline trigger**

Where the "Run Pipeline" button exists, add a dropdown to select which group (or "All") to run the pipeline for:

```tsx
const { groups, selectedGroupId } = useGroupStore()

// When running pipeline:
const handleRunPipeline = () => {
  window.api.runYomooPipeline(selectedGroupId || undefined)
}
```

**Step 2: Handle auto-trigger with groupId**

Update the `onPipelineAutoTrigger` listener to pass `groupId`:

```typescript
window.api.onPipelineAutoTrigger((groupId) => {
  window.api.runYomooPipeline(groupId)
})
```

**Step 3: Commit**

```bash
git add <modified files>
git commit -m "feat(simple-reader): pipeline UI supports per-group runs"
```

---

### Task 11: Update get-entries and get-reports to filter by group

**Files:**

- Modify: `apps/simple-reader/main/ipc-handlers.ts` (get-entries, get-reports handlers)

**Step 1: Update get-entries to accept groupId**

```typescript
ipcMain.handle("get-entries", async (_event, feedId?: string, groupId?: string) => {
  if (feedId) {
    return queryAll<Entry>(
      `SELECT * FROM entries WHERE feed_id = ? ORDER BY published_at DESC LIMIT 200`,
      [feedId],
    )
  } else if (groupId) {
    return queryAll<Entry>(
      `SELECT e.* FROM entries e
         INNER JOIN feed_group_feeds gf ON e.feed_id = gf.feed_id
         WHERE gf.group_id = ?
         ORDER BY e.published_at DESC LIMIT 200`,
      [groupId],
    )
  } else {
    return queryAll<Entry>(`SELECT * FROM entries ORDER BY published_at DESC LIMIT 200`)
  }
})
```

**Step 2: Update get-reports to filter by groupId**

```typescript
ipcMain.handle("get-reports", async (_event, groupId?: string) => {
  if (groupId) {
    return queryAll(
      `SELECT id, title, language, time_range, entry_count, type, group_id, created_at
         FROM reports WHERE group_id = ? ORDER BY created_at DESC LIMIT 50`,
      [groupId],
    )
  }
  return queryAll(
    `SELECT id, title, language, time_range, entry_count, type, group_id, created_at
       FROM reports ORDER BY created_at DESC LIMIT 50`,
  )
})
```

**Step 3: Update preload.ts**

```typescript
  getEntries: (feedId?: string, groupId?: string) =>
    ipcRenderer.invoke("get-entries", feedId, groupId),
  getReports: (groupId?: string) => ipcRenderer.invoke("get-reports", groupId),
```

**Step 4: Update renderer stores to pass groupId**

In `entry-store.ts`, update `loadEntries` to accept optional `groupId`.
In `report-store.ts`, update `loadReports` similarly.

**Step 5: Commit**

```bash
git add apps/simple-reader/main/ipc-handlers.ts apps/simple-reader/main/preload.ts apps/simple-reader/renderer/stores/entry-store.ts apps/simple-reader/renderer/stores/report-store.ts
git commit -m "feat(simple-reader): entries and reports filtered by group"
```

---

### Task 12: Integration Testing — End-to-End Verification

**Step 1: Start the app**

```bash
cd apps/simple-reader && pnpm run dev:electron
```

**Step 2: Test OPML import creates a group**

1. Import an OPML file
2. Verify a new group appears in the sidebar
3. Verify feeds are listed under the group

**Step 3: Test group settings**

1. Click group settings
2. Change language, interests, schedule
3. Save and verify changes persist after restart

**Step 4: Test per-group report generation**

1. Select a group
2. Generate a report
3. Verify the report only contains entries from that group's feeds
4. Verify the report title includes the group name

**Step 5: Test per-group pipeline**

1. Run pipeline for a specific group
2. Verify the published page is under the group's path

**Step 6: Test scheduler**

1. Set a pipeline_schedule for a group
2. Verify the scheduler fires for that group independently

**Step 7: Commit any fixes**

```bash
git commit -m "fix(simple-reader): integration fixes for feed groups"
```
