# Pipeline Dry Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dryRun` mode that runs the full pipeline without external side effects (no DB marking, no uploads, no publishing).

**Architecture:** Add `dryRun` boolean to PipelineContext. Side-effect stages (upload, publish, youtube) return early with placeholders. Report generation skips DB writes. Shorts forces `skipUpload`. Exposed to renderer via IPC.

**Tech Stack:** TypeScript, existing pipeline architecture

**Spec:** `docs/superpowers/specs/2026-04-04-pipeline-dry-run-design.md`

---

### Task 1: Add `dryRun` to PipelineContext and Orchestrator

**Files:**

- Modify: `apps/simple-reader/main/pipeline/context.ts`
- Modify: `apps/simple-reader/main/pipeline/orchestrator.ts`
- Modify: `apps/simple-reader/main/pipeline.ts`

- [ ] **Step 1: Add dryRun to PipelineContext**

In `apps/simple-reader/main/pipeline/context.ts`, add `dryRun` to the interface after `skipUpload`:

```typescript
  // Options
  skipUpload?: boolean
  dryRun?: boolean
```

- [ ] **Step 2: Update `runPipeline` signature**

In `apps/simple-reader/main/pipeline/orchestrator.ts`, change `runPipeline` (line 59) from:

```typescript
export async function runPipeline(callbacks: PipelineCallbacks, groupId?: string): Promise<void> {
  const ctx = createContext({ groupId })
  await executePipeline(ctx, ALL_STAGES, callbacks)
}
```

to:

```typescript
export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const ctx = createContext({ groupId, dryRun: options?.dryRun })
  await executePipeline(ctx, ALL_STAGES, callbacks)
}
```

- [ ] **Step 3: Update re-export in pipeline.ts**

In `apps/simple-reader/main/pipeline.ts`, the re-export is already `export { runFrom, runPipeline } from "./pipeline/orchestrator"` — no change needed since it re-exports by reference.

- [ ] **Step 4: Commit**

```bash
cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && git add apps/simple-reader/main/pipeline/context.ts apps/simple-reader/main/pipeline/orchestrator.ts && git commit -m "feat(pipeline): add dryRun option to context and runPipeline"
```

---

### Task 2: Report Stage — skip DB writes in dryRun

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts` (generateReport, generateReportToString)
- Modify: `apps/simple-reader/main/pipeline/stages/report.ts`

- [ ] **Step 1: Add dryRun parameter to `generateReport`**

In `apps/simple-reader/main/ai-report.ts`, update the `generateReport` signature (line 36) from:

```typescript
export async function generateReport(
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  groupId?: string,
  youtubeInsights?: string,
): Promise<void> {
```

to:

```typescript
export async function generateReport(
  onChunk: (text: string) => void,
  onStatus: (status: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  groupId?: string,
  youtubeInsights?: string,
  dryRun?: boolean,
): Promise<void> {
```

- [ ] **Step 2: Wrap DB writes in dryRun check**

In `apps/simple-reader/main/ai-report.ts`, wrap the three DB write blocks (lines 184-223) in a `!dryRun` check. Replace lines 184-223 with:

```typescript
if (!dryRun) {
  // Save report to database
  const reportId = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const now = Math.floor(Date.now() / 1000)
  const title = generateReportTitle(effectivePrefs, groupName)
  execute(
    "INSERT INTO reports (id, title, content, language, time_range, entry_count, type, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      reportId,
      title,
      fullContent,
      effectivePrefs.language,
      effectivePrefs.timeRange,
      enrichedEntries.length,
      "report",
      groupId || null,
      now,
    ],
  )

  // Record which entries were used so they won't be selected again
  for (const entry of enrichedEntries) {
    execute("INSERT OR IGNORE INTO report_entries (report_id, entry_id) VALUES (?, ?)", [
      reportId,
      entry.id,
    ])
  }
  saveDatabase()
  console.info(
    "[ai-report] Report saved:",
    reportId,
    "with",
    enrichedEntries.length,
    "entries recorded",
  )

  // Stage 3.5: Extract topics (errors are non-blocking)
  onStatus("Extracting topic digest...")
  await extractAndSaveTopics(fullContent, reportId, groupId).catch((err) => {
    console.warn("[ai-report] Topic extraction failed:", err)
  })
} else {
  console.info("[ai-report] Dry run: skipping DB writes")
}
```

- [ ] **Step 3: Add dryRun parameter to `generateReportToString`**

In `apps/simple-reader/main/ai-report.ts`, update `generateReportToString` (line 906) from:

```typescript
export async function generateReportToString(
  onStatus: (status: string) => void,
  groupId?: string,
  youtubeInsights?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ""
    generateReport(
      (chunk) => {
        fullContent += chunk
      },
      onStatus,
      () => resolve(fullContent),
      (error) => reject(new Error(error)),
      groupId,
      youtubeInsights,
    ).catch(reject)
  })
}
```

to:

```typescript
export async function generateReportToString(
  onStatus: (status: string) => void,
  groupId?: string,
  youtubeInsights?: string,
  dryRun?: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullContent = ""
    generateReport(
      (chunk) => {
        fullContent += chunk
      },
      onStatus,
      () => resolve(fullContent),
      (error) => reject(new Error(error)),
      groupId,
      youtubeInsights,
      dryRun,
    ).catch(reject)
  })
}
```

- [ ] **Step 4: Pass dryRun from report stage**

In `apps/simple-reader/main/pipeline/stages/report.ts`, update the `generateReportToString` call (line 13) from:

```typescript
reportContent = await generateReportToString(
  (status) => {
    callbacks.onStatus(status)
  },
  ctx.groupId,
  ctx.youtubeInsights,
)
```

to:

```typescript
reportContent = await generateReportToString(
  (status) => {
    callbacks.onStatus(status)
  },
  ctx.groupId,
  ctx.youtubeInsights,
  ctx.dryRun,
)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && git add apps/simple-reader/main/ai-report.ts apps/simple-reader/main/pipeline/stages/report.ts && git commit -m "feat(pipeline): skip DB writes in report stage during dry run"
```

---

### Task 3: Upload, Publish, YouTube stages — early return in dryRun

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/upload.ts`
- Modify: `apps/simple-reader/main/pipeline/stages/publish.ts`
- Modify: `apps/simple-reader/main/pipeline/stages/youtube.ts`

