import { create } from "zustand"

interface ReportState {
  showReport: boolean
  generating: boolean
  status: string
  content: string
  error: string | null

  setShowReport: (show: boolean) => void
  setGenerating: (generating: boolean) => void
  setStatus: (status: string) => void
  appendContent: (chunk: string) => void
  setContent: (content: string) => void
  setError: (error: string | null) => void
  reset: () => void

  startReport: () => Promise<void>
}

export const useReportStore = create<ReportState>((set, get) => ({
  showReport: false,
  generating: false,
  status: "",
  content: "",
  error: null,

  setShowReport: (show) => set({ showReport: show }),
  setGenerating: (generating) => set({ generating }),
  setStatus: (status) => set({ status }),
  appendContent: (chunk) => set((state) => ({ content: state.content + chunk })),
  setContent: (content) => set({ content }),
  setError: (error) => set({ error }),
  reset: () => set({ content: "", error: null, status: "", generating: false }),

  startReport: async () => {
    set({ generating: true, content: "", error: null, status: "Starting report generation..." })

    // Set up streaming listeners
    const removeChunkListener = window.api.onReportChunk((chunk: string) => {
      get().appendContent(chunk)
    })

    const removeStatusListener = window.api.onReportStatus((status: string) => {
      set({ status })
    })

    try {
      const result = await window.api.generateReport()
      if (!result.success) {
        set({ error: result.error || "Unknown error" })
      }
    } catch (err) {
      set({ error: `Failed to generate report: ${err}` })
    } finally {
      set({ generating: false, status: "" })
      removeChunkListener()
      removeStatusListener()
    }
  },
}))
