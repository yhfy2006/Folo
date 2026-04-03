import { generateAudioToFile } from "../../tts"
import type { PipelineContext } from "../context"
import type { StageCallbacks, StageDefinition } from "../types"

export const audioStage: StageDefinition = {
  name: "audio",
  label: "Generate Audio",
  shouldRun: (_ctx: PipelineContext) => true,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Generating audio...")

    if (!ctx.prefs.minimaxApiKey) {
      throw new Error("MiniMax API Key not configured. Please set it in Preferences.")
    }

    let audioFilePath: string
    let ttsSubtitles: import("../../tts").SubtitleSegment[] | undefined
    try {
      const ttsResult = await generateAudioToFile(ctx.podcastScript!, (status) => {
        callbacks.onStatus(status)
      })
      audioFilePath = ttsResult.filePath
      ttsSubtitles = ttsResult.subtitles
      if (ttsSubtitles) {
        console.info(`[audio] MiniMax returned ${ttsSubtitles.length} subtitle segments`)
      }
    } catch (err) {
      throw new Error(`Audio generation failed: ${err}`)
    }

    return { ...ctx, audioFilePath, ttsSubtitles }
  },
}