- [ ] **Step 1: Upload stage — early return**

In `apps/simple-reader/main/pipeline/stages/upload.ts`, at the start of the `run` function (after line 12 `callbacks.onStatus("Uploading audio to GitHub...")`), add:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping audio upload")
  return { ...ctx, audioUrl: "dry-run://audio" }
}
```

- [ ] **Step 2: Publish stage — early return**

In `apps/simple-reader/main/pipeline/stages/publish.ts`, at the start of the `run` function (after line 17 `callbacks.onStatus("Publishing branded page...")`), add:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping publish")
  return { ...ctx, pageUrl: "dry-run://page" }
}
```

- [ ] **Step 3: YouTube stage — early return**

In `apps/simple-reader/main/pipeline/stages/youtube.ts`, at the start of the `run` function (after line 13 `callbacks.onStatus("Uploading to YouTube...")`), add:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping YouTube upload")
  return { ...ctx, youtubeUrl: "dry-run://youtube" }
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && git add apps/simple-reader/main/pipeline/stages/upload.ts apps/simple-reader/main/pipeline/stages/publish.ts apps/simple-reader/main/pipeline/stages/youtube.ts && git commit -m "feat(pipeline): skip upload/publish/youtube in dry run mode"
```

---

### Task 4: Shorts stage — force skipUpload in dryRun

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/shorts.ts`

- [ ] **Step 1: Force skipUpload at start of run**

In `apps/simple-reader/main/pipeline/stages/shorts.ts`, at the start of the `run` function (line 172, after the opening `async (ctx: PipelineContext, callbacks: StageCallbacks)`), before `const count = ...`, add:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: Shorts will render but skip upload")
  ctx = { ...ctx, skipUpload: true }
}
```

Note: We reassign `ctx` to a new object with `skipUpload: true`. This is safe because the run function parameter is not `const` and the spread creates a new object.

- [ ] **Step 2: Commit**

```bash
cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && git add apps/simple-reader/main/pipeline/stages/shorts.ts && git commit -m "feat(pipeline): force skipUpload for Shorts in dry run mode"
```

---

### Task 5: IPC Handler + Preload — expose dryRun to renderer

**Files:**

- Modify: `apps/simple-reader/main/ipc-handlers.ts`
- Modify: `apps/simple-reader/main/preload.ts`

- [ ] **Step 1: Update IPC handler to accept dryRun**

In `apps/simple-reader/main/ipc-handlers.ts`, update the handler (line 326) from:

```typescript
  ipcMain.handle("run-yomoo-pipeline", async (event, groupId?: string) => {
```

to:

```typescript
  ipcMain.handle("run-yomoo-pipeline", async (event, groupId?: string, dryRun?: boolean) => {
```

And update the `runPipeline` call (line 336) from:

```typescript
      await runPipeline(
        {
          ...callbacks...
        },
        groupId,
      )
```

to:

```typescript
      await runPipeline(
        {
          ...callbacks...
        },
        groupId,
        dryRun ? { dryRun: true } : undefined,
      )
```

Also add a log line after the existing console.info:

```typescript
console.info("[ipc] run-yomoo-pipeline called, groupId:", groupId, "dryRun:", dryRun)
```

- [ ] **Step 2: Update preload**

In `apps/simple-reader/main/preload.ts`, update the `runYomooPipeline` expose (line 116) from:

```typescript
  runYomooPipeline: (groupId?: string) => ipcRenderer.invoke("run-yomoo-pipeline", groupId),
```

to:

```typescript
  runYomooPipeline: (groupId?: string, dryRun?: boolean) =>
    ipcRenderer.invoke("run-yomoo-pipeline", groupId, dryRun),
```

- [ ] **Step 3: Commit**

```bash
cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && git add apps/simple-reader/main/ipc-handlers.ts apps/simple-reader/main/preload.ts && git commit -m "feat(pipeline): expose dryRun option to renderer via IPC"
```

---

### Task 6: Test and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all simple-reader tests**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat/apps/simple-reader && npx vitest run main/pipeline/__tests__/`
Expected: All pipeline tests pass (reflect, orchestrator, shorts, context).

- [ ] **Step 2: Typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && npx tsc --noEmit --project apps/simple-reader/tsconfig.node.json 2>&1 | grep "error TS" | grep -v "ai-report-youtube\|CLAUDECODE\|ShortsScript\|sql.js\|video-render\|github.ts"`
Expected: No new type errors from our changes.

- [ ] **Step 3: Lint**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/sticky-rat && npx eslint apps/simple-reader/main/pipeline/ apps/simple-reader/main/ai-report.ts apps/simple-reader/main/ipc-handlers.ts apps/simple-reader/main/preload.ts --fix`
Expected: No lint errors.
