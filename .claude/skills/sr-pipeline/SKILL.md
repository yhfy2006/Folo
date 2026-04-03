---
name: sr-pipeline
description: Pipeline development reference for simple-reader YOMOO pipeline — stages, files, and external API dependencies
---

## YOMOO Pipeline Architecture

The pipeline runs in `apps/simple-reader/main/pipeline.ts` and orchestrates 9 stages:

### Stage Flow

| #   | Stage                          | File                                          | External API          | Conditional           |
| --- | ------------------------------ | --------------------------------------------- | --------------------- | --------------------- |
| 1   | Verify GitHub token            | `main/github.ts`                              | GitHub API            | No                    |
| 2   | Generate AI report             | `main/ai-report.ts`                           | LLM API               | No                    |
| 3   | Generate podcast script        | `main/ai-report.ts`                           | LLM API               | No                    |
| 4   | Generate TTS audio             | `main/tts.ts`                                 | MiniMax / Deepgram    | No                    |
| 5   | Upload audio to GitHub Release | `main/github.ts`                              | GitHub API            | No                    |
| 6   | Generate HTML + commit         | `main/html-generator.ts`, `main/github.ts`    | GitHub API            | No                    |
| 7   | Audio alignment                | `main/deepgram.ts`, `main/scene-generator.ts` | Deepgram API          | Yes: `deepgramApiKey` |
| 8   | Video render                   | `main/video-render.ts`, `video/`              | None (local Remotion) | Yes: requires stage 7 |
| 9   | YouTube upload + Shorts        | `main/youtube.ts`                             | YouTube Data API      | Yes: `youtubeEnabled` |

### Key Patterns

- **Callbacks**: Every stage reports progress via `PipelineCallbacks` (onStage, onStatus, onProgress, onDone, onError)
- **Preferences**: `main/preferences.ts` controls which stages are enabled (API keys, YouTube tokens)
- **Scheduling**: `main/pipeline-scheduler.ts` schedules automatic runs via Node timers
- **IPC events**: Renderer listens via `onPipelineStage`, `onPipelineStatus`, `onPipelineProgress`, `onPipelineDone`, `onPipelineError`

### Related Files

- Report generation logic: `main/ai-report.ts` (largest file ~36KB, handles report + podcast script + SEO description + shorts script)
- Podcast script methodology: `resources/小Lin说视频文案方法论.md`
- Video templates: `video/src/`
- Scene/subtitle generation: `main/scene-generator.ts`
- OG images: `main/og-image.ts`

### When Modifying the Pipeline

1. New stages go in `pipeline.ts` — follow the existing `callbacks.onStage()` → logic → `callbacks.onProgress()` pattern
2. Add corresponding IPC handler in `main/ipc-handlers.ts`
3. Add preload API method in `main/preload.ts`
4. Update renderer store in `renderer/stores/report-store.ts`
5. Update UI in `renderer/components/ReportView.tsx`
