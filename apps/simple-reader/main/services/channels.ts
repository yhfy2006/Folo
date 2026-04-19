import {
  loadAllChannels as loaderLoadAll,
  loadChannelById as loaderLoadById,
} from "../pipeline/channel-loader"
import type { Channel } from "../pipeline/channel-types"

export function listChannels(): Channel[] {
  return loaderLoadAll()
}

export function getChannel(channelId: string): Channel | null {
  return loaderLoadById(channelId)
}
