import { create } from "zustand"

function formatLogTime(): string {
  const now = new Date()
  return `[${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}]`
}

interface ReportState {
  showReport: boolean
  generating: boolean
  status: string
  content: string
  error: string | null

  // Podcast script state
  podcastContent: string
  podcastGenerating: boolean
  podcastStatus: string
  podcastError: string | null
  showPodcast: boolean

  // Audio TTS state
  audioGenerating: boolean
  audioStatus: string
  audioError: string | null
  audioFilePath: string | null

  // Pipeline state
  pipelineRunning: boolean
  pipelineStage: string
  pipelineStatus: string
  pipelineLogs: string[]
  pipelineStep: number
  pipelineTotal: number
  pipelineError: string | null
  pipelineErrorStage: string | null
  pipelineResult: { pageUrl: string; audioUrl: string; date: string } | null

  setShowReport: (show: boolean) => void
  setGenerating: (generating: boolean) => void
  setStatus: (status: string) => void
  appendContent: (chunk: string) => void
  setContent: (content: string) => void
  setError: (error: string | null) => void
  reset: () => void

  startReport: () => Promise<void>
  startPodcastScript: (reportContent: string) => Promise<void>
  resetPodcast: () => void
  setShowPodcast: (show: boolean) => void
  setPodcastContent: (content: string) => void
  startAudioGeneration: (text: string) => Promise<void>
  resetAudio: () => void

  startPipeline: () => Promise<void>
  resetPipeline: () => void
}

