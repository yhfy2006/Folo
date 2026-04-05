import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useChannelStore } from "../../stores/channel-store"

const TTS_PROVIDERS = [
  { value: "minimax", label: "MiniMax" },
  { value: "deepgram", label: "Deepgram" },
]

interface TTSSettingsProps {
  channel: Channel
}

export function TTSSettings({ channel }: TTSSettingsProps) {
  const { updateChannel } = useChannelStore()

  const [provider, setProvider] = React.useState(channel.tts.provider)
  const [voiceId, setVoiceId] = React.useState(channel.tts.voiceId)
  const [model, setModel] = React.useState(channel.tts.model)
  const [speed, setSpeed] = React.useState(channel.tts.speed ?? 1)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setProvider(channel.tts.provider)
    setVoiceId(channel.tts.voiceId)
    setModel(channel.tts.model)
    setSpeed(channel.tts.speed ?? 1)
  }, [channel.id, channel.tts.provider, channel.tts.voiceId, channel.tts.model, channel.tts.speed])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateChannel(channel.id, {
        tts: { provider, voiceId, model, speed },
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--fg-primary)]">TTS & Audio Settings</h2>
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
        {/* Provider */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          >
            {TTS_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* Voice ID */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Voice ID</span>
          <input
            type="text"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </label>

        {/* Model */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-tertiary)] px-3 py-2 text-sm text-[var(--fg-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </label>

        {/* Speed */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--fg-secondary)]">
            Speed — {speed.toFixed(1)}x
          </span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number.parseFloat(e.target.value))}
            className="accent-[var(--accent-primary)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--fg-muted)]">
            <span>0.5x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </label>
      </div>

      {/* Voice Preview */}
      <div className="flex w-[560px] items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-5">
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white transition-opacity hover:opacity-90"
          title="Preview voice"
        >
          &#x25B6;
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-[var(--fg-primary)]">Voice Preview</span>
          <span className="text-xs text-[var(--fg-muted)]">
            Click to hear a sample with the current voice settings ({provider} / {voiceId})
          </span>
        </div>
      </div>
    </div>
  )
}
