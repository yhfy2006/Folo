import { contextBridge, ipcRenderer } from "electron"

const api = {
  importOPML: () => ipcRenderer.invoke("import-opml"),
  getFeeds: () => ipcRenderer.invoke("get-feeds"),
  getEntries: (feedId?: string) => ipcRenderer.invoke("get-entries", feedId),
  getEntry: (entryId: string) => ipcRenderer.invoke("get-entry", entryId),
  markRead: (entryId: string) => ipcRenderer.invoke("mark-read", entryId),
  refreshFeeds: () => ipcRenderer.invoke("refresh-feeds"),
  deleteFeed: (feedId: string) => ipcRenderer.invoke("delete-feed", feedId),
  addFeed: (url: string, title?: string) => ipcRenderer.invoke("add-feed", url, title),
  getUnreadCounts: () => ipcRenderer.invoke("get-unread-counts"),

  // Feed Groups
  getFeedGroups: () => ipcRenderer.invoke("get-feed-groups"),
  getFeedGroup: (groupId: string) => ipcRenderer.invoke("get-feed-group", groupId),
  createFeedGroup: (name: string) => ipcRenderer.invoke("create-feed-group", name),
  updateFeedGroup: (groupId: string, updates: any) =>
    ipcRenderer.invoke("update-feed-group", groupId, updates),
  deleteFeedGroup: (groupId: string) => ipcRenderer.invoke("delete-feed-group", groupId),
  getGroupFeeds: (groupId: string) => ipcRenderer.invoke("get-group-feeds", groupId),
  addFeedsToGroup: (groupId: string, feedIds: string[]) =>
    ipcRenderer.invoke("add-feeds-to-group", groupId, feedIds),
  removeFeedFromGroup: (groupId: string, feedId: string) =>
    ipcRenderer.invoke("remove-feed-from-group", groupId, feedId),
  onFeedsUpdated: (callback: () => void) => {
    ipcRenderer.on("feeds-updated", callback)
    return () => ipcRenderer.removeListener("feeds-updated", callback)
  },

  // AI Report
  generateReport: () => ipcRenderer.invoke("generate-report"),
  getPreferences: () => ipcRenderer.invoke("get-preferences"),
  savePreferences: (prefs: any) => ipcRenderer.invoke("save-preferences", prefs),
  exportReport: (content: string) => ipcRenderer.invoke("export-report", content),
  getReports: () => ipcRenderer.invoke("get-reports"),
  getReport: (reportId: string) => ipcRenderer.invoke("get-report", reportId),
  deleteReport: (reportId: string) => ipcRenderer.invoke("delete-report", reportId),
  onReportChunk: (callback: (chunk: string) => void) => {
    const handler = (_event: any, chunk: string) => callback(chunk)
    ipcRenderer.on("report-chunk", handler)
    return () => ipcRenderer.removeListener("report-chunk", handler)
  },
  onReportStatus: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on("report-status", handler)
    return () => ipcRenderer.removeListener("report-status", handler)
  },
  onReportDone: (callback: () => void) => {
    ipcRenderer.on("report-done", callback)
    return () => ipcRenderer.removeListener("report-done", callback)
  },
  onReportError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error)
    ipcRenderer.on("report-error", handler)
    return () => ipcRenderer.removeListener("report-error", handler)
  },

  // Podcast Script
  generatePodcastScript: (reportContent: string) =>
    ipcRenderer.invoke("generate-podcast-script", reportContent),
  exportPodcastScript: (content: string) => ipcRenderer.invoke("export-podcast-script", content),
  onPodcastChunk: (callback: (chunk: string) => void) => {
    const handler = (_event: any, chunk: string) => callback(chunk)
    ipcRenderer.on("podcast-chunk", handler)
    return () => ipcRenderer.removeListener("podcast-chunk", handler)
  },
  onPodcastStatus: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on("podcast-status", handler)
    return () => ipcRenderer.removeListener("podcast-status", handler)
  },
  onPodcastDone: (callback: () => void) => {
    ipcRenderer.on("podcast-done", callback)
    return () => ipcRenderer.removeListener("podcast-done", callback)
  },
  onPodcastError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error)
    ipcRenderer.on("podcast-error", handler)
    return () => ipcRenderer.removeListener("podcast-error", handler)
  },

  // Audio TTS
  generateAudio: (text: string) => ipcRenderer.invoke("generate-audio", text),
  exportAudio: (sourcePath: string) => ipcRenderer.invoke("export-audio", sourcePath),
  getAudioData: (filePath: string) => ipcRenderer.invoke("get-audio-data", filePath),
  onAudioStatus: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on("audio-status", handler)
    return () => ipcRenderer.removeListener("audio-status", handler)
  },
  onAudioDone: (callback: (filePath: string) => void) => {
    const handler = (_event: any, filePath: string) => callback(filePath)
    ipcRenderer.on("audio-done", handler)
    return () => ipcRenderer.removeListener("audio-done", handler)
  },
  onAudioError: (callback: (error: string) => void) => {
    const handler = (_event: any, error: string) => callback(error)
    ipcRenderer.on("audio-error", handler)
    return () => ipcRenderer.removeListener("audio-error", handler)
  },

  // Subscriber Management
  listSubscribers: () => ipcRenderer.invoke("list-subscribers"),
  addSubscriber: (email: string) => ipcRenderer.invoke("add-subscriber", email),
  removeSubscriber: (email: string) => ipcRenderer.invoke("remove-subscriber", email),

  // YOMOO Pipeline
  runYomooPipeline: (groupId?: string) => ipcRenderer.invoke("run-yomoo-pipeline", groupId),
  runVideoOnly: () => ipcRenderer.invoke("run-yomoo-video-only"),
  onPipelineStage: (callback: (stage: string) => void) => {
    const handler = (_event: any, stage: string) => callback(stage)
    ipcRenderer.on("pipeline-stage", handler)
    return () => ipcRenderer.removeListener("pipeline-stage", handler)
  },
  onPipelineStatus: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status)
    ipcRenderer.on("pipeline-status", handler)
    return () => ipcRenderer.removeListener("pipeline-status", handler)
  },
  onPipelineProgress: (callback: (step: number, total: number) => void) => {
    const handler = (_event: any, step: number, total: number) => callback(step, total)
    ipcRenderer.on("pipeline-progress", handler)
    return () => ipcRenderer.removeListener("pipeline-progress", handler)
  },
  onPipelineDone: (
    callback: (result: {
      pageUrl: string
      audioUrl: string
      date: string
      youtubeUrl?: string
    }) => void,
  ) => {
    const handler = (
      _event: any,
      result: { pageUrl: string; audioUrl: string; date: string; youtubeUrl?: string },
    ) => callback(result)
    ipcRenderer.on("pipeline-done", handler)
    return () => ipcRenderer.removeListener("pipeline-done", handler)
  },
  onPipelineError: (callback: (stage: string, error: string) => void) => {
    const handler = (_event: any, stage: string, error: string) => callback(stage, error)
    ipcRenderer.on("pipeline-error", handler)
    return () => ipcRenderer.removeListener("pipeline-error", handler)
  },
  onPipelineAutoTrigger: (callback: () => void) => {
    ipcRenderer.on("pipeline-auto-trigger", callback)
    return () => ipcRenderer.removeListener("pipeline-auto-trigger", callback)
  },

  // Scheduler
  getSchedulerStatus: () => ipcRenderer.invoke("get-scheduler-status"),

  // YouTube
  youtubeGetAuthUrl: () => ipcRenderer.invoke("youtube-get-auth-url"),
  youtubeExchangeCode: (code: string) => ipcRenderer.invoke("youtube-exchange-code", code),
  youtubeCheckConnection: () => ipcRenderer.invoke("youtube-check-connection"),
}

contextBridge.exposeInMainWorld("api", api)

export type SimpleReaderAPI = typeof api
