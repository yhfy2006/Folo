import fs from "node:fs"

import { createReleaseWithAudio } from "../../github"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const uploadStage: StageDefinition = {
  name: "upload",
  label: "Upload Audio to GitHub Release",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Uploading audio to GitHub...")

    let audioUrl: string
    try {
      const audioBuffer = fs.readFileSync(ctx.audioFilePath!)
      const fileName = `yomoo-${ctx.date}.mp3`
      const tag = `v${ctx.date}`
      const title = `YOMOO 每日AI快送 - ${ctx.date}`

      audioUrl = await createReleaseWithAudio(
        ctx.prefs.githubToken,
        ctx.owner!,
        tag,
        title,
        audioBuffer,
        fileName,
      )
    } catch (err) {
      throw new Error(`Audio upload failed: ${err}`)
    }

    return { ...ctx, audioUrl }
  },
}
