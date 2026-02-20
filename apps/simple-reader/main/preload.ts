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
}

contextBridge.exposeInMainWorld("api", api)

export type SimpleReaderAPI = typeof api
