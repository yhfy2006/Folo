import fs from "node:fs"
import os from "node:os"

import path from "pathe"

import type { PipelineContext } from "./context"
import { createContext, saveContext } from "./context"
import { audioStage } from "./stages/audio"
import { podcastStage } from "./stages/podcast"
import { publishStage } from "./stages/publish"
import { reflectStage } from "./stages/reflect"
import { reportStage } from "./stages/report"
import { shortsStage } from "./stages/shorts"
import { uploadStage } from "./stages/upload"
import { verifyStage } from "./stages/verify"
import { videoStage } from "./stages/video"
import { youtubeStage } from "./stages/youtube"
import type { StageDefinition, StageName } from "./types"

export interface PipelineResult {
  pageUrl: string
  audioUrl: string
  date: string
  youtubeUrl?: string
}

export interface PipelineCallbacks {
  onStage: (stage: string) => void
  onStatus: (status: string) => void
  onProgress: (step: number, total: number) => void
  onDone: (result: PipelineResult) => void
  onError: (stage: string, error: string) => void
}

const ALL_STAGES: StageDefinition[] = [
  verifyStage,
  reflectStage,
  reportStage,
  podcastStage,
  audioStage,
  uploadStage,
  publishStage,
  videoStage,
  youtubeStage,
  shortsStage,
]

export function buildStageList(stages: StageDefinition[], ctx: PipelineContext): StageDefinition[] {
  return stages.filter((s) => s.shouldRun(ctx))
}

export function resolveStartIndex(stages: StageDefinition[], startFrom?: StageName): number {
  if (!startFrom) return 0
  const idx = stages.findIndex((s) => s.name === startFrom)
  if (idx === -1) throw new Error(`Unknown stage: ${startFrom}`)
  return idx
}

export async function runPipeline(
  callbacks: PipelineCallbacks,
  groupId?: string,
  options?: { dryRun?: boolean },
): Promise<void> {
  const ctx = createContext({ groupId, dryRun: options?.dryRun })
  await executePipeline(ctx, ALL_STAGES, callbacks)
}

export async function runFrom(
  startStage: StageName,
  ctx: PipelineContext,
  callbacks: PipelineCallbacks,
): Promise<void> {
  await executePipeline(ctx, ALL_STAGES, callbacks, startStage)
}

async function executePipeline(
  initialCtx: PipelineContext,
  allStages: StageDefinition[],
  callbacks: PipelineCallbacks,
  startFrom?: StageName,
): Promise<void> {
  const activeStages = buildStageList(allStages, initialCtx)
  const startIdx = resolveStartIndex(activeStages, startFrom)
  const stagesToRun = activeStages.slice(startIdx)
  const total = stagesToRun.length

  let ctx = initialCtx
  let step = 0

  for (const stage of stagesToRun) {
    callbacks.onStage(stage.name)
    callbacks.onProgress(step, total)

    try {
      ctx = await stage.run(ctx, { onStatus: callbacks.onStatus })
    } catch (err) {
      // Video, YouTube, Shorts failures are non-fatal
      const nonFatal: StageName[] = ["reflect", "video", "youtube", "shorts"]
      if (nonFatal.includes(stage.name)) {
        console.info(`[pipeline] ${stage.name} failed (non-fatal):`, err)
        callbacks.onStatus(`${stage.label} skipped: ${err}`)
      } else {
        callbacks.onError(stage.name, String(err))
        saveContextSnapshot(ctx)
        return
      }
    }

    step++
    saveContextSnapshot(ctx)
  }

  callbacks.onProgress(total, total)
  callbacks.onDone({
    pageUrl: ctx.pageUrl || "",
    audioUrl: ctx.audioUrl || "",
    date: ctx.date,
    youtubeUrl: ctx.youtubeUrl,
  })
}

function saveContextSnapshot(ctx: PipelineContext): void {
  try {
    const snapshotDir = path.join(os.tmpdir(), `yomoo-video-${ctx.date}`)
    fs.mkdirSync(snapshotDir, { recursive: true })
    saveContext(ctx, path.join(snapshotDir, "pipeline-context.json"))
  } catch {
    // Non-fatal: snapshot saving should never break the pipeline
  }
}
