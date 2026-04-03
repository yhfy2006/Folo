# CLAUDE.md — Simple Reader

This file provides guidance to Claude Code when working in `apps/simple-reader/`.

## Overview

Electron desktop RSS reader with AI-powered pipeline: feed aggregation → report generation → podcast script → TTS audio → video rendering → YouTube publishing.

## Architecture

Three layers, each with its own tsconfig:

- **Main process** (`main/`) — Electron main, Node.js APIs, database, pipeline, IPC handlers
- **Renderer** (`renderer/`) — React 19 SPA, Zustand stores, Tailwind CSS
- **Video** (`video/`) — Remotion 4 package for video rendering (separate npm package, not a monorepo workspace)

## Development

```bash
# From apps/simple-reader/
pnpm dev          # electron-vite dev (NOT standard Vite)
pnpm build        # electron-vite build

# From monorepo root
pnpm test         # All vitest suites (CI mode)
pnpm lint:fix     # ESLint auto-fix
pnpm format       # Prettier
```

Build tool is **electron-vite**, not plain Vite. Config: `electron.vite.config.ts`.

## Database (sql.js)

- In-memory SQLite via sql.js (WASM), persisted to `userData/simple-reader.db`
- **All writes must call `saveDatabase()`** explicitly — changes are lost otherwise
- sql.js must stay in Rollup `external` config (not bundled)
- All DB operations are **synchronous** — long queries block main thread
- Schema defined inline in `main/database.ts` (no migration files)

## IPC Patterns

Two communication modes between main ↔ renderer:

1. **Promise-based**: `ipcRenderer.invoke()` → `ipcMain.handle()` — for request/response (CRUD)
2. **Streaming**: `webContents.send()` → `ipcRenderer.on()` — for long-running ops (report chunks, pipeline progress). **Must clean up listeners on component unmount.**

Type-safe API defined in `main/preload.ts` → exposed as `window.api`.

## Pipeline (YOMOO)

9-stage pipeline in `main/pipeline.ts`:

1. Verify GitHub token
2. Generate AI report (`main/ai-report.ts`)
3. Generate podcast script
4. Generate TTS audio (`main/tts.ts` — MiniMax/Deepgram)
5. Upload audio to GitHub Release (`main/github.ts`)
6. Generate HTML + commit to GitHub Pages (`main/html-generator.ts`)
7. Audio alignment via Deepgram (`main/deepgram.ts`)
8. Video render via Remotion (`main/video-render.ts`)
9. YouTube upload + Shorts (`main/youtube.ts`)

External API dependencies: GitHub API, Deepgram, MiniMax TTS, YouTube Data API.
Stages 7-9 are conditional based on user preferences (API keys configured).

Pipeline scheduling: `main/pipeline-scheduler.ts` uses Node timers (not persisted — lost on restart).

## Styling

- Tailwind CSS 3 with custom accent color `#FF5C00`
- Dark mode uses **both** `class` strategy and `[data-theme="dark"]` attribute — keep them in sync
- CSS variables: `--background`, `--foreground`, `--border`, `--muted`, `--muted-foreground`

## Workspace Auto-Generation

`main/workspace.ts` writes Claude workspace files on every app launch to `userData/claude-workspace/`. Built-in skills are **always overwritten**. User custom skills survive in `<userData>/skills/`.

## Key Files

| Purpose              | File                                 |
| -------------------- | ------------------------------------ |
| Main entry           | `main/index.ts`                      |
| IPC handlers         | `main/ipc-handlers.ts`               |
| Database             | `main/database.ts`                   |
| Pipeline             | `main/pipeline.ts`                   |
| AI report generation | `main/ai-report.ts`                  |
| Preload/API bridge   | `main/preload.ts`                    |
| React entry          | `renderer/main.tsx`                  |
| Report UI            | `renderer/components/ReportView.tsx` |
| Report store         | `renderer/stores/report-store.ts`    |
