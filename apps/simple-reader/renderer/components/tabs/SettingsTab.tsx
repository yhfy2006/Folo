import * as React from "react"

import type { Channel } from "../../stores/channel-store"
import { useChannelStore } from "../../stores/channel-store"
import { GeneralSettings } from "../settings/GeneralSettings"
import { PromptsEditor } from "../settings/PromptsEditor"
import { StagesSettings } from "../settings/StagesSettings"
import { TTSSettings } from "../settings/TTSSettings"
import { YouTubeSettings } from "../settings/YouTubeSettings"

type SettingsSubNav = "general" | "tts" | "youtube" | "prompts" | "stages"

const NAV_ITEMS: { id: SettingsSubNav; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "\u2699" },
  { id: "tts", label: "TTS & Audio", icon: "\u266B" },
  { id: "youtube", label: "YouTube", icon: "\u25B6" },
  { id: "prompts", label: "Prompts", icon: "\u270E" },
  { id: "stages", label: "Stages", icon: "\u2630" },
]

interface SettingsTabProps {
  channel: Channel
}

export function SettingsTab({ channel }: SettingsTabProps) {
  const { settingsSubNav, setSettingsSubNav } = useChannelStore()

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-[var(--border-subtle)]">
      {/* Left sidebar */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-secondary)]">
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--fg-primary)]">Settings</h3>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                settingsSubNav === item.id
                  ? "bg-[var(--surface-tertiary)] font-medium text-[var(--fg-primary)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg-secondary)]"
              }`}
              onClick={() => setSettingsSubNav(item.id)}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto p-8">
        {settingsSubNav === "general" && <GeneralSettings channel={channel} />}
        {settingsSubNav === "tts" && <TTSSettings channel={channel} />}
        {settingsSubNav === "youtube" && <YouTubeSettings channel={channel} />}
        {settingsSubNav === "prompts" && <PromptsEditor channel={channel} />}
        {settingsSubNav === "stages" && <StagesSettings channel={channel} />}
      </div>
    </div>
  )
}
