import * as React from "react"
import { useCallback, useEffect, useState } from "react"

import { useEntryStore } from "../stores/entry-store"
import { useFeedStore } from "../stores/feed-store"
import type { FeedGroup } from "../stores/group-store"
import { useGroupStore } from "../stores/group-store"
import { useReportStore } from "../stores/report-store"
import { GroupSettings } from "./GroupSettings"

export function FeedSidebar() {
  const {
    feeds,
    selectedFeedId,
    setSelectedFeedId,
    setFeeds,
    unreadCounts,
    loadFeeds,
    loadUnreadCounts,
  } = useFeedStore()
  const { loadEntries, setSelectedEntry, setSelectedEntryId } = useEntryStore()
  const { showReport, setShowReport, generating } = useReportStore()
  const { groups, selectedGroupId, setSelectedGroupId, loadGroups } = useGroupStore()
  const [addingFeed, setAddingFeed] = useState(false)
  const [newFeedUrl, setNewFeedUrl] = useState("")
  const [refreshing, setRefreshing] = useState(false)
  const [settingsGroup, setSettingsGroup] = useState<FeedGroup | null>(null)

  // Load groups on mount
  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // When group selection changes, reload feeds for that group
  useEffect(() => {
    if (selectedGroupId) {
      window.api.getGroupFeeds(selectedGroupId).then((groupFeeds) => {
        setFeeds(groupFeeds)
      })
    } else {
      loadFeeds()
    }
  }, [selectedGroupId, setFeeds, loadFeeds])

  const handleSelectFeed = useCallback(
    async (feedId: string | null) => {
      setSelectedFeedId(feedId)
      setSelectedEntry(null)
      setSelectedEntryId(null)
      if (feedId) {
        await loadEntries(feedId)
      } else if (selectedGroupId) {
        await loadEntries(undefined, selectedGroupId)
      } else {
        await loadEntries()
      }
    },
    [setSelectedFeedId, setSelectedEntry, setSelectedEntryId, loadEntries, selectedGroupId],
  )

  const handleSelectGroup = useCallback(
    async (groupId: string | null) => {
      setSelectedGroupId(groupId)
      setSelectedFeedId(null)
      setSelectedEntry(null)
      setSelectedEntryId(null)
      // Load entries for the selected group
      if (groupId) {
        await loadEntries(undefined, groupId)
      } else {
        await loadEntries()
      }
    },
    [setSelectedGroupId, setSelectedFeedId, setSelectedEntry, setSelectedEntryId, loadEntries],
  )

  const handleImportOPML = useCallback(async () => {
    const result = await window.api.importOPML()
    if (result && result.groupId) {
      await loadGroups()
      await loadFeeds()
      await loadUnreadCounts()
      setSelectedGroupId(result.groupId)
    } else if (result && result.success) {
      await loadFeeds()
      await loadUnreadCounts()
    }
  }, [loadFeeds, loadUnreadCounts, loadGroups, setSelectedGroupId])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await window.api.refreshFeeds()
    if (selectedGroupId) {
      const groupFeeds = await window.api.getGroupFeeds(selectedGroupId)
      setFeeds(groupFeeds)
    } else {
      await loadFeeds()
    }
    await loadUnreadCounts()
    await loadEntries(selectedFeedId || undefined)
    setRefreshing(false)
  }, [loadFeeds, loadUnreadCounts, loadEntries, selectedFeedId, selectedGroupId, setFeeds])

  const handleDeleteFeed = useCallback(
    async (e: React.MouseEvent, feedId: string) => {
      e.stopPropagation()
      await window.api.deleteFeed(feedId)
      if (selectedFeedId === feedId) {
        setSelectedFeedId(null)
        await loadEntries()
      }
      if (selectedGroupId) {
        const groupFeeds = await window.api.getGroupFeeds(selectedGroupId)
        setFeeds(groupFeeds)
      } else {
        await loadFeeds()
      }
      await loadUnreadCounts()
    },
    [
      selectedFeedId,
      selectedGroupId,
      setSelectedFeedId,
      setFeeds,
      loadFeeds,
      loadUnreadCounts,
      loadEntries,
    ],
  )

  const handleAddFeed = useCallback(async () => {
    if (!newFeedUrl.trim()) return
    await window.api.addFeed(newFeedUrl.trim())
    setNewFeedUrl("")
    setAddingFeed(false)
    await loadFeeds()
    await loadUnreadCounts()
  }, [newFeedUrl, loadFeeds, loadUnreadCounts])

  // Group feeds by category
  const grouped = new Map<string, typeof feeds>()
  for (const feed of feeds) {
    const cat = feed.category || "Uncategorized"
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(feed)
  }

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0)

  return (
    <div
      className="flex h-full w-64 flex-shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
      style={{ paddingTop: 40 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <h1 className="text-sm font-semibold">Simple Reader</h1>
        <div className="flex gap-1">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded p-1 text-xs hover:bg-[hsl(var(--border))] disabled:opacity-50"
            title="Refresh all feeds"
          >
            {refreshing ? "..." : "R"}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 px-3 pb-2">
        <button
          onClick={handleImportOPML}
          className="flex-1 rounded bg-[hsl(var(--foreground))] px-2 py-1 text-xs text-[hsl(var(--background))] hover:opacity-90"
        >
          Import OPML
        </button>
        <button
          onClick={() => setAddingFeed(!addingFeed)}
          className="rounded border border-[hsl(var(--border))] px-2 py-1 text-xs hover:bg-[hsl(var(--border))]"
        >
          + Feed
        </button>
      </div>

      {/* Add feed input */}
      {addingFeed && (
        <div className="flex gap-1 px-3 pb-2">
          <input
            type="text"
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddFeed()}
            placeholder="Feed URL..."
            className="flex-1 rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-xs outline-none focus:border-[color:var(--accent-color)]"
            autoFocus
          />
          <button
            onClick={handleAddFeed}
            className="rounded bg-[color:var(--accent-color)] px-2 py-1 text-xs text-white"
          >
            Add
          </button>
        </div>
      )}

      {/* Feed list */}
      <div className="flex-1 overflow-y-auto px-1">
        {/* Groups section */}
        {groups.length > 0 && (
          <div className="mb-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Groups
            </div>
            <button
              onClick={() => handleSelectGroup(null)}
              className={`mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                selectedGroupId === null
                  ? "bg-[color:var(--accent-color)] text-white"
                  : "hover:bg-[hsl(var(--border))]"
              }`}
            >
              <span className="font-medium">All Feeds</span>
              {totalUnread > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] ${
                    selectedGroupId === null ? "bg-white/20" : "bg-[hsl(var(--border))]"
                  }`}
                >
                  {totalUnread}
                </span>
              )}
            </button>
            {groups.map((group) => (
              <div
                key={group.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectGroup(group.id)}
                onKeyDown={(e) => e.key === "Enter" && handleSelectGroup(group.id)}
                className={`group mb-0.5 flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                  selectedGroupId === group.id
                    ? "bg-[color:var(--accent-color)] text-white"
                    : "hover:bg-[hsl(var(--border))]"
                }`}
              >
                <span className="truncate font-medium">{group.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSettingsGroup(group)
                  }}
                  className={`hidden rounded p-0.5 text-[10px] group-hover:block ${
                    selectedGroupId === group.id
                      ? "text-white/70 hover:bg-white/10"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--border))]"
                  }`}
                  title="Group settings"
                >
                  ...
                </button>
              </div>
            ))}
          </div>
        )}

        {/* All feeds item (shown when no groups exist) */}
        {groups.length === 0 && (
          <button
            onClick={() => handleSelectFeed(null)}
            className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
              selectedFeedId === null
                ? "bg-[color:var(--accent-color)] text-white"
                : "hover:bg-[hsl(var(--border))]"
            }`}
          >
            <span className="font-medium">All Feeds</span>
            {totalUnread > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  selectedFeedId === null ? "bg-white/20" : "bg-[hsl(var(--border))]"
                }`}
              >
                {totalUnread}
              </span>
            )}
          </button>
        )}

        {/* Feeds header */}
        {feeds.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Feeds{selectedGroupId ? ` (${feeds.length})` : ""}
          </div>
        )}

        {/* Grouped feeds */}
        {Array.from(grouped.entries()).map(([category, categoryFeeds]) => (
          <div key={category} className="mb-2">
            {grouped.size > 1 && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                {category}
              </div>
            )}
            {categoryFeeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => handleSelectFeed(feed.id)}
                className={`group mb-0.5 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs ${
                  selectedFeedId === feed.id
                    ? "bg-[color:var(--accent-color)] text-white"
                    : "hover:bg-[hsl(var(--border))]"
                }`}
              >
                <span className="truncate">{feed.title || feed.url}</span>
                <span className="flex items-center gap-1">
                  {unreadCounts[feed.id] ? (
                    <span
                      className={`rounded-full px-1.5 text-[10px] ${
                        selectedFeedId === feed.id ? "bg-white/20" : "bg-[hsl(var(--border))]"
                      }`}
                    >
                      {unreadCounts[feed.id]}
                    </span>
                  ) : null}
                  <button
                    onClick={(e) => handleDeleteFeed(e, feed.id)}
                    className={`hidden rounded p-0.5 text-[10px] hover:bg-red-500/20 group-hover:block ${
                      selectedFeedId === feed.id
                        ? "text-white/70"
                        : "text-[hsl(var(--muted-foreground))]"
                    }`}
                    title="Delete feed"
                  >
                    x
                  </button>
                </span>
              </button>
            ))}
          </div>
        ))}

        {feeds.length === 0 && (
          <div className="p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
            No feeds yet. Import an OPML file or add a feed URL to get started.
          </div>
        )}
      </div>

      {/* AI Report button */}
      <div className="border-t border-[hsl(var(--border))] p-3">
        <button
          onClick={() => {
            setShowReport(!showReport)
            if (!showReport) {
              setSelectedFeedId(null)
            }
          }}
          disabled={generating}
          className={`flex w-full items-center justify-center gap-1.5 rounded p-2 text-xs font-medium transition-colors ${
            showReport
              ? "bg-[color:var(--accent-color)] text-white"
              : "bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-90"
          } disabled:opacity-50`}
        >
          {generating ? "Generating..." : "AI Report"}
        </button>
      </div>

      {/* Group settings modal */}
      {settingsGroup && (
        <GroupSettings group={settingsGroup} onClose={() => setSettingsGroup(null)} />
      )}
    </div>
  )
}
