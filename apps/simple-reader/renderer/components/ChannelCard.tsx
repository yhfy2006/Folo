import * as React from "react"

import type { Channel } from "../stores/channel-store"

interface ChannelCardProps {
  channel: Channel
  onClick: () => void
}

export function ChannelCard({ channel, onClick }: ChannelCardProps) {
  return (
    <div
      className="flex w-80 cursor-pointer flex-col rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] transition-colors hover:border-[var(--border-default)]"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-[var(--status-success)]" />
          <span className="text-sm font-semibold text-[var(--fg-primary)]">{channel.name}</span>
        </div>
        <span className="rounded-full bg-[var(--surface-tertiary)] px-2.5 py-0.5 font-mono text-xs text-[var(--fg-secondary)]">
          {channel.language}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-[var(--border-subtle)]" />

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 px-5 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Last Run
          </div>
          <div className="mt-0.5 text-xs text-[var(--fg-secondary)]">--</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
            Next Run
          </div>
          <div className="mt-0.5 text-xs text-[var(--fg-secondary)]">--</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Stages</div>
          <div className="mt-0.5 text-xs text-[var(--fg-secondary)]">
            {channel.stages?.length ?? 0}
          </div>
        </div>
      </div>

      {/* Latest episode */}
      <div className="px-5 pb-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">
          Latest Episode
        </div>
        <div className="mt-1 truncate text-xs text-[var(--fg-primary)]">No episodes yet</div>
        <div className="mt-1 flex gap-3">
          <span className="text-xs text-[var(--accent-primary)]">YouTube</span>
          <span className="text-xs text-[var(--accent-primary)]">Web Page</span>
        </div>
      </div>

      {/* Footer divider */}
      <div className="mx-5 border-t border-[var(--border-subtle)]" />

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3">
        <button
          type="button"
          className="rounded-md bg-[var(--accent-orange)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
          onClick={(e) => {
            e.stopPropagation()
            // Pipeline trigger will be wired in a later task
          }}
        >
          Run Pipeline
        </button>
        <button
          type="button"
          className="rounded p-1 text-[var(--fg-muted)] transition-colors hover:text-[var(--fg-secondary)]"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          &#x22EF;{/* horizontal ellipsis */}
        </button>
      </div>
    </div>
  )
}
