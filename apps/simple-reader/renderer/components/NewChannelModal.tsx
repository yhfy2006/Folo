import * as React from "react"
import { useEffect, useState } from "react"

import { useChannelStore } from "../stores/channel-store"
import { useGroupStore } from "../stores/group-store"

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

interface NewChannelModalProps {
  open: boolean
  onClose: () => void
}

export function NewChannelModal({ open, onClose }: NewChannelModalProps) {
  const { createChannel, selectChannel } = useChannelStore()
  const { groups, loadGroups } = useGroupStore()

  const [channelId, setChannelId] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [language, setLanguage] = useState("en")
  const [groupId, setGroupId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      loadGroups()
      // Reset form on open
      setChannelId("")
      setDisplayName("")
      setLanguage("en")
      setGroupId("")
      setError(null)
    }
  }, [open, loadGroups])

  // Default to first group when groups load
  useEffect(() => {
    if (groups.length > 0 && !groupId) {
      setGroupId(groups[0].id)
    }
  }, [groups, groupId])

  if (!open) return null

  const isValid = channelId.trim().length > 0 && displayName.trim().length > 0 && groupId.length > 0

  const handleSubmit = async () => {
    if (!isValid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const channel = await createChannel(channelId.trim(), displayName.trim(), language, groupId)
      onClose()
      selectChannel(channel.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="bg-black/66 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--fg-primary)]">Create New Channel</h2>
          <button
            type="button"
            className="text-[var(--fg-muted)] transition-colors hover:text-[var(--fg-secondary)]"
            onClick={onClose}
          >
            &#x2715;
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-4 px-6 py-5">
          {/* Channel ID */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--fg-secondary)]">
              Channel ID
            </label>
            <input
              type="text"
              value={channelId}
              onChange={(e) =>
                setChannelId(e.target.value.toLowerCase().replaceAll(/[^a-z0-9-]/g, ""))
              }
              placeholder="my-channel"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 font-mono text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-[var(--fg-muted)]">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--fg-secondary)]">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Channel"
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          {/* Language */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--fg-secondary)]">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Feed Group */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--fg-secondary)]">
              Feed Group
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {groups.length === 0 ? (
                <option value="">No groups available</option>
              ) : (
                groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-[var(--status-error)]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-6 py-4">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--fg-secondary)] transition-colors hover:text-[var(--fg-primary)]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isValid || submitting}
            className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            onClick={handleSubmit}
          >
            {submitting ? "Creating..." : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  )
}
