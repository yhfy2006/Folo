import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useReportStore } from "../../stores/report-store"

interface OverviewTabProps {
  channel: Channel
}

export function OverviewTab({ channel }: OverviewTabProps) {
  const [reportCount, setReportCount] = React.useState<number | null>(null)
  const [feedCount, setFeedCount] = React.useState<number | null>(null)

  const { startPipeline } = useReportStore()

  React.useEffect(() => {
    window.api
      .getReports(channel.groupId)
      .then((reports: unknown[]) => setReportCount(reports.length))
      .catch(() => setReportCount(0))

    window.api
      .getGroupFeeds(channel.groupId)
      .then((feeds: unknown[]) => setFeedCount(feeds.length))
      .catch(() => setFeedCount(0))
  }, [channel.groupId])

  const handleRunPipeline = () => {
    startPipeline(channel.groupId)
  }

  const handleDryRun = () => {
    startPipeline(channel.groupId, true)
  }

  const handleVideoOnly = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = useReportStore.getState() as any
    if (typeof store.startVideoOnly === "function") {
      store.startVideoOnly()
    }
  }

  return (
    <div className="flex gap-6">
      {/* Left column */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Channel Status card */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Channel Status</h3>
            <span className="bg-[var(--status-success)]/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--status-success)]">
              <span className="inline-block size-1.5 rounded-full bg-[var(--status-success)]" />
              Healthy
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <MetricTile
              label="Total Episodes"
              value={reportCount !== null ? String(reportCount) : "..."}
            />
            <MetricTile
              label="Success Rate"
              value="98.4%"
              valueClass="text-[var(--status-success)]"
            />
            <MetricTile label="Avg Duration" value="12m 38s" />
            <MetricTile label="Feeds" value={feedCount !== null ? String(feedCount) : "..."} />
          </div>
        </div>

        {/* Recent Runs card */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[var(--fg-primary)]">Recent Runs</h3>
          <div className="flex flex-col gap-2">
            <RunRow status="success" date="Apr 5, 2026" duration="11m 42s" stages="9/9 stages" />
            <RunRow status="success" date="Apr 4, 2026" duration="13m 05s" stages="9/9 stages" />
            <RunRow status="error" date="Apr 3, 2026" duration="8m 21s" stages="7/9 failed" />
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="flex w-[340px] flex-col gap-6">
        {/* Configuration card */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[var(--fg-primary)]">Configuration</h3>
          <div className="flex flex-col gap-3">
            <ConfigRow label="Language" value={channel.language} />
            <ConfigRow
              label="TTS Voice"
              value={`${channel.tts.provider} / ${channel.tts.voiceId}`}
            />
            <ConfigRow label="Schedule" value="Daily 06:00 UTC" />
            <ConfigRow label="Stages" value={channel.stages.join(", ")} />
            <ConfigRow label="Feed Group" value={channel.groupId} />
          </div>
        </div>

        {/* Quick Actions card */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[var(--fg-primary)]">Quick Actions</h3>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full rounded-lg bg-[var(--accent-orange)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              onClick={handleRunPipeline}
            >
              Run Pipeline
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--surface-tertiary)]"
              onClick={handleDryRun}
            >
              Dry Run
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--fg-secondary)] transition-colors hover:bg-[var(--surface-tertiary)]"
              onClick={handleVideoOnly}
            >
              Video Only
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ----- Sub-components ----- */

function MetricTile({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-tertiary)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">{label}</div>
      <div
        className={`mt-1 font-mono text-xl font-semibold ${valueClass ?? "text-[var(--fg-primary)]"}`}
      >
        {value}
      </div>
    </div>
  )
}

function RunRow({
  status,
  date,
  duration,
  stages,
}: {
  status: "success" | "error"
  date: string
  duration: string
  stages: string
}) {
  const dotColor = status === "success" ? "bg-[var(--status-success)]" : "bg-[var(--status-error)]"
  const stagesColor =
    status === "success" ? "text-[var(--fg-secondary)]" : "text-[var(--status-error)]"

  return (
    <div className="flex items-center justify-between rounded-lg bg-[var(--surface-tertiary)] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block size-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-[var(--fg-secondary)]">{date}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-[var(--fg-muted)]">{duration}</span>
        <span className={`text-xs font-medium ${stagesColor}`}>{stages}</span>
      </div>
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-[var(--fg-muted)]">{label}</span>
      <span className="text-right font-mono text-xs text-[var(--fg-secondary)]">{value}</span>
    </div>
  )
}
