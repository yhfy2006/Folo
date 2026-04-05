import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useReportStore } from "../../stores/report-store"

const PIPELINE_STAGES = [
  { name: "verify", label: "Verify" },
  { name: "reflect", label: "Reflect" },
  { name: "report", label: "Report" },
  { name: "podcast", label: "Podcast" },
  { name: "audio", label: "Audio" },
  { name: "upload", label: "Upload" },
  { name: "publish", label: "Publish" },
  { name: "video", label: "Video" },
  { name: "youtube", label: "YouTube" },
  { name: "shorts", label: "Shorts" },
] as const

type StageStatus = "completed" | "active" | "failed" | "pending"

interface PipelineTabProps {
  channel: Channel
}

export function PipelineTab({ channel }: PipelineTabProps) {
  const {
    pipelineRunning,
    pipelineStage,
    pipelineStep,
    pipelineTotal,
    pipelineLogs,
    pipelineError,
    pipelineErrorStage,
    pipelineResult,
    startPipeline,
    resetPipeline,
  } = useReportStore()

  const logEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll logs to bottom
  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [pipelineLogs.length])

  // Compute elapsed time
  const [startTime] = React.useState(() => (pipelineRunning ? Date.now() : null))
  const [elapsed, setElapsed] = React.useState("")

  React.useEffect(() => {
    if (!pipelineRunning || !startTime) {
      setElapsed("")
      return
    }
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - startTime) / 1000)
      const m = Math.floor(diff / 60)
      const s = diff % 60
      setElapsed(`${m}:${s.toString().padStart(2, "0")}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [pipelineRunning, startTime])

  const getStageStatus = (stageName: string): StageStatus => {
    if (!pipelineRunning && !pipelineResult && !pipelineError) return "pending"

    const stageIndex = PIPELINE_STAGES.findIndex((s) => s.name === stageName)
    const currentIndex = PIPELINE_STAGES.findIndex((s) => s.name === pipelineStage)

    if (pipelineError && pipelineErrorStage === stageName) return "failed"
    if (pipelineResult) {
      // All completed if pipeline succeeded
      return "completed"
    }
    if (stageIndex < currentIndex) return "completed"
    if (stageIndex === currentIndex && pipelineRunning) return "active"
    if (pipelineError && stageIndex > currentIndex) return "pending"
    return "pending"
  }

  const completedCount = PIPELINE_STAGES.filter(
    (s) => getStageStatus(s.name) === "completed",
  ).length

  const showSuccess = pipelineResult && !pipelineError && !pipelineRunning
  const showError = pipelineError && !pipelineRunning

  const handleRetry = () => {
    resetPipeline()
    startPipeline(channel.groupId)
  }

  const handleStop = () => {
    // No stop IPC currently exists; reset UI state
    resetPipeline()
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
      {/* Left sidebar — stage list */}
      <div className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-secondary)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Stages</h3>
          <span className="font-mono text-xs text-[var(--fg-muted)]">
            {completedCount} / {pipelineTotal || PIPELINE_STAGES.length}
          </span>
        </div>

        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {PIPELINE_STAGES.map((stage) => {
            const status = getStageStatus(stage.name)
            return <StageRow key={stage.name} label={stage.label} status={status} />
          })}
        </div>
      </div>

      {/* Right area — logs / success / error */}
      <div className="flex flex-1 flex-col bg-[var(--surface-primary)]">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-[var(--fg-secondary)]">
              {pipelineRunning
                ? `Running: ${pipelineStage || "initializing"}`
                : pipelineResult
                  ? "Pipeline Complete"
                  : pipelineError
                    ? "Pipeline Failed"
                    : "Idle"}
            </span>
            {elapsed && <span className="font-mono text-xs text-[var(--fg-muted)]">{elapsed}</span>}
          </div>
          {pipelineRunning && (
            <button
              type="button"
              className="border-[var(--status-error)]/40 hover:bg-[var(--status-error)]/10 rounded-md border px-3 py-1.5 text-xs font-medium text-[var(--status-error)] transition-colors"
              onClick={handleStop}
            >
              Stop
            </button>
          )}
        </div>

        {/* Content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {showSuccess ? (
            <SuccessView result={pipelineResult} onRunAgain={handleRetry} />
          ) : showError ? (
            <ErrorView
              logs={pipelineLogs}
              error={pipelineError}
              errorStage={pipelineErrorStage}
              logEndRef={logEndRef}
              step={pipelineStep}
              onRetry={handleRetry}
              onDismiss={resetPipeline}
            />
          ) : (
            <LogConsole logs={pipelineLogs} logEndRef={logEndRef} running={pipelineRunning} />
          )}
        </div>
      </div>
    </div>
  )
}

/* ----- Sub-components ----- */

function StageRow({ label, status }: { label: string; status: StageStatus }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${
        status === "active" ? "bg-[var(--accent-primary)]/10" : ""
      }`}
    >
      <StageIcon status={status} />
      <span
        className={`flex-1 text-sm ${
          status === "active"
            ? "font-medium text-[var(--fg-primary)]"
            : status === "completed"
              ? "text-[var(--fg-secondary)]"
              : status === "failed"
                ? "text-[var(--status-error)]"
                : "text-[var(--fg-muted)]"
        }`}
      >
        {label}
      </span>
      {status === "active" && <span className="font-mono text-xs text-[var(--fg-muted)]">...</span>}
      {status === "failed" && <span className="text-xs text-[var(--status-error)]">failed</span>}
    </div>
  )
}

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="bg-[var(--status-success)]/20 flex size-5 items-center justify-center rounded-full text-xs text-[var(--status-success)]">
          &#x2713;
        </span>
      )
    case "active":
      return (
        <span className="relative flex size-5 items-center justify-center">
          <span className="absolute inline-flex size-3 animate-ping rounded-full bg-[var(--status-running)] opacity-40" />
          <span className="inline-block size-2.5 rounded-full bg-[var(--status-running)]" />
        </span>
      )
    case "failed":
      return (
        <span className="bg-[var(--status-error)]/20 flex size-5 items-center justify-center rounded-full text-xs text-[var(--status-error)]">
          &#x2717;
        </span>
      )
    default:
      return (
        <span className="flex size-5 items-center justify-center">
          <span className="border-[var(--fg-muted)]/40 inline-block size-2.5 rounded-full border-2" />
        </span>
      )
  }
}

