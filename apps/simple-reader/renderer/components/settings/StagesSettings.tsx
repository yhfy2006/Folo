import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useChannelStore } from "../../stores/channel-store"

const ALL_STAGES = [
  { name: "verify", number: 1, description: "Verify GitHub token and required API keys" },
  { name: "reflect", number: 2, description: "Reflect on past reports to improve quality" },
  { name: "report", number: 3, description: "Generate AI-powered daily report from feeds" },
  { name: "podcast", number: 4, description: "Convert report into podcast script" },
  { name: "audio", number: 5, description: "Synthesize speech audio via TTS provider" },
  { name: "upload", number: 6, description: "Upload audio to GitHub Releases" },
  { name: "publish", number: 7, description: "Generate HTML page and publish to GitHub Pages" },
  { name: "video", number: 8, description: "Render video with Remotion and audio alignment" },
  { name: "youtube", number: 9, description: "Upload video to YouTube" },
  { name: "shorts", number: 10, description: "Generate and upload YouTube Shorts" },
] as const

interface StagesSettingsProps {
  channel: Channel
}

export function StagesSettings({ channel }: StagesSettingsProps) {
  const { updateChannel } = useChannelStore()

  const [enabledStages, setEnabledStages] = React.useState<string[]>([...channel.stages])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setEnabledStages([...channel.stages])
  }, [channel.id, channel.stages])

  const toggleStage = (stageName: string) => {
    setEnabledStages((prev) =>
      prev.includes(stageName) ? prev.filter((s) => s !== stageName) : [...prev, stageName],
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateChannel(channel.id, { stages: enabledStages })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-[var(--fg-primary)]">Pipeline Stages</h2>
          <p className="text-xs text-[var(--fg-muted)]">
            Enable or disable individual stages in the YOMOO pipeline
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Stages list */}
      <div className="flex w-[560px] flex-col gap-1">
        {ALL_STAGES.map((stage) => {
          const enabled = enabledStages.includes(stage.name)
          return (
            <div
              key={stage.name}
              className="flex items-center gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-[var(--surface-secondary)]"
            >
              {/* Toggle switch */}
              <button
                type="button"
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  enabled ? "bg-[var(--status-success)]" : "bg-[var(--surface-tertiary)]"
                }`}
                onClick={() => toggleStage(stage.name)}
                role="switch"
                aria-checked={enabled}
              >
                <span
                  className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>

              {/* Stage number */}
              <span className="w-6 font-mono text-xs text-[var(--fg-muted)]">{stage.number}</span>

              {/* Name + description */}
              <div className="flex flex-1 flex-col">
                <span className="text-sm font-medium text-[var(--fg-primary)]">{stage.name}</span>
                <span className="text-xs text-[var(--fg-muted)]">{stage.description}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
