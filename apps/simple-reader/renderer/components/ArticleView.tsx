import * as React from "react"

import { useEntryStore } from "../stores/entry-store"

export function ArticleView() {
  const { selectedEntry } = useEntryStore()

  if (!selectedEntry) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Select an article to read
      </div>
    )
  }

  const formatFullDate = (timestamp: number | null) => {
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Article header */}
      <div className="border-b border-[hsl(var(--border))] p-6 pb-4">
        <h1 className="text-xl font-bold leading-tight">{selectedEntry.title || "Untitled"}</h1>
        <div className="mt-2 flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          {selectedEntry.author && <span>By {selectedEntry.author}</span>}
          {selectedEntry.published_at && <span>{formatFullDate(selectedEntry.published_at)}</span>}
          {selectedEntry.url && (
            <a
              href={selectedEntry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--accent-color)] hover:underline"
            >
              Open original ↗
            </a>
          )}
        </div>
      </div>

      {/* Article content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="article-content mx-auto max-w-2xl"
          dangerouslySetInnerHTML={{
            __html:
              selectedEntry.content || selectedEntry.description || "<p>No content available.</p>",
          }}
        />
      </div>
    </div>
  )
}
