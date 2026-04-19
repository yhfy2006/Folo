import { loadChannelById } from "../pipeline/channel-loader"
import { loadProcessedVideos } from "../pipeline/signalist-dedup"
import { getSchedulerStatus } from "../pipeline-scheduler"

export interface ChannelStatus {
  channelId: string
  name: string
  pipelineType: string
  groupId: string
  processedCount: number
  processedVideos: Array<{ videoId: string; date: string }>
  scheduler: ReturnType<typeof getSchedulerStatus>
}

export function getChannelStatus(channelId: string): ChannelStatus {
  const channel = loadChannelById(channelId)
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  const processed = loadProcessedVideos(channelId)
  const processedVideos = Object.entries(processed)
    .map(([videoId, date]) => ({ videoId, date }))
    .sort((a, b) => b.date.localeCompare(a.date))

  return {
    channelId: channel.id,
    name: channel.name,
    pipelineType: channel.pipelineType ?? "standard",
    groupId: channel.groupId,
    processedCount: processedVideos.length,
    processedVideos,
    scheduler: getSchedulerStatus(),
  }
}
