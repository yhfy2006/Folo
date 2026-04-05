import * as React from "react"

import { useChannelStore } from "../stores/channel-store"

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "feeds", label: "Feeds" },
  { id: "pipeline", label: "Pipeline" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const

export function ChannelDetail() {
  const { channels, selectedChannelId, activeTab, setActiveTab, goToDashboard } = useChannelStore()

  const channel = channels.find((c) => c.id === selectedChannelId)

  if (!channel) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-primary)]">
        <p className="text-sm text-[var(--fg-muted)]">Channel not found</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--surface-primary)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-3">
        {/* Back arrow */}
        <button
          type="button"
          className="text-[var(--fg-muted)] transition-colors hover:text-[var(--fg-primary)]"
          onClick={goToDashboard}
        >
          &#x2190;
        </button>

        {/* Logo */}
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-orange)] font-bold text-white">
          Y
        </div>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm">
          <button
            type="button"
            className="text-[var(--fg-muted)] transition-colors hover:text-[var(--fg-secondary)]"
            onClick={goToDashboard}
          >
            YOMOO Studio
          </button>
          <span className="text-[var(--fg-muted)]">/</span>
          <span className="font-medium text-[var(--fg-primary)]">{channel.name}</span>
        </nav>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-[var(--border-subtle)] px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "text-[var(--fg-primary)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* Content area — placeholder for each tab */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === "overview" && (
          <div className="text-sm text-[var(--fg-muted)]">
            Overview for {channel.name} — coming soon
          </div>
        )}
        {activeTab === "feeds" && (
          <div className="text-sm text-[var(--fg-muted)]">Feeds configuration — coming soon</div>
        )}
        {activeTab === "pipeline" && (
          <div className="text-sm text-[var(--fg-muted)]">Pipeline view — coming soon</div>
        )}
        {activeTab === "reports" && (
          <div className="text-sm text-[var(--fg-muted)]">Reports view — coming soon</div>
        )}
        {activeTab === "settings" && (
          <div className="text-sm text-[var(--fg-muted)]">Settings view — coming soon</div>
        )}
      </div>
    </div>
  )
}
