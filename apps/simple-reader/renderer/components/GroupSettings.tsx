import * as React from "react"
import { useCallback, useState } from "react"

import type { FeedGroup } from "../stores/group-store"
import { useGroupStore } from "../stores/group-store"

interface Props {
  group: FeedGroup
  onClose: () => void
}

export function GroupSettings({ group, onClose }: Props) {
  const { loadGroups, setSelectedGroupId } = useGroupStore()
  const [name, setName] = useState(group.name)
  const [language, setLanguage] = useState(group.language || "")
  const [reportStyle, setReportStyle] = useState(group.report_style || "")
  const [interests, setInterests] = useState(
    group.interests ? JSON.parse(group.interests).join(", ") : "",
  )
  const [schedule, setSchedule] = useState(group.pipeline_schedule || "")
  const [timeRange, setTimeRange] = useState(group.time_range?.toString() || "")

  const handleSave = useCallback(async () => {
    await window.api.updateFeedGroup(group.id, {
      name,
      language: language || null,
      report_style: reportStyle || null,
      interests: interests.trim()
        ? JSON.stringify(interests.split(",").map((s: string) => s.trim()))
        : null,
      time_range: timeRange ? Number.parseInt(timeRange, 10) : null,
      pipeline_schedule: schedule || null,
    })
    await loadGroups()
    onClose()
  }, [name, language, reportStyle, interests, schedule, timeRange, group.id, loadGroups, onClose])

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete group "${group.name}"? Feeds will not be deleted.`)) return
    await window.api.deleteFeedGroup(group.id)
    setSelectedGroupId(null)
    await loadGroups()
    onClose()
  }, [group.id, group.name, loadGroups, onClose, setSelectedGroupId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 shadow-lg">
        <h3 className="mb-4 text-sm font-semibold">Group Settings</h3>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Language (blank = use global)
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none"
            >
              <option value="">Default (global)</option>
              <option value="en">English</option>
              <option value="zh-CN">Chinese (Simplified)</option>
              <option value="zh-TW">Chinese (Traditional)</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="es">Spanish</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Report Style (blank = use global)
            </label>
            <select
              value={reportStyle}
              onChange={(e) => setReportStyle(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none"
            >
              <option value="">Default (global)</option>
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Interests (comma-separated, blank = use global)
            </label>
            <input
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
              placeholder="AI, crypto, tech"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Time Range (hours, blank = use global)
            </label>
            <input
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
              type="number"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Pipeline Schedule (HH:mm, blank = manual only)
            </label>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="w-full rounded border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-[color:var(--accent-color)]"
              placeholder="08:00"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleSave}
            className="rounded bg-[color:var(--accent-color)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            Save
          </button>
          <button
            onClick={onClose}
            className="rounded border border-[hsl(var(--border))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="ml-auto rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete Group
          </button>
        </div>
      </div>
    </div>
  )
}
