import { create } from "zustand"

export interface Channel {
  id: string
  name: string
  language: string
  groupId: string
  tts: { provider: string; voiceId: string; model: string; speed?: number }
  youtube?: {
    channelId?: string
    tags: string[]
    titleTemplate: string
    descriptionTemplate?: string
    shortsDescriptionTemplate?: string
  }
  web?: {
    htmlLang: string
    brandName: string
    ogTitle?: string
    footerCta?: string
  }
  stages: string[]
  promptDir: string
  skillsDir: string
}

type View = "dashboard" | "channel-detail"
type TabId = "overview" | "feeds" | "pipeline" | "reports" | "settings"
type SettingsSubNav = "general" | "tts" | "youtube" | "prompts" | "stages"

interface ChannelState {
  channels: Channel[]
  selectedChannelId: string | null
  view: View
  activeTab: TabId
  settingsSubNav: SettingsSubNav
  loading: boolean

  loadChannels: () => Promise<void>
  selectChannel: (id: string) => void
  goToDashboard: () => void
  setActiveTab: (tab: TabId) => void
  setSettingsSubNav: (sub: SettingsSubNav) => void
  createChannel: (id: string, name: string, language: string, groupId: string) => Promise<Channel>
  updateChannel: (channelId: string, updates: Partial<Channel>) => Promise<void>
  deleteChannel: (channelId: string) => Promise<void>
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  selectedChannelId: null,
  view: "dashboard",
  activeTab: "overview",
  settingsSubNav: "general",
  loading: false,

  loadChannels: async () => {
    set({ loading: true })
    const channels = await window.api.getChannels()
    set({ channels, loading: false })
  },

  selectChannel: (id) => {
    set({
      selectedChannelId: id,
      view: "channel-detail",
      activeTab: "overview",
    })
  },

  goToDashboard: () => {
    set({
      selectedChannelId: null,
      view: "dashboard",
    })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSettingsSubNav: (sub) => set({ settingsSubNav: sub }),

  createChannel: async (id, name, language, groupId) => {
    const channel = await window.api.createChannel(id, name, language, groupId)
    await get().loadChannels()
    return channel
  },

  updateChannel: async (channelId, updates) => {
    await window.api.updateChannel(channelId, updates)
    await get().loadChannels()
  },

  deleteChannel: async (channelId) => {
    await window.api.deleteChannel(channelId)
    set({ selectedChannelId: null, view: "dashboard" })
    await get().loadChannels()
  },
}))
