import { loadChannelById } from "../pipeline/channel-loader"
import type { PipelineCallbacks, PipelineResult } from "../pipeline/orchestrator"
import { runPipeline as runPipelineOrchestrator } from "../pipeline/orchestrator"

export interface RunChannelOptions {
  dryRun?: boolean
  verbose?: boolean
  onStage?: (stage: string) => void
  onStatus?: (status: string) => void
  onProgress?: (step: number, total: number) => void
}

/**
 * Run the configured pipeline for a channel. Resolves with the final
 * PipelineResult or rejects with an Error describing the stage that failed.
 */
export function runChannelPipeline(
  channelId: string,
  options: RunChannelOptions = {},
): Promise<PipelineResult> {
  const channel = loadChannelById(channelId)
  if (!channel) {
    return Promise.reject(new Error(`Channel not found: ${channelId}`))
  }
  if (!channel.groupId) {
    return Promise.reject(
      new Error(
        `Channel "${channelId}" has no feed group. Add a feed with --channel ${channelId} first.`,
      ),
    )
  }

  return new Promise<PipelineResult>((resolve, reject) => {
    const callbacks: PipelineCallbacks = {
      onStage: (stage) => {
        if (options.verbose) console.info(`[stage] ${stage}`)
        options.onStage?.(stage)
      },
      onStatus: (status) => {
        if (options.verbose) console.info(`[status] ${status}`)
        options.onStatus?.(status)
      },
      onProgress: (step, total) => {
        if (options.verbose) console.info(`[progress] ${step}/${total}`)
        options.onProgress?.(step, total)
      },
      onDone: (result) => resolve(result),
      onError: (stage, error) => reject(new Error(`stage ${stage} failed: ${error}`)),
    }

    runPipelineOrchestrator(callbacks, channel.groupId, {
      dryRun: options.dryRun,
    }).catch((err: unknown) => reject(err instanceof Error ? err : new Error(String(err))))
  })
}
