import { marked } from "marked"
import * as React from "react"
import { useCallback, useEffect, useRef } from "react"

import { useGroupStore } from "../stores/group-store"
import { useReportStore } from "../stores/report-store"

export function ReportView() {
  const { selectedGroupId } = useGroupStore()
  const {
    generating,
    status,
    content,
    error,
    startReport,
    reset,
    podcastContent,
    podcastGenerating,
    podcastStatus,
    podcastError,
    showPodcast,
    startPodcastScript,
    resetPodcast,
    setShowPodcast,
    audioGenerating,
    audioStatus,
    audioError,
    audioFilePath,
    startAudioGeneration,
    resetAudio: _resetAudio,
    pipelineRunning,
    pipelineStage,
    pipelineStatus,
    pipelineStep,
    pipelineTotal,
    pipelineError,
    pipelineErrorStage,
    pipelineResult,
    pipelineLogs,
    startPipeline,
    resetPipeline,
  } = useReportStore()
  const contentRef = useRef<HTMLDivElement>(null)
  const [showPreferences, setShowPreferences] = React.useState(false)

  // Auto-scroll to bottom while generating
  useEffect(() => {
    if ((generating || podcastGenerating) && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, generating, podcastContent, podcastGenerating])

  // Listen for scheduled auto-trigger from main process
  useEffect(() => {
    const cleanup = window.api.onPipelineAutoTrigger((groupId?: string) => {
      if (!pipelineRunning) {
        console.info(
          "[auto-trigger] Scheduled pipeline triggered",
          groupId ? `for group ${groupId}` : "",
        )
        startPipeline(groupId)
      }
    })
    return cleanup
  }, [pipelineRunning, startPipeline])

  const handleExport = useCallback(async () => {
    if (!content) return
    await window.api.exportReport(content)
  }, [content])

  const handleExportPodcast = useCallback(async () => {
    if (!podcastContent) return
    await window.api.exportPodcastScript(podcastContent)
  }, [podcastContent])

  const handleExportAudio = useCallback(async () => {
    if (!audioFilePath) return
    await window.api.exportAudio(audioFilePath)
  }, [audioFilePath])

  const handleRegenerate = useCallback(() => {
    reset()
    startReport(selectedGroupId || undefined)
  }, [reset, startReport, selectedGroupId])

  const handleConvertToPodcast = useCallback(() => {
    if (!content) return
    startPodcastScript(content)
  }, [content, startPodcastScript])

  const handleBackFromPodcast = useCallback(() => {
    resetPodcast()
  }, [resetPodcast])

  const handleGenerateAudio = useCallback(
    (text?: string) => {
      const source = text || podcastContent || content
      if (!source) return
      startAudioGeneration(source)
    },
    [podcastContent, content, startAudioGeneration],
  )

  // Podcast script view
  if (showPodcast) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-4">
          <div className="flex items-center gap-2">
            {!podcastGenerating && (
              <button
                onClick={handleBackFromPodcast}
                className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
                title="Back to report"
              >
                ←
              </button>
            )}
            <div>
              <h2 className="text-lg font-semibold">Podcast Script</h2>
              {(podcastStatus || audioStatus) && (
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {audioStatus || podcastStatus}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {podcastContent && !podcastGenerating && (
              <>
                {!audioGenerating && !audioFilePath && (
                  <button
                    onClick={handleGenerateAudio}
                    className="rounded border border-purple-500 px-2 py-1 text-xs text-purple-600 hover:bg-purple-500/10 dark:text-purple-400"
                    title="Generate audio from script"
                  >
                    Generate Audio
                  </button>
                )}
                {audioFilePath && (
                  <button
                    onClick={handleExportAudio}
                    className="rounded border border-purple-500 px-2 py-1 text-xs text-purple-600 hover:bg-purple-500/10 dark:text-purple-400"
                  >
                    Export .mp3
                  </button>
                )}
                <button
                  onClick={handleExportPodcast}
                  className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
                >
                  Export .txt
                </button>
                <button
                  onClick={() => {
                    resetPodcast()
                    setShowPodcast(true)
                    startPodcastScript(content)
                  }}
                  className="rounded bg-[color:var(--accent-color)] px-3 py-1 text-xs text-white hover:opacity-90"
                >
                  Regenerate
                </button>
              </>
            )}
          </div>
        </div>

        <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
          {podcastError && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {podcastError}
            </div>
          )}

          {audioError && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {audioError}
            </div>
          )}

          {/* Audio player */}
          {audioFilePath && (
            <div className="mx-auto mb-6 max-w-2xl">
              <AudioPlayer filePath={audioFilePath} onExport={handleExportAudio} />
            </div>
          )}

          {/* Audio generating spinner */}
          {audioGenerating && !audioFilePath && (
            <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-[hsl(var(--border))] p-4">
              <div className="flex items-center gap-3">
                <div className="size-5 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-purple-500" />
                <div>
                  <p className="text-xs font-medium">{audioStatus || "Generating audio..."}</p>
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                    This may take a while for long scripts
                  </p>
                </div>
              </div>
            </div>
          )}

          {podcastGenerating && !podcastContent && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <div className="size-12 animate-spin rounded-full border-4 border-[hsl(var(--border))] border-t-[color:var(--accent-color)]" />
              </div>
              <h3 className="text-sm font-medium">
                {podcastStatus || "Converting to podcast script..."}
              </h3>
              <p className="mt-2 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">
                Claude is converting your report into a broadcast-ready script...
              </p>
            </div>
          )}

          {podcastContent && (
            <div className="mx-auto max-w-2xl whitespace-pre-wrap text-[15px] leading-[1.8]">
              {podcastContent}
              {podcastGenerating && (
                <span className="inline-block h-4 w-1 animate-pulse bg-[color:var(--accent-color)]" />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] p-4">
        <div className="flex items-center gap-2">
          {content && !generating && (
            <button
              onClick={reset}
              className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
              title="Back to report list"
            >
              ←
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold">AI Daily Report</h2>
            {status && (
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{status}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreferences(true)}
            className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
            title="Preferences"
          >
            ⚙
          </button>
          {content && !generating && (
            <>
              {!audioGenerating && !audioFilePath && (
                <button
                  onClick={() => handleGenerateAudio(content)}
                  className="rounded border border-purple-500 px-2 py-1 text-xs text-purple-600 hover:bg-purple-500/10 dark:text-purple-400"
                  title="Generate audio from report"
                >
                  Generate Audio
                </button>
              )}
              {audioFilePath && (
                <button
                  onClick={handleExportAudio}
                  className="rounded border border-purple-500 px-2 py-1 text-xs text-purple-600 hover:bg-purple-500/10 dark:text-purple-400"
                >
                  Export .mp3
                </button>
              )}
              <button
                onClick={handleConvertToPodcast}
                className="hover:bg-[color:var(--accent-color)]/10 rounded border border-[color:var(--accent-color)] px-2 py-1 text-xs text-[color:var(--accent-color)]"
                title="Convert to podcast script"
              >
                Podcast
              </button>
              <button
                onClick={handleExport}
                className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
              >
                Export .md
              </button>
              <button
                onClick={handleRegenerate}
                className="rounded bg-[color:var(--accent-color)] px-3 py-1 text-xs text-white hover:opacity-90"
              >
                Regenerate
              </button>
            </>
          )}
          {!generating && !content && (
            <button
              onClick={() => startReport(selectedGroupId || undefined)}
              className="rounded bg-[color:var(--accent-color)] px-3 py-1 text-xs text-white hover:opacity-90"
            >
              Generate Report
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {audioError && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {audioError}
          </div>
        )}

        {/* Audio player in report view */}
        {audioFilePath && content && (
          <div className="mx-auto mb-6 max-w-2xl">
            <AudioPlayer filePath={audioFilePath} onExport={handleExportAudio} />
          </div>
        )}

        {/* Audio generating spinner in report view */}
        {audioGenerating && !audioFilePath && content && (
          <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-[hsl(var(--border))] p-4">
            <div className="flex items-center gap-3">
              <div className="size-5 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-purple-500" />
              <div>
                <p className="text-xs font-medium">{audioStatus || "Generating audio..."}</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  This may take a while for long text
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pipeline UI */}
        {(pipelineRunning || pipelineResult || pipelineError) && (
          <PipelineView
            running={pipelineRunning}
            stage={pipelineStage}
            status={pipelineStatus}
            logs={pipelineLogs}
            step={pipelineStep}
            total={pipelineTotal}
            error={pipelineError}
            errorStage={pipelineErrorStage}
            result={pipelineResult}
            onReset={resetPipeline}
          />
        )}

        {!content &&
          !generating &&
          !error &&
          !pipelineRunning &&
          !pipelineResult &&
          !pipelineError && (
            <ReportHistory
              onGenerate={() => startReport(selectedGroupId || undefined)}
              onStartPipeline={() => startPipeline(selectedGroupId || undefined)}
              onStartVideoOnly={useReportStore.getState().startVideoOnly}
              groupId={selectedGroupId}
            />
          )}

        {generating && !content && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <div className="size-12 animate-spin rounded-full border-4 border-[hsl(var(--border))] border-t-[color:var(--accent-color)]" />
            </div>
            <h3 className="text-sm font-medium">{status || "Preparing..."}</h3>
            <p className="mt-2 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">
              This may take a minute. Claude is analyzing your feed entries...
            </p>
            <div className="mt-4 flex items-center gap-2">
              <StageIndicator status={status} />
            </div>
          </div>
        )}

        {content && (
          <div className="article-content mx-auto max-w-2xl">
            <MarkdownRenderer content={content} />
            {generating && (
              <span className="inline-block h-4 w-1 animate-pulse bg-[color:var(--accent-color)]" />
            )}
          </div>
        )}
      </div>

      {/* Preferences dialog */}
      {showPreferences && <PreferencesDialog onClose={() => setShowPreferences(false)} />}
    </div>
  )
}

interface SavedReport {
  id: string
  title: string
  language: string
  time_range: number
  entry_count: number
  type: string
  group_id: string | null
  created_at: number
}

function ReportHistory({
  onGenerate,
  onStartPipeline,
  onStartVideoOnly,
  groupId,
}: {
  onGenerate: () => void
  onStartPipeline: () => void
  onStartVideoOnly: () => void
  groupId?: string | null
}) {
  const [reports, setReports] = React.useState<SavedReport[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const { setContent, setPodcastContent, setShowPodcast } = useReportStore()

  React.useEffect(() => {
    window.api.getReports(groupId || undefined).then((r: SavedReport[]) => {
      setReports(r)
      setLoaded(true)
    })
  }, [groupId])

  const handleView = async (reportId: string, type: string) => {
    const report = await window.api.getReport(reportId)
    if (report) {
      if (type === "podcast") {
        setPodcastContent(report.content)
        setShowPodcast(true)
      } else {
        setContent(report.content)
      }
    }
  }

  const handleDelete = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation()
    await window.api.deleteReport(reportId)
    setReports((prev) => prev.filter((r) => r.id !== reportId))
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <h3 className="text-sm font-medium">AI Daily Briefing</h3>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
          Generate a new report or view past reports.
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={onGenerate}
            className="rounded bg-[color:var(--accent-color)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Generate New Report
          </button>
          <button
            onClick={onStartPipeline}
            className="rounded px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #FF6B35, #ff8f5e)" }}
          >
            YOMOO Pipeline
          </button>
          <button
            onClick={onStartVideoOnly}
            className="rounded px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #8B5CF6, #a78bfa)" }}
          >
            Video Only
          </button>
        </div>
      </div>

      {loaded && reports.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Past Reports
          </h4>
          <div className="space-y-1">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => handleView(report.id, report.type)}
                className="group flex w-full items-center justify-between rounded border border-[hsl(var(--border))] px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted))]"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    {report.type === "podcast" && (
                      <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-600 dark:text-purple-400">
                        Podcast
                      </span>
                    )}
                    {report.title}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                    {formatDate(report.created_at)}
                    {report.type !== "podcast" &&
                      ` · ${report.entry_count} articles · ${report.time_range}h range`}
                  </div>
                </div>
                <span
                  onClick={(e) => handleDelete(e, report.id)}
                  className="hidden rounded p-1 text-xs text-[hsl(var(--muted-foreground))] hover:bg-red-500/20 hover:text-red-500 group-hover:block"
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PipelineView({
  running,
  stage,
  status,
  logs,
  step: _step,
  total,
  error,
  errorStage,
  result,
  onReset,
}: {
  running: boolean
  stage: string
  status: string
  logs: string[]
  step: number
  total: number
  error: string | null
  errorStage: string | null
  result: { pageUrl: string; audioUrl: string; date: string; youtubeUrl?: string } | null
  onReset: () => void
}) {
  const logEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  // Dynamic stages based on total step count from pipeline
  const baseStages = [
    { key: "verify", label: "Verify" },
    { key: "report", label: "Report" },
    { key: "podcast", label: "Podcast" },
    { key: "audio", label: "Audio" },
    { key: "upload", label: "Upload" },
    { key: "publish", label: "Publish" },
  ]

  const videoStage = { key: "video", label: "Video" }
  const youtubeStage = { key: "youtube", label: "YouTube" }

  const stages = React.useMemo(() => {
    const s = [...baseStages]
    // total > 6 means video is enabled; total > 7 means youtube is also enabled
    if (total > 6) s.push(videoStage)
    if (total > 7) s.push(youtubeStage)
    return s
  }, [total])

  const currentIdx = stages.findIndex((s) => s.key === stage)

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6 text-center">
        <h3 className="text-lg font-bold" style={{ color: "#FF6B35" }}>
          YOMOO 每日AI快送
        </h3>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">One-Click Pipeline</p>
      </div>

      {/* Stage Progress */}
      <div className="mb-6 flex items-center justify-center gap-1">
        {stages.map((s, i) => {
          const isActive = s.key === stage
          const isDone = i < currentIdx || (result && !error)
          const isFailed = error && s.key === errorStage
          return (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex size-7 items-center justify-center rounded-full text-[10px] font-bold ${
                    isFailed
                      ? "bg-red-500 text-white"
                      : isDone
                        ? "text-white"
                        : isActive
                          ? "animate-pulse text-white"
                          : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
                  }`}
                  style={
                    isDone
                      ? { background: "#22c55e" }
                      : isActive && !isFailed
                        ? { background: "#FF6B35" }
                        : undefined
                  }
                >
                  {isFailed ? "!" : isDone ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[9px] ${isActive ? "font-semibold" : "text-[hsl(var(--muted-foreground))]"}`}
                >
                  {s.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div
                  className={`mb-4 h-0.5 w-4 ${
                    i < currentIdx || (result && !error)
                      ? "bg-green-500"
                      : "bg-[hsl(var(--border))]"
                  }`}
                />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Live Log Console */}
      {(running || logs.length > 0) && (
        <div className="mb-6">
          {running && (
            <div className="mb-3 flex items-center justify-center gap-2">
              <div
                className="size-4 animate-spin rounded-full border-2 border-[hsl(var(--border))]"
                style={{ borderTopColor: "#FF6B35" }}
              />
              <p className="text-xs font-medium" style={{ color: "#FF6B35" }}>
                {status}
              </p>
            </div>
          )}
          <div className="max-h-48 overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 font-mono text-[11px] leading-5 text-[hsl(var(--muted-foreground))]">
            {logs.map((log, i) => {
              const isStage = log.includes("▶ Stage:")
              return (
                <div
                  key={i}
                  className={isStage ? "mt-1 font-semibold" : ""}
                  style={isStage ? { color: "#FF6B35" } : undefined}
                >
                  {log}
                </div>
              )
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            Failed at: {errorStage}
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={onReset}
            className="mt-3 rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Success */}
      {result && !error && (
        <div
          className="rounded-lg border p-6"
          style={{ borderColor: "rgba(255,107,53,0.3)", background: "rgba(255,107,53,0.05)" }}
        >
          <div className="mb-4 text-center">
            <span className="text-2xl">🎉</span>
            <h4 className="mt-1 text-sm font-semibold">Pipeline Complete!</h4>
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              Episode {result.date} published successfully
            </p>
          </div>

          <div className="space-y-2">
            <a
              href={result.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #FF6B35, #ff8f5e)" }}
            >
              View Published Page
            </a>
            <a
              href={result.audioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-[hsl(var(--muted))]"
              style={{ borderColor: "#FF6B35", color: "#FF6B35" }}
            >
              Download Audio
            </a>
            {result.youtubeUrl && (
              <a
                href={result.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg border border-red-500 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10"
              >
                YouTube Video
              </a>
            )}
          </div>

          <p className="mt-4 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
            GitHub Pages may take 1-2 minutes to deploy
          </p>

          <div className="mt-4 text-center">
            <button
              onClick={onReset}
              className="text-xs text-[hsl(var(--muted-foreground))] hover:underline"
            >
              Back to Reports
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StageIndicator({ status }: { status: string }) {
  const stages = [
    { key: "screening", label: "Screening entries" },
    { key: "deep reading", label: "Deep reading" },
    { key: "generating", label: "Writing report" },
  ]

  const currentStage = stages.findIndex((s) => status.toLowerCase().includes(s.key.toLowerCase()))

  return (
    <div className="flex items-center gap-3">
      {stages.map((stage, i) => {
        const isActive = i === currentStage
        const isDone = i < currentStage
        return (
          <div key={stage.key} className="flex items-center gap-1.5">
            <div
              className={`size-2 rounded-full ${
                isActive
                  ? "animate-pulse bg-[color:var(--accent-color)]"
                  : isDone
                    ? "bg-green-500"
                    : "bg-[hsl(var(--border))]"
              }`}
            />
            <span
              className={`text-[10px] ${
                isActive
                  ? "font-medium text-[color:var(--accent-color)]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              {stage.label}
            </span>
            {i < stages.length - 1 && <span className="text-[hsl(var(--border))]">—</span>}
          </div>
        )
      })}
    </div>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  const html = React.useMemo(() => {
    try {
      return marked.parse(content, { async: false, breaks: true }) as string
    } catch {
      return content
    }
  }, [content])

  return <div className="report-content" dangerouslySetInnerHTML={{ __html: html }} />
}

function AudioPlayer({ filePath, onExport }: { filePath: string; onExport: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [audioSrc, setAudioSrc] = React.useState<string | null>(null)

  // Load audio data via IPC (file:// is blocked by Electron security)
  React.useEffect(() => {
    window.api.getAudioData(filePath).then((dataUrl: string | null) => {
      if (dataUrl) setAudioSrc(dataUrl)
    })
  }, [filePath])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  if (!audioSrc) {
    return (
      <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <div className="size-4 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-purple-500" />
          Loading audio...
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-500 text-white hover:bg-purple-600"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={(e) => {
              const t = Number(e.target.value)
              if (audioRef.current) audioRef.current.currentTime = t
              setCurrentTime(t)
            }}
            className="h-1 w-full cursor-pointer accent-purple-500"
          />
        </div>
        <button
          onClick={onExport}
          className="shrink-0 rounded border border-purple-500/50 px-2 py-1 text-[10px] text-purple-600 hover:bg-purple-500/10 dark:text-purple-400"
        >
          Export
        </button>
      </div>
    </div>
  )
}

// Inline PreferencesDialog component
function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = React.useState({
    language: "en",
    interests: [] as string[],
    reportStyle: "detailed" as "concise" | "detailed",
    timeRange: 24,
    minimaxApiKey: "",
    ttsVoiceId: "English_Graceful_Lady",
    ttsModel: "speech-2.8-hd",
    githubToken: "",
    githubOwner: "",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
  })
  const [newInterest, setNewInterest] = React.useState("")
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    window.api.getPreferences().then((p: typeof prefs) => {
      setPrefs(p)
      setLoaded(true)
    })
  }, [])

  const handleSave = async () => {
    await window.api.savePreferences(prefs)
    onClose()
  }

  const addInterest = () => {
    const trimmed = newInterest.trim()
    if (trimmed && !prefs.interests.includes(trimmed)) {
      setPrefs({ ...prefs, interests: [...prefs.interests, trimmed] })
      setNewInterest("")
    }
  }

  const removeInterest = (interest: string) => {
    setPrefs({ ...prefs, interests: prefs.interests.filter((i) => i !== interest) })
  }

  if (!loaded) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-96 overflow-y-auto rounded-lg bg-[hsl(var(--background))] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-sm font-semibold">Report Preferences</h3>

        {/* Language */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Report Language
          </label>
          <select
            value={prefs.language}
            onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none"
          >
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
          </select>
        </div>

        {/* Report Style */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Report Style
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setPrefs({ ...prefs, reportStyle: "concise" })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs ${
                prefs.reportStyle === "concise"
                  ? "bg-[color:var(--accent-color)]/10 border-[color:var(--accent-color)] text-[color:var(--accent-color)]"
                  : "border-[hsl(var(--border))]"
              }`}
            >
              Concise
            </button>
            <button
              onClick={() => setPrefs({ ...prefs, reportStyle: "detailed" })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs ${
                prefs.reportStyle === "detailed"
                  ? "bg-[color:var(--accent-color)]/10 border-[color:var(--accent-color)] text-[color:var(--accent-color)]"
                  : "border-[hsl(var(--border))]"
              }`}
            >
              Detailed
            </button>
          </div>
        </div>

        {/* Time Range */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Time Range
          </label>
          <div className="flex gap-2">
            {[12, 24, 48].map((hours) => (
              <button
                key={hours}
                onClick={() => setPrefs({ ...prefs, timeRange: hours })}
                className={`flex-1 rounded border px-2 py-1.5 text-xs ${
                  prefs.timeRange === hours
                    ? "bg-[color:var(--accent-color)]/10 border-[color:var(--accent-color)] text-[color:var(--accent-color)]"
                    : "border-[hsl(var(--border))]"
                }`}
              >
                {hours}h
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Interests / Focus Areas
          </label>
          <div className="mb-2 flex flex-wrap gap-1">
            {prefs.interests.map((interest) => (
              <span
                key={interest}
                className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs"
              >
                {interest}
                <button
                  onClick={() => removeInterest(interest)}
                  className="text-[hsl(var(--muted-foreground))] hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={newInterest}
              onChange={(e) => setNewInterest(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addInterest()}
              placeholder="Add interest (e.g., AI, Startups)..."
              className="flex-1 rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs outline-none focus:border-[color:var(--accent-color)]"
            />
            <button
              onClick={addInterest}
              className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]"
            >
              Add
            </button>
          </div>
        </div>

        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
          TTS (MiniMax)
        </h4>

        {/* MiniMax API Key */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            MiniMax API Key
          </label>
          <input
            type="password"
            value={prefs.minimaxApiKey}
            onChange={(e) => setPrefs({ ...prefs, minimaxApiKey: e.target.value })}
            placeholder="Enter your MiniMax API key..."
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Get your API key from platform.minimax.io
          </p>
        </div>

        {/* TTS Model */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            TTS Model
          </label>
          <select
            value={prefs.ttsModel}
            onChange={(e) => setPrefs({ ...prefs, ttsModel: e.target.value })}
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none"
          >
            <option value="speech-2.8-hd">speech-2.8-hd (Best quality)</option>
            <option value="speech-2.8-turbo">speech-2.8-turbo (Faster)</option>
            <option value="speech-2.6-hd">speech-2.6-hd</option>
            <option value="speech-2.6-turbo">speech-2.6-turbo</option>
          </select>
        </div>

        {/* Voice ID */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">Voice ID</label>
          <input
            type="text"
            value={prefs.ttsVoiceId}
            onChange={(e) => setPrefs({ ...prefs, ttsVoiceId: e.target.value })}
            placeholder="e.g., English_Graceful_Lady"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            System voice ID or custom cloned voice ID
          </p>
        </div>

        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold" style={{ color: "#FF6B35" }}>
          YOMOO Pipeline (GitHub)
        </h4>

        {/* GitHub PAT */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            GitHub Personal Access Token
          </label>
          <input
            type="password"
            value={prefs.githubToken}
            onChange={(e) => setPrefs({ ...prefs, githubToken: e.target.value })}
            placeholder="ghp_..."
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Needs &quot;repo&quot; scope. Generate at github.com/settings/tokens
          </p>
        </div>

        {/* GitHub Owner */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            GitHub Repo Owner
          </label>
          <input
            type="text"
            value={prefs.githubOwner}
            onChange={(e) => setPrefs({ ...prefs, githubOwner: e.target.value })}
            placeholder="Leave empty to use your username"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Org or user that owns yomoo-daily repo (e.g. YOMOO-LLC)
          </p>
        </div>

        {/* Pipeline Schedule */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Daily Pipeline Schedule
          </label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={prefs.pipelineSchedule}
              onChange={(e) => setPrefs({ ...prefs, pipelineSchedule: e.target.value })}
              className="rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
            />
            {prefs.pipelineSchedule && (
              <button
                onClick={() => setPrefs({ ...prefs, pipelineSchedule: "" })}
                className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-red-500"
              >
                Clear
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Auto-run pipeline daily at this time. Leave empty to disable.
          </p>
        </div>

        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold" style={{ color: "#FF6B35" }}>
          Mailing List (Cloudflare Worker)
        </h4>

        {/* Worker URL */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Cloudflare Worker URL
          </label>
          <input
            type="text"
            value={prefs.workerUrl || ""}
            onChange={(e) => setPrefs({ ...prefs, workerUrl: e.target.value })}
            placeholder="https://yomoo-subscribe-worker.yourname.workers.dev"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* Worker Secret */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Worker API Secret
          </label>
          <input
            type="password"
            value={prefs.workerSecret || ""}
            onChange={(e) => setPrefs({ ...prefs, workerSecret: e.target.value })}
            placeholder="Shared secret for /subscribers endpoint"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* Subscriber Management */}
        {prefs.workerUrl && prefs.workerSecret && <SubscriberManager />}

        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold" style={{ color: "#FF6B35" }}>
          Video Generation (Deepgram)
        </h4>

        {/* Deepgram API Key */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            Deepgram API Key
          </label>
          <input
            type="password"
            value={prefs.deepgramApiKey || ""}
            onChange={(e) => setPrefs({ ...prefs, deepgramApiKey: e.target.value })}
            placeholder="Enter your Deepgram API key..."
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Required for video generation. Get your key from console.deepgram.com
          </p>
        </div>

        {/* Divider */}
        <hr className="my-4 border-[hsl(var(--border))]" />

        <h4 className="mb-3 text-xs font-semibold" style={{ color: "#FF6B35" }}>
          YouTube Upload
        </h4>

        {/* YouTube Client ID */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            YouTube Client ID
          </label>
          <input
            type="text"
            value={prefs.youtubeClientId || ""}
            onChange={(e) => setPrefs({ ...prefs, youtubeClientId: e.target.value })}
            placeholder="Google OAuth Client ID"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* YouTube Client Secret */}
        <div className="mb-4">
          <label className="mb-1 block text-xs text-[hsl(var(--muted-foreground))]">
            YouTube Client Secret
          </label>
          <input
            type="password"
            value={prefs.youtubeClientSecret || ""}
            onChange={(e) => setPrefs({ ...prefs, youtubeClientSecret: e.target.value })}
            placeholder="Google OAuth Client Secret"
            className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
          />
        </div>

        {/* YouTube Connection */}
        <div className="mb-4">
          <YouTubeConnectionManager prefs={prefs} setPrefs={setPrefs} />
        </div>

        {/* YouTube Enable Toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={prefs.youtubeEnabled || false}
              onChange={(e) => setPrefs({ ...prefs, youtubeEnabled: e.target.checked })}
              className="accent-[color:var(--accent-color)]"
            />
            Enable YouTube upload after video generation
          </label>
          <p className="ml-5 mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
            Requires Deepgram API key and YouTube connection
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-[color:var(--accent-color)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function YouTubeConnectionManager({
  prefs,
  setPrefs,
}: {
  prefs: { youtubeClientId: string; youtubeClientSecret: string; youtubeRefreshToken: string }
  setPrefs: (prefs: any) => void
}) {
  const [connected, setConnected] = React.useState<boolean | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [connecting, setConnecting] = React.useState(false)
  const [error, setError] = React.useState("")

  // Check connection status on mount
  React.useEffect(() => {
    if (prefs.youtubeRefreshToken) {
      checkConnection()
    } else {
      setConnected(false)
    }
  }, [prefs.youtubeRefreshToken])

  const checkConnection = async () => {
    setChecking(true)
    setError("")
    try {
      const result = await window.api.youtubeCheckConnection()
      setConnected(result.connected)
      if (!result.connected && result.error) {
        setError(result.error)
      }
    } catch (err) {
      setConnected(false)
      setError(String(err))
    }
    setChecking(false)
  }

  const handleConnect = async () => {
    if (!prefs.youtubeClientId || !prefs.youtubeClientSecret) {
      setError("Please enter Client ID and Client Secret first")
      return
    }

    setConnecting(true)
    setError("")

    try {
      // Get OAuth URL
      const urlResult = await window.api.youtubeGetAuthUrl()
      if (!urlResult.success) {
        setError(urlResult.error || "Failed to get auth URL")
        setConnecting(false)
        return
      }

      // Open in browser
      window.open(urlResult.url, "_blank")

      // Prompt for code
      const code = window.prompt(
        "After authorizing in your browser, paste the authorization code here:",
      )

      if (!code) {
        setConnecting(false)
        return
      }

      // Exchange code
      const exchangeResult = await window.api.youtubeExchangeCode(code.trim())
      if (exchangeResult.success) {
        // Reload prefs to get the saved refresh token
        const updatedPrefs = await window.api.getPreferences()
        setPrefs(updatedPrefs)
        setConnected(true)
        console.info("[youtube-ui] Connected successfully")
      } else {
        setError(exchangeResult.error || "Failed to exchange code")
      }
    } catch (err) {
      setError(String(err))
    }
    setConnecting(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${
              connected === null
                ? "bg-[hsl(var(--border))]"
                : connected
                  ? "bg-green-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-xs">
            {checking ? "Checking..." : connected ? "Connected" : "Not connected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {connected && (
            <button
              onClick={checkConnection}
              disabled={checking}
              className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[color:var(--accent-color)]"
            >
              {checking ? "..." : "Re-check"}
            </button>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting || !prefs.youtubeClientId || !prefs.youtubeClientSecret}
            className="rounded border px-2 py-1 text-xs hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            style={{ borderColor: "#FF6B35", color: "#FF6B35" }}
          >
            {connecting ? "Connecting..." : connected ? "Reconnect" : "Connect YouTube"}
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

const PAGE_SIZE = 20

function SubscriberManager() {
  const [subscribers, setSubscribers] = React.useState<{ email: string; subscribed_at: string }[]>(
    [],
  )
  const [loading, setLoading] = React.useState(false)
  const [newEmail, setNewEmail] = React.useState("")
  const [error, setError] = React.useState("")
  const [expanded, setExpanded] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(0)

  const loadSubscribers = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await window.api.listSubscribers()
      if (result.success) {
        setSubscribers(result.subscribers)
      } else {
        setError(result.error || "Failed to load")
      }
    } catch (err) {
      setError(String(err))
    }
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadSubscribers()
  }, [loadSubscribers])

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email")
      return
    }
    setError("")
    const result = await window.api.addSubscriber(email)
    if (result.success) {
      setNewEmail("")
      loadSubscribers()
    } else {
      setError(result.error || "Failed to add")
    }
  }

  const handleRemove = async (email: string) => {
    setError("")
    const result = await window.api.removeSubscriber(email)
    if (result.success) {
      loadSubscribers()
    } else {
      setError(result.error || "Failed to remove")
    }
  }

  const filtered = search
    ? subscribers.filter((s) => s.email.toLowerCase().includes(search.toLowerCase()))
    : subscribers
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset page when search changes
  React.useEffect(() => {
    setPage(0)
  }, [search])

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
          Subscribers ({subscribers.length})
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSubscribers}
            disabled={loading}
            className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[color:var(--accent-color)]"
          >
            {loading ? "..." : "Refresh"}
          </button>
          {subscribers.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[color:var(--accent-color)]"
            >
              {expanded ? "Collapse" : "Manage"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-[10px] text-red-500">{error}</p>}

      {/* Expanded subscriber list with search and pagination */}
      {expanded && subscribers.length > 0 && (
        <div className="mb-2">
          {/* Search */}
          {subscribers.length > PAGE_SIZE && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subscribers..."
              className="mb-1.5 w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs outline-none focus:border-[color:var(--accent-color)]"
            />
          )}

          {/* List */}
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {paged.map((sub) => (
              <div
                key={sub.email}
                className="group flex items-center justify-between rounded border border-[hsl(var(--border))] px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-xs">{sub.email}</span>
                  <span className="ml-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                    {sub.subscribed_at}
                  </span>
                </div>
                <button
                  onClick={() => handleRemove(sub.email)}
                  className="ml-2 hidden shrink-0 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-red-500 group-hover:block"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="hover:text-[color:var(--accent-color)] disabled:opacity-30"
              >
                Prev
              </button>
              <span>
                {page + 1} / {totalPages}
                {search && ` (${filtered.length} matched)`}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="hover:text-[color:var(--accent-color)] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}

          {search && filtered.length === 0 && (
            <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">No matches found</p>
          )}
        </div>
      )}

      {subscribers.length === 0 && !loading && (
        <p className="mb-2 text-[10px] text-[hsl(var(--muted-foreground))]">No subscribers yet</p>
      )}

      {/* Add subscriber */}
      <div className="flex gap-1">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="email@example.com"
          className="flex-1 rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs outline-none focus:border-[color:var(--accent-color)]"
        />
        <button
          onClick={handleAdd}
          className="rounded px-2 py-1 text-xs font-medium text-white"
          style={{ background: "#E8722A" }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