export const useReportStore = create<ReportState>((set, get) => ({
  showReport: false,
  generating: false,
  status: "",
  content: "",
  error: null,

  podcastContent: "",
  podcastGenerating: false,
  podcastStatus: "",
  podcastError: null,
  showPodcast: false,

  audioGenerating: false,
  audioStatus: "",
  audioError: null,
  audioFilePath: null,

  pipelineRunning: false,
  pipelineStage: "",
  pipelineStatus: "",
  pipelineLogs: [],
  pipelineStep: 0,
  pipelineTotal: 5,
  pipelineError: null,
  pipelineErrorStage: null,
  pipelineResult: null,

  setShowReport: (show) => set({ showReport: show }),
  setGenerating: (generating) => set({ generating }),
  setStatus: (status) => set({ status }),
  appendContent: (chunk) => set((state) => ({ content: state.content + chunk })),
  setContent: (content) => set({ content }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      content: "",
      error: null,
      status: "",
      generating: false,
      podcastContent: "",
      podcastGenerating: false,
      podcastStatus: "",
      podcastError: null,
      showPodcast: false,
      audioGenerating: false,
      audioStatus: "",
      audioError: null,
      audioFilePath: null,
    }),

  setShowPodcast: (show) => set({ showPodcast: show }),
  setPodcastContent: (content) => set({ podcastContent: content }),
  resetPodcast: () =>
    set({
      podcastContent: "",
      podcastGenerating: false,
      podcastStatus: "",
      podcastError: null,
      showPodcast: false,
      audioGenerating: false,
      audioStatus: "",
      audioError: null,
      audioFilePath: null,
    }),

  resetAudio: () =>
    set({
      audioGenerating: false,
      audioStatus: "",
      audioError: null,
      audioFilePath: null,
    }),

  startReport: async () => {
    set({ generating: true, content: "", error: null, status: "Starting report generation..." })

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

  startPodcastScript: async (reportContent: string) => {
    set({
      podcastGenerating: true,
      podcastContent: "",
      podcastError: null,
      podcastStatus: "Starting podcast script conversion...",
      showPodcast: true,
      audioGenerating: false,
      audioStatus: "",
      audioError: null,
      audioFilePath: null,
    })

    const removeChunkListener = window.api.onPodcastChunk((chunk: string) => {
      set((state) => ({ podcastContent: state.podcastContent + chunk }))
    })

    const removeStatusListener = window.api.onPodcastStatus((status: string) => {
      set({ podcastStatus: status })
    })

    const removeDoneListener = window.api.onPodcastDone(() => {
      // handled by finally
    })

    const removeErrorListener = window.api.onPodcastError((error: string) => {
      set({ podcastError: error })
    })

    try {
      const result = await window.api.generatePodcastScript(reportContent)
      if (!result.success) {
        set({ podcastError: result.error || "Unknown error" })
      }
    } catch (err) {
      set({ podcastError: `Failed to generate podcast script: ${err}` })
    } finally {
      set({ podcastGenerating: false, podcastStatus: "" })
      removeChunkListener()
      removeStatusListener()
      removeDoneListener()
      removeErrorListener()
    }
  },

  resetPipeline: () =>
    set({
      pipelineRunning: false,
      pipelineStage: "",
      pipelineStatus: "",
      pipelineLogs: [],
      pipelineStep: 0,
      pipelineError: null,
      pipelineErrorStage: null,
      pipelineResult: null,
    }),

  startPipeline: async () => {
    set({
      pipelineRunning: true,
      pipelineStage: "",
      pipelineStatus: "Starting YOMOO Pipeline...",
      pipelineLogs: [`${formatLogTime()} Starting YOMOO Pipeline...`],
      pipelineStep: 0,
      pipelineError: null,
      pipelineErrorStage: null,
      pipelineResult: null,
    })

    const removeStageListener = window.api.onPipelineStage((stage: string) => {
      set((state) => ({
        pipelineStage: stage,
        pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ▶ Stage: ${stage}`],
      }))
    })

    const removeStatusListener = window.api.onPipelineStatus((status: string) => {
      set((state) => ({
        pipelineStatus: status,
        pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ${status}`],
      }))
    })

    const removeProgressListener = window.api.onPipelineProgress((step: number, total: number) => {
      set({ pipelineStep: step, pipelineTotal: total })
    })

    const removeDoneListener = window.api.onPipelineDone(
      (result: { pageUrl: string; audioUrl: string; date: string }) => {
        set((state) => ({
          pipelineResult: result,
          pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ✓ Pipeline complete!`],
        }))
      },
    )

    const removeErrorListener = window.api.onPipelineError((stage: string, error: string) => {
      set((state) => ({
        pipelineError: error,
        pipelineErrorStage: stage,
        pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ✗ Error [${stage}]: ${error}`],
      }))
    })

    try {
      const result = await window.api.runYomooPipeline()
      if (!result.success) {
        const errorMsg = result.error || "Unknown error"
        set((state) => ({
          pipelineError: errorMsg,
          pipelineErrorStage: state.pipelineErrorStage || "init",
          pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ✗ ${errorMsg}`],
        }))
      }
    } catch (err) {
      const errorMsg = `Pipeline failed: ${err}`
      set((state) => ({
        pipelineError: errorMsg,
        pipelineErrorStage: "init",
        pipelineLogs: [...state.pipelineLogs, `${formatLogTime()} ✗ ${errorMsg}`],
      }))
    } finally {
      set({ pipelineRunning: false })
      removeStageListener()
      removeStatusListener()
      removeProgressListener()
      removeDoneListener()
      removeErrorListener()
    }
  },

  startAudioGeneration: async (text: string) => {
    set({
      audioGenerating: true,
      audioStatus: "Starting audio generation...",
      audioError: null,
      audioFilePath: null,
    })

    const removeStatusListener = window.api.onAudioStatus((status: string) => {
      set({ audioStatus: status })
    })

    const removeDoneListener = window.api.onAudioDone((filePath: string) => {
      set({ audioFilePath: filePath })
    })

    const removeErrorListener = window.api.onAudioError((error: string) => {
      set({ audioError: error })
    })

    try {
      const result = await window.api.generateAudio(text)
      if (!result.success) {
        set({ audioError: result.error || "Unknown error" })
      }
    } catch (err) {
      set({ audioError: `Failed to generate audio: ${err}` })
    } finally {
      set({ audioGenerating: false, audioStatus: "" })
      removeStatusListener()
      removeDoneListener()
      removeErrorListener()
    }
  },
}))
