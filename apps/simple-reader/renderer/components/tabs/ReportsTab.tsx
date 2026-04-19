import * as React from "react"
import { useEffect, useState } from "react"

import type { Channel } from "../../stores/channel-store"
import { useReportStore } from "../../stores/report-store"

interface Report {
  id: string
  title: string
  language: string
  time_range: number
  entry_count: number
  type: string
  group_id: string | null
  created_at: number
}

interface ReportsTabProps {
  channel: Channel
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function ReportsTab({ channel }: ReportsTabProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const { startReport } = useReportStore()

  useEffect(() => {
    setLoading(true)
    window.api
      .getReports(channel.groupId)
      .then((result) => {
        setReports(result)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [channel.groupId])

  const handleGenerateReport = () => {
    startReport(channel.groupId)
  }

  const handlePreview = async (reportId: string) => {
    const result = await window.api.previewReportHtml(reportId)
    if (result.success && result.html) {
      const win = window.open("", "_blank")
      if (win) {
        win.document.write(result.html)
        win.document.close()
      }
    }
  }

  const handleExport = async (reportId: string) => {
    const report = await window.api.getReport(reportId)
    if (report?.content) {
      await window.api.exportReport(report.content)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">Report History</h2>
        <button
          type="button"
          onClick={handleGenerateReport}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M18 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          </svg>
          Generate Report
        </button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-secondary)]">
              <th className="w-[140px] px-4 py-3 text-left font-mono text-xs font-medium text-[var(--fg-muted)]">
                Date
              </th>
              <th className="w-[100px] px-4 py-3 text-left font-mono text-xs font-medium text-[var(--fg-muted)]">
                Type
              </th>
              <th className="px-4 py-3 text-left font-mono text-xs font-medium text-[var(--fg-muted)]">
                Title
              </th>
              <th className="w-[80px] px-4 py-3 text-left font-mono text-xs font-medium text-[var(--fg-muted)]">
                Articles
              </th>
              <th className="w-[100px] px-4 py-3 text-left font-mono text-xs font-medium text-[var(--fg-muted)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
                  Loading reports...
                </td>
              </tr>
            )}
            {!loading && reports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
                  No reports yet. Generate your first report to get started.
                </td>
              </tr>
            )}
            {reports.map((report) => (
              <tr
                key={report.id}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-3 font-mono text-xs text-[var(--fg-muted)]">
                  {formatDate(report.created_at)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      report.type === "podcast"
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-purple-500/15 text-purple-400"
                    }`}
                  >
                    {report.type === "podcast" ? "Podcast" : "Report"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--fg-primary)]">
                  {report.title || "Untitled Report"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--fg-muted)]">
                  {report.entry_count ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handlePreview(report.id)}
                      className="text-xs font-medium text-purple-400 transition-colors hover:text-purple-300"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExport(report.id)}
                      className="text-xs font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg-secondary)]"
                    >
                      Export
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
