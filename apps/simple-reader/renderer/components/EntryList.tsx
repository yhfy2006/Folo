import * as React from "react"
import { useCallback } from "react"

import { useEntryStore } from "../stores/entry-store"
import { useFeedStore } from "../stores/feed-store"

export function EntryList() {
  const { entries, selectedEntryId, loading, loadEntry, markAsRead } = useEntryStore()
  const { loadUnreadCounts } = useFeedStore()

  const handleSelectEntry = useCallback(
    async (entryId: string) => {
      await loadEntry(entryId)
      await markAsRead(entryId)
      await loadUnreadCounts()
    },
    [loadEntry, markAsRead, loadUnreadCounts],
  )

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return ""
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`
    if (diffHours < 48) return "Yesterday"
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-r border-[hsl(var(--border))]">
      {/* Header */}
      <div className="border-b border-[hsl(var(--border))] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {entries.length} articles
          </span>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            Loading...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            No articles yet. Select a feed or refresh.
          </div>
        )}

        {entries.map((entry) => (
          <button
            key={entry.id}
            onClick={() => handleSelectEntry(entry.id)}
            className={`w-full border-b border-[hsl(var(--border))] p-3 text-left transition-colors ${
              selectedEntryId === entry.id
                ? "bg-[color:var(--accent-color)]/5"
                : "hover:bg-[hsl(var(--muted))]"
            }`}
          >
            <div className="flex items-start gap-2">
              {!entry.read && (
                <span className="mt-1.5 size-2 flex-shrink-0 rounded-full bg-[color:var(--accent-color)]" />
              )}
              <div className="min-w-0 flex-1">
                <h3
                  className={`text-sm leading-snug ${
                    entry.read ? "text-[hsl(var(--muted-foreground))]" : "font-medium"
                  }`}
                >
                  {entry.title || "Untitled"}
                </h3>
                {entry.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">
                    {stripHtml(entry.description)}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                  {entry.author && <span>{entry.author}</span>}
                  {entry.author && entry.published_at && <span>·</span>}
                  <span>{formatDate(entry.published_at)}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.textContent || ""
}
