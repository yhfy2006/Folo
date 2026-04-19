import * as React from "react"
import { useEffect, useState } from "react"

import { useChannelStore } from "../stores/channel-store"
import { ChannelCard } from "./ChannelCard"
import { NewChannelModal } from "./NewChannelModal"

export function Dashboard() {
  const { channels, loadChannels, loading, selectChannel } = useChannelStore()
  const [showNewChannel, setShowNewChannel] = useState(false)

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--surface-primary)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-3">
        {/* Logo */}
        <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--accent-orange)] font-bold text-white">
          Y
        </div>
        <span className="text-sm font-semibold text-[var(--fg-primary)]">YOMOO Studio</span>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between px-8 pb-6 pt-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg-primary)]">Channels</h1>
          <p className="mt-1 text-sm text-[var(--fg-secondary)]">
            Manage your content production channels
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          onClick={() => setShowNewChannel(true)}
        >
          <span className="text-lg leading-none">+</span>
          New Channel
        </button>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="text-sm text-[var(--fg-muted)]">Loading channels...</div>
        ) : channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl">📡</div>
            <p className="mt-3 text-sm text-[var(--fg-secondary)]">No channels yet</p>
            <p className="mt-1 text-xs text-[var(--fg-muted)]">
              Create your first channel to get started
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-5">
            {channels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} onClick={() => selectChannel(ch.id)} />
            ))}
          </div>
        )}
      </div>

      {/* New channel modal */}
      <NewChannelModal open={showNewChannel} onClose={() => setShowNewChannel(false)} />
    </div>
  )
}
