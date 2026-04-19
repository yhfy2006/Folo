import * as React from "react"
import { useCallback, useEffect, useState } from "react"

import type { Channel } from "../../stores/channel-store"
import type { Entry } from "../../stores/entry-store"
import type { Feed } from "../../stores/feed-store"

interface FeedsTabProps {
  channel: Channel
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent || ""
}

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return ""
  const now = Date.now()
  const diffMs = now - timestamp
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function formatFullDate(timestamp: number | null): string {
  if (!timestamp) return ""
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function FeedsTab({ channel }: FeedsTabProps) {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [loadingFeeds, setLoadingFeeds] = useState(true)
  const [loadingEntries, setLoadingEntries] = useState(true)

  // Load feeds for this channel's group
  useEffect(() => {
    setLoadingFeeds(true)
    window.api
      .getGroupFeeds(channel.groupId)
      .then((groupFeeds) => {
        setFeeds(groupFeeds)
        setLoadingFeeds(false)
      })
      .catch(() => setLoadingFeeds(false))
  }, [channel.groupId])

  // Load unread counts
  useEffect(() => {
    window.api
      .getUnreadCounts()
      .then(setUnreadCounts)
      .catch(() => {})
  }, [])

  // Load entries when feed selection or channel changes
  useEffect(() => {
    setLoadingEntries(true)
    const feedId = selectedFeedId || undefined
    const groupId = selectedFeedId ? undefined : channel.groupId
    window.api
      .getEntries(feedId, groupId)
      .then((result) => {
        setEntries(result)
        setLoadingEntries(false)
      })
      .catch(() => setLoadingEntries(false))
  }, [selectedFeedId, channel.groupId])

  const handleSelectFeed = useCallback((feedId: string | null) => {
    setSelectedFeedId(feedId)
    setSelectedEntry(null)
  }, [])

  const handleSelectEntry = useCallback(async (entry: Entry) => {
    const fullEntry = await window.api.getEntry(entry.id)
    setSelectedEntry(fullEntry)
    // Mark as read
    await window.api.markRead(entry.id)
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, read: 1 } : e)))
    // Refresh unread counts
    const counts = await window.api.getUnreadCounts()
    setUnreadCounts(counts)
  }, [])

  const totalUnread = feeds.reduce((sum, f) => sum + (unreadCounts[f.id] || 0), 0)

  return (
    <div className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-lg border border-[var(--border-subtle)]">
      {/* Left sidebar — feed list */}
      <div className="flex w-[240px] flex-shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-secondary)]">
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--fg-primary)]">Feeds</span>
          <button
            type="button"
            className="rounded border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--fg-muted)] transition-colors hover:border-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
          >
            Add
          </button>
        </div>

        {/* Feed list */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* All Feeds item */}
          <button
            type="button"
            onClick={() => handleSelectFeed(null)}
            className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors ${
              selectedFeedId === null
                ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                : "text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <span className="font-medium">All Feeds</span>
            {totalUnread > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  selectedFeedId === null
                    ? "bg-[var(--accent-primary)] text-white"
                    : "bg-[var(--surface-hover)] text-[var(--fg-muted)]"
                }`}
              >
                {totalUnread}
              </span>
            )}
          </button>

          {/* Individual feeds */}
          {loadingFeeds && (
            <div className="px-4 py-3 text-xs text-[var(--fg-muted)]">Loading feeds...</div>
          )}
          {!loadingFeeds && feeds.length === 0 && (
            <div className="px-4 py-3 text-xs text-[var(--fg-muted)]">
              No feeds in this group yet.
            </div>
          )}
          {feeds.map((feed) => (
            <button
              key={feed.id}
              type="button"
              onClick={() => handleSelectFeed(feed.id)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                selectedFeedId === feed.id
                  ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                  : "text-[var(--fg-secondary)] hover:bg-[var(--surface-hover)]"
              }`}
            >
              <span className="flex-shrink-0 text-[var(--fg-muted)]">
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
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 truncate">{feed.title || feed.url}</span>
              {(unreadCounts[feed.id] || 0) > 0 && (
                <span
                  className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    selectedFeedId === feed.id
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--surface-hover)] text-[var(--fg-muted)]"
                  }`}
                >
                  {unreadCounts[feed.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Middle column — entry list */}
      <div className="flex w-[320px] flex-shrink-0 flex-col border-r border-[var(--border-subtle)]">
        {/* Entry list header */}
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <span className="text-xs text-[var(--fg-muted)]">
            {entries.length} article{entries.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Entry cards */}
        <div className="flex-1 overflow-y-auto">
          {loadingEntries && (
            <div className="px-4 py-6 text-center text-xs text-[var(--fg-muted)]">Loading...</div>
          )}
          {!loadingEntries && entries.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-[var(--fg-muted)]">
              No articles yet.
            </div>
          )}
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => handleSelectEntry(entry)}
              className={`w-full border-b border-[var(--border-subtle)] px-4 py-3 text-left transition-colors ${
                selectedEntry?.id === entry.id
                  ? "bg-[var(--surface-secondary)]"
                  : "hover:bg-[var(--surface-hover)]"
              }`}
            >
              <h3
                className={`text-sm leading-snug ${
                  entry.read
                    ? "font-normal text-[var(--fg-muted)]"
                    : "font-semibold text-[var(--fg-primary)]"
                }`}
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {entry.title || "Untitled"}
              </h3>
              {entry.description && (
                <p
                  className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {stripHtml(entry.description)}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-[var(--fg-muted)]">
                {entry.author && <span>{entry.author}</span>}
                {entry.author && entry.published_at && <span>·</span>}
                <span>{formatRelativeTime(entry.published_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right area — article reader */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedEntry ? (
          <>
            {/* Article header */}
            <div className="border-b border-[var(--border-subtle)] px-8 py-6">
              <h1 className="text-2xl font-bold leading-tight text-[var(--fg-primary)]">
                {selectedEntry.title || "Untitled"}
              </h1>
              <div className="mt-3 flex items-center gap-3 text-xs text-[var(--fg-muted)]">
                {selectedEntry.author && <span>By {selectedEntry.author}</span>}
                {selectedEntry.published_at && (
                  <span>{formatFullDate(selectedEntry.published_at)}</span>
                )}
                {selectedEntry.url && (
                  <a
                    href={selectedEntry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent-primary)] hover:underline"
                  >
                    Open original ↗
                  </a>
                )}
              </div>
            </div>

            {/* Article body */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div
                className="article-content prose prose-invert mx-auto max-w-2xl"
                dangerouslySetInnerHTML={{
                  __html:
                    selectedEntry.content ||
                    selectedEntry.description ||
                    "<p>No content available.</p>",
                }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-[var(--fg-muted)]">Select an article to read</p>
          </div>
        )}
      </div>
    </div>
  )
}
