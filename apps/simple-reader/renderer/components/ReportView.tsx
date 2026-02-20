import { marked } from "marked"
import * as React from "react"
import { useCallback, useEffect, useRef } from "react"

import { useReportStore } from "../stores/report-store"

export function ReportView() {
  const { generating, status, content, error, startReport, reset } = useReportStore()
  const contentRef = useRef<HTMLDivElement>(null)
  const [showPreferences, setShowPreferences] = React.useState(false)

  // Auto-scroll to bottom while generating
  useEffect(() => {
    if (generating && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, generating])

  const handleExport = useCallback(async () => {
    if (!content) return
    await window.api.exportReport(content)
  }, [content])

  const handleRegenerate = useCallback(() => {
    reset()
    startReport()
  }, [reset, startReport])

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
              onClick={startReport}
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

        {!content && !generating && !error && <ReportHistory onGenerate={startReport} />}

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
  created_at: number
}

function ReportHistory({ onGenerate }: { onGenerate: () => void }) {
  const [reports, setReports] = React.useState<SavedReport[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const { setContent } = useReportStore()

  React.useEffect(() => {
    window.api.getReports().then((r: SavedReport[]) => {
      setReports(r)
      setLoaded(true)
    })
  }, [])

  const handleView = async (reportId: string) => {
    const report = await window.api.getReport(reportId)
    if (report) {
      setContent(report.content)
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
        <button
          onClick={onGenerate}
          className="mt-3 rounded bg-[color:var(--accent-color)] px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Generate New Report
        </button>
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
                onClick={() => handleView(report.id)}
                className="group flex w-full items-center justify-between rounded border border-[hsl(var(--border))] px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted))]"
              >
                <div>
                  <div className="text-xs font-medium">{report.title}</div>
                  <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                    {formatDate(report.created_at)} · {report.entry_count} articles ·{" "}
                    {report.time_range}h range
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

// Inline PreferencesDialog component
function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = React.useState({
    language: "en",
    interests: [] as string[],
    reportStyle: "detailed" as "concise" | "detailed",
    timeRange: 24,
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
        className="w-96 rounded-lg bg-[hsl(var(--background))] p-6 shadow-xl"
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
