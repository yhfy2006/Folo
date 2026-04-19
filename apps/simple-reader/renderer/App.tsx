import * as React from "react"
import { useEffect } from "react"

import { ChannelDetail } from "./components/ChannelDetail"
import { Dashboard } from "./components/Dashboard"
import { useChannelStore } from "./stores/channel-store"
import { useReportStore } from "./stores/report-store"

export function App() {
  const { view, loadChannels } = useChannelStore()

  useEffect(() => {
    if (!window.api) {
      console.error("window.api is not available - preload script may not have loaded")
      return
    }

    loadChannels()
  }, [loadChannels])

  // Listen for scheduled pipeline auto-trigger from main process.
  // This must be in App (always mounted), not inside a tab component.
  useEffect(() => {
    if (!window.api) return

    const cleanup = window.api.onPipelineAutoTrigger((groupId?: string) => {
      if (!groupId) return
      const { channels, selectChannel, setActiveTab } = useChannelStore.getState()
      const channel = channels.find((c) => c.groupId === groupId)
      if (channel) {
        selectChannel(channel.id)
        setActiveTab("pipeline")
      }
      // Start pipeline via report store
      const { pipelineRunning, startPipeline } = useReportStore.getState()
      if (!pipelineRunning) {
        console.info("[auto-trigger] Scheduled pipeline triggered for group", groupId)
        startPipeline(groupId)
      }
    })
    return () => {
      cleanup?.()
    }
  }, [])

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ background: "var(--surface-primary)", color: "var(--fg-primary)" }}
      data-theme="dark"
    >
      {/* Draggable title bar region */}
      <div className="h-10 shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />
      {view === "dashboard" ? <Dashboard /> : <ChannelDetail />}
    </div>
  )
}
