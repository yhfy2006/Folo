import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useChannelStore } from "../../stores/channel-store"

interface YouTubeSettingsProps {
  channel: Channel
}

export function YouTubeSettings({ channel }: YouTubeSettingsProps) {
  const { updateChannel } = useChannelStore()

  const yt = channel.youtube ?? {
    tags: [],
    titleTemplate: "",
    descriptionTemplate: "",
    shortsDescriptionTemplate: "",
  }

  const [titleTemplate, setTitleTemplate] = React.useState(yt.titleTemplate)
  const [tags, setTags] = React.useState<string[]>(yt.tags)
  const [tagInput, setTagInput] = React.useState("")
  const [descriptionTemplate, setDescriptionTemplate] = React.useState(yt.descriptionTemplate ?? "")
  const [shortsDescription, setShortsDescription] = React.useState(
    yt.shortsDescriptionTemplate ?? "",
  )
  const [saving, setSaving] = React.useState(false)
  const [oauthConnected, setOauthConnected] = React.useState(false)

  React.useEffect(() => {
    window.api.getPreferences().then((prefs: Record<string, unknown>) => {
      setOauthConnected(!!prefs.youtubeRefreshToken)
    })
  }, [])

  // Reset on channel change
  React.useEffect(() => {
    const y = channel.youtube ?? {
      tags: [],
      titleTemplate: "",
      descriptionTemplate: "",
      shortsDescriptionTemplate: "",
    }
    setTitleTemplate(y.titleTemplate)
    setTags(y.tags)
    setDescriptionTemplate(y.descriptionTemplate ?? "")
    setShortsDescription(y.shortsDescriptionTemplate ?? "")
  }, [channel.id, channel.youtube])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateChannel(channel.id, {
        youtube: {
          ...channel.youtube,
          titleTemplate,
          tags,
          descriptionTemplate,
          shortsDescriptionTemplate: shortsDescription,
        },
      })
    } finally {
      setSaving(false)
    }
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags([...tags, t])
    }
    setTagInput("")
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  // Live preview: resolve {{date}} to today
  const titlePreview = titleTemplate.replaceAll(
    "{{date}}",
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
  )

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">YouTube Settings</h2>
        <button
          type="button"
          className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* OAuth Status */}
      <div
        className={`flex w-[560px] items-center gap-3 rounded-lg px-4 py-3 text-sm ${
          oauthConnected
            ? "border border-green-500/30 bg-green-500/10 text-green-400"
            : "border border-yellow-500/30 bg-yellow-500/10 text-yellow-400"
        }`}
      >
        <span
          className={`inline-block size-2 rounded-full ${oauthConnected ? "bg-green-400" : "bg-yellow-400"}`}
        />
        <span>
          {oauthConnected ? "YouTube account connected" : "YouTube account not connected"}
        </span>
      </div>

      {/* Form */}
      <div className="flex w-[560px] flex-col gap-5">
        {/* Title Template */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Title Template</span>
          <input
            type="text"
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 font-mono text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
            placeholder="YOMOO Daily Report {{date}}"
          />
          {titleTemplate && (
            <span className="text-xs text-[var(--fg-muted)]">Preview: {titlePreview}</span>
          )}
        </label>

        {/* Default Tags */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Default Tags</span>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-[rgba(124,58,237,0.15)] px-2 py-0.5 text-xs font-medium text-[var(--accent-primary)]"
              >
                {tag}
                <button
                  type="button"
                  className="ml-0.5 text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
                  onClick={() => removeTag(tag)}
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              placeholder={tags.length === 0 ? "Add tags..." : ""}
              className="min-w-[80px] flex-1 bg-transparent text-sm text-[var(--fg-primary)] outline-none placeholder:text-[var(--fg-muted)]"
            />
          </div>
        </div>

        {/* Description Template */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">
            Description Template
          </span>
          <textarea
            value={descriptionTemplate}
            onChange={(e) => setDescriptionTemplate(e.target.value)}
            rows={6}
            className="resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
            placeholder="Video description..."
          />
        </label>

        {/* Shorts Description Template */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">
            Shorts Description Template
          </span>
          <textarea
            value={shortsDescription}
            onChange={(e) => setShortsDescription(e.target.value)}
            rows={4}
            className="resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
            placeholder="Shorts description..."
          />
        </label>
      </div>
    </div>
  )
}