function colorizeLogLine(line: string): string {
  if (/Stage/i.test(line)) return "text-[var(--accent-orange)]"
  if (/[✓]/.test(line)) return "text-[var(--status-success)]"
  if (/[Error✗]/i.test(line)) return "text-[var(--status-error)]"
  return "text-[var(--fg-muted)]"
}

function LogConsole({
  logs,
  logEndRef,
  running,
}: {
  logs: string[]
  logEndRef: React.RefObject<HTMLDivElement | null>
  running: boolean
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-[#0D0D0D] p-4 font-mono text-xs leading-relaxed">
      {logs.length === 0 && !running && (
        <div className="flex flex-1 items-center justify-center text-[var(--fg-muted)]">
          No pipeline logs yet. Run a pipeline to see output here.
        </div>
      )}
      {logs.map((line, i) => (
        <div key={i} className={colorizeLogLine(line)}>
          {line}
        </div>
      ))}
      {running && <div className="mt-1 inline-block h-4 w-2 animate-pulse bg-[var(--fg-muted)]" />}
      <div ref={logEndRef} />
    </div>
  )
}

function SuccessView({
  result,
  onRunAgain,
}: {
  result: { pageUrl: string; audioUrl: string; date: string; youtubeUrl?: string }
  onRunAgain: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      {/* Large green checkmark */}
      <div className="bg-[var(--status-success)]/15 flex size-20 items-center justify-center rounded-full">
        <span className="text-4xl text-[var(--status-success)]">&#x2713;</span>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">Pipeline Complete!</h2>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">All stages completed successfully</p>
      </div>

      {/* Links */}
      <div className="flex items-center gap-3">
        {result.youtubeUrl && <LinkButton href={result.youtubeUrl} label="View on YouTube" />}
        {result.pageUrl && <LinkButton href={result.pageUrl} label="View Web Page" />}
        {result.audioUrl && <LinkButton href={result.audioUrl} label="Download Audio" />}
      </div>

      <button
        type="button"
        className="mt-2 rounded-lg bg-[var(--accent-orange)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        onClick={onRunAgain}
      >
        Run Again
      </button>
    </div>
  )
}

function LinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--surface-tertiary)]"
    >
      {label}
    </a>
  )
}

function ErrorView({
  logs,
  error,
  errorStage,
  logEndRef,
  step,
  onRetry,
  onDismiss,
}: {
  logs: string[]
  error: string
  errorStage: string | null
  logEndRef: React.RefObject<HTMLDivElement | null>
  step: number
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Log console (takes most space) */}
      <div className="flex flex-1 flex-col overflow-y-auto bg-[#0D0D0D] p-4 font-mono text-xs leading-relaxed">
        {logs.map((line, i) => (
          <div key={i} className={colorizeLogLine(line)}>
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Error box */}
      <div className="border-[var(--status-error)]/30 bg-[var(--status-error)]/5 border-t p-5">
        <div className="flex items-start gap-3">
          <span className="bg-[var(--status-error)]/20 flex size-6 shrink-0 items-center justify-center rounded-full text-sm text-[var(--status-error)]">
            &#x2717;
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-[var(--status-error)]">
              Pipeline failed at Stage {step}
              {errorStage ? ` (${errorStage})` : ""}
            </h4>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">{error}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--accent-orange)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            onClick={onRetry}
          >
            Retry from Stage {step}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--surface-tertiary)]"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
