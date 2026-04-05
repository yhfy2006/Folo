import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useChannelStore } from "../../stores/channel-store"
import { useGroupStore } from "../../stores/group-store"

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
]

interface GeneralSettingsProps {
  channel: Channel
}

export function GeneralSettings({ channel }: GeneralSettingsProps) {
  const { updateChannel, deleteChannel } = useChannelStore()
  const { groups, loadGroups } = useGroupStore()

  const [name, setName] = React.useState(channel.name)
  const [language, setLanguage] = React.useState(channel.language)
  const [groupId, setGroupId] = React.useState(channel.groupId)
  const [schedule, setSchedule] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // Reset form when channel changes
  React.useEffect(() => {
    setName(channel.name)
    setLanguage(channel.language)
    setGroupId(channel.groupId)
  }, [channel.id, channel.name, channel.language, channel.groupId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateChannel(channel.id, { name, language, groupId })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${channel.name}"? This action cannot be undone.`,
    )
    if (confirmed) {
      await deleteChannel(channel.id)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">General Settings</h2>
        <button
          type="button"
          className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Form */}
      <div className="flex w-[560px] flex-col gap-5">
        {/* Channel Name */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Channel Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </label>

        {/* Channel ID */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Channel ID</span>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2">
            <input
              type="text"
              value={channel.id}
              readOnly
              className="flex-1 bg-transparent font-mono text-sm text-[var(--fg-muted)] outline-none"
            />
            <span className="text-[var(--fg-muted)]" title="Locked">
              &#x1F512;
            </span>
          </div>
        </label>

        {/* Language */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        {/* Feed Group */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Feed Group</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        {/* Pipeline Schedule */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Pipeline Schedule</span>
          <input
            type="text"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="14:30"
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
          <span className="text-xs text-[var(--fg-muted)]">
            Daily run time in HH:MM format (24-hour, local time)
          </span>
        </label>
      </div>

      {/* Danger Zone */}
      <div className="w-[560px] rounded-xl border border-red-500/30 bg-red-500/5 p-5">
        <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        <p className="mt-1 text-xs text-[var(--fg-muted)]">
          Permanently delete this channel and all its configuration. This cannot be undone.
        </p>
        <button
          type="button"
          className="mt-4 rounded-lg border border-red-500/40 bg-transparent px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
          onClick={handleDelete}
        >
          Delete Channel
        </button>
      </div>
    </div>
  )
}
