import * as React from "react"
import { useEffect } from "react"

import { ArticleView } from "./components/ArticleView"
import { EntryList } from "./components/EntryList"
import { FeedSidebar } from "./components/FeedSidebar"
import { ReportView } from "./components/ReportView"
import { useEntryStore } from "./stores/entry-store"
import { useFeedStore } from "./stores/feed-store"
import { useReportStore } from "./stores/report-store"

export function App() {
  const { loadFeeds, loadUnreadCounts } = useFeedStore()
  const { loadEntries } = useEntryStore()
  const { showReport } = useReportStore()

  useEffect(() => {
    if (!window.api) {
      console.error("window.api is not available - preload script may not have loaded")
      return
    }

    // Initial load
    loadFeeds()
    loadUnreadCounts()
    loadEntries()

    // Listen for feed updates from main process
    const cleanup = window.api.onFeedsUpdated(() => {
      loadFeeds()
      loadUnreadCounts()
      loadEntries()
    })

    return cleanup
  }, [loadFeeds, loadUnreadCounts, loadEntries])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[hsl(var(--background))]">
      {/* Draggable title bar region - pointer-events-none so buttons underneath remain clickable */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
      <FeedSidebar />
      {showReport ? (
        <ReportView />
      ) : (
        <>
          <EntryList />
          <ArticleView />
        </>
      )}
    </div>
  )
}
