# Pipeline Dry Run Mode Design

**Date**: 2026-04-04
**Status**: Draft
**Scope**: `apps/simple-reader`

## Problem

There's no way to verify the full pipeline works end-to-end without actually publishing content, uploading to YouTube, marking feeds as used, and sending emails. This makes testing and debugging risky.

## Solution

Add a `dryRun` flag to `PipelineContext`. When true, the pipeline runs all content generation stages normally but skips all external side effects (DB writes that mark entries as used, uploads, publishing, email).

## Stage Behavior in Dry Run

| Stage   | dryRun behavior                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| verify  | Normal                                                                           |
| reflect | Normal                                                                           |
| report  | Generate report, **skip all DB writes** (report_entries, reports, report_topics) |
| podcast | Normal                                                                           |
| audio   | Normal (local file generation)                                                   |
| upload  | Skip, return `audioUrl: "dry-run://audio"`                                       |
| publish | Skip, return `pageUrl: "dry-run://page"`                                         |
| video   | Normal (local rendering)                                                         |
| youtube | Skip, return `youtubeUrl: "dry-run://youtube"`                                   |
| shorts  | Generate + render, skip upload (set `skipUpload = true`)                         |

## Detailed Changes

### 1. PipelineContext

Add `dryRun?: boolean` to the `PipelineContext` interface in `pipeline/context.ts`.

### 2. Orchestrator API

Update `runPipeline` signature to accept options:

```typescript
export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
  options?: { dryRun?: boolean },
): Promise<void>
```

Pass `dryRun` into context via `createContext({ groupId, dryRun: options?.dryRun })`.

### 3. Report Stage — skip DB writes

`generateReport` in `ai-report.ts` currently does 3 DB writes:

1. `INSERT INTO reports` (line ~186-200)
2. `INSERT INTO report_entries` (line ~204-209)
3. `extractAndSaveTopics` (line ~221)

Add a `dryRun?: boolean` parameter to `generateReport` and `generateReportToString`. When true, skip all 3 writes. The report content is still generated and returned normally.

### 4. Upload Stage — skip, return placeholder

At the start of `stages/upload.ts` run function:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping audio upload")
  return { ...ctx, audioUrl: "dry-run://audio" }
}
```

### 5. Publish Stage — skip, return placeholder

At the start of `stages/publish.ts` run function:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping publish")
  return { ...ctx, pageUrl: "dry-run://page" }
}
```

### 6. YouTube Stage — skip, return placeholder

At the start of `stages/youtube.ts` run function:

```typescript
if (ctx.dryRun) {
  callbacks.onStatus("Dry run: skipping YouTube upload")
  return { ...ctx, youtubeUrl: "dry-run://youtube" }
}
```

### 7. Shorts Stage — force skipUpload

At the start of `stages/shorts.ts` run function, force skipUpload:

```typescript
if (ctx.dryRun) {
  ctx = { ...ctx, skipUpload: true }
}
```

This leverages the existing `skipUpload` path in `generateOneShorts` which skips the upload and returns the local file path instead. No video_uploads DB record is written (we already only record on actual upload).

### 8. IPC Handler — expose dryRun to renderer

In `ipc-handlers.ts`, update the pipeline trigger handler to accept a `dryRun` option and pass it through to `runPipeline`.

## Files Changed

| File                              | Change                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `main/pipeline/context.ts`        | Add `dryRun?: boolean` to PipelineContext                           |
| `main/pipeline/orchestrator.ts`   | Add `options` param to `runPipeline`                                |
| `main/pipeline.ts`                | Update re-export if signature changed                               |
| `main/ai-report.ts`               | Add `dryRun` param to `generateReport` and `generateReportToString` |
| `main/pipeline/stages/report.ts`  | Pass `ctx.dryRun` to `generateReportToString`                       |
| `main/pipeline/stages/upload.ts`  | Early return with placeholder                                       |
| `main/pipeline/stages/publish.ts` | Early return with placeholder                                       |
| `main/pipeline/stages/youtube.ts` | Early return with placeholder                                       |
| `main/pipeline/stages/shorts.ts`  | Force `skipUpload` when dryRun                                      |
| `main/ipc-handlers.ts`            | Pass dryRun option through                                          |

## Files NOT Changed

- `pipeline-scheduler.ts` — scheduler always runs real pipeline
- `preferences.ts` — no new preferences (dryRun is per-invocation, not persistent)
- `skills.ts`, `workspace.ts` — unaffected

## Testing

- Unit test: orchestrator passes dryRun to context
- Unit test: report stage with dryRun skips DB writes
- Unit test: upload/publish/youtube stages return placeholders
- Unit test: shorts stage sets skipUpload when dryRun
