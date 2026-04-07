import os from "node:os"

import { describe, expect, it, vi } from "vitest"

import type { Channel } from "../channel-types"
import { createContext } from "../context"
import { discoverStage } from "../stages/discover"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "",
    ttsVoiceId: "",
    ttsModel: "",
    githubToken: "ghp_test",
    githubOwner: "test",
    pipelineSchedule: "",
    workerUrl: "",
    workerSecret: "",
    deepgramApiKey: "",
    youtubeClientId: "",
    youtubeClientSecret: "",
    youtubeRefreshToken: "",
    youtubeEnabled: false,
    youtubeShortsEnabled: false,
  })),
}))

// Mock database — return test entries
const mockEntries = [
  {
    id: "e1",
    title: "OpenAI releases GPT-5 model",
    feed_title: "TechCrunch",
    feed_id: "f1",
    created_at: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    id: "e2",
    title: "OpenAI GPT-5 now available for developers",
    feed_title: "The Verge",
    feed_id: "f2",
    created_at: Math.floor(Date.now() / 1000) - 7200,
  },
  {
    id: "e3",
    title: "GPT-5 released by OpenAI with new capabilities",
    feed_title: "Ars Technica",
    feed_id: "f3",
    created_at: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    id: "e4",
    title: "Rust 1.80 released with new features",
    feed_title: "Rust Blog",
    feed_id: "f4",
    created_at: Math.floor(Date.now() / 1000) - 18000,
  },
  {
    id: "e5",
    title: "New JavaScript framework benchmarks 2026",
    feed_title: "Dev.to",
    feed_id: "f5",
    created_at: Math.floor(Date.now() / 1000) - 72000,
  },
]

vi.mock("../../database", () => ({
  queryAll: vi.fn(() => mockEntries),
  execute: vi.fn(),
  saveDatabase: vi.fn(),
}))

const fakeChannel: Channel = {
  id: "test",
  name: "Test",
  language: "en",
  groupId: "g1",
  tts: { provider: "minimax", voiceId: "", model: "speech-02-hd" },
  stages: ["verify", "discover", "report"],
  promptDir: "/tmp/prompts",
  skillsDir: "/tmp/skills",
} as Channel

describe("discover stage", () => {
  it("shouldRun returns true when channel exists", () => {
    const ctx = createContext({ channel: fakeChannel })
    expect(discoverStage.shouldRun(ctx)).toBe(true)
  })

  it("shouldRun returns false when no channel", () => {
    const ctx = createContext()
    expect(discoverStage.shouldRun(ctx)).toBe(false)
  })

  it("clusters similar titles and scores source overlap", async () => {
    const ctx = createContext({ channel: fakeChannel, groupId: "g1" })
    const statuses: string[] = []
    const result = await discoverStage.run(ctx, { onStatus: (s) => statuses.push(s) })

    expect(result.discoverySignals).toBeDefined()
    const signals = result.discoverySignals!

    // GPT-5 entries (e1, e2, e3) should cluster together with high overlap score
    const gpt5Signals = signals.filter(
      (s) => s.title.toLowerCase().includes("gpt-5") || s.title.toLowerCase().includes("openai"),
    )
    expect(gpt5Signals.length).toBe(3)
    // 3 sources → sourceOverlap score should be 7
    for (const s of gpt5Signals) {
      expect(s.signals.sourceOverlap).toBe(7)
      expect(s.overlappingSources).toHaveLength(3)
    }

    // Rust entry (e4) should be solo — sourceOverlap = 0
    const rustSignal = signals.find((s) => s.title.includes("Rust"))
    expect(rustSignal).toBeDefined()
    expect(rustSignal!.signals.sourceOverlap).toBe(0)
  })

  it("scores recency based on publish time", async () => {
    const ctx = createContext({ channel: fakeChannel, groupId: "g1" })
    const result = await discoverStage.run(ctx, { onStatus: () => {} })
    const signals = result.discoverySignals!

    // e1 is 1 hour old → recency should be 10
    const e1Signal = signals.find((s) => s.entryId === "e1")
    expect(e1Signal!.signals.recency).toBe(10)

    // e5 is 20 hours old → recency should be 4
    const e5Signal = signals.find((s) => s.entryId === "e5")
    expect(e5Signal!.signals.recency).toBe(4)
  })

  it("computes composite heatScore correctly", async () => {
    const ctx = createContext({ channel: fakeChannel, groupId: "g1" })
    const result = await discoverStage.run(ctx, { onStatus: () => {} })
    const signals = result.discoverySignals!

    // GPT-5 e1: sourceOverlap=7, recency=10 → 7*0.7 + 10*0.3 = 4.9 + 3.0 = 7.9
    const e1Signal = signals.find((s) => s.entryId === "e1")
    expect(e1Signal!.heatScore).toBe(7.9)

    // Rust e4: sourceOverlap=0, recency=10 (5h old < 6h) → 0*0.7 + 10*0.3 = 3.0
    const rustSignal = signals.find((s) => s.entryId === "e4")
    expect(rustSignal!.heatScore).toBe(3)
  })

  it("returns sorted by heatScore descending", async () => {
    const ctx = createContext({ channel: fakeChannel, groupId: "g1" })
    const result = await discoverStage.run(ctx, { onStatus: () => {} })
    const signals = result.discoverySignals!

    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].heatScore).toBeGreaterThanOrEqual(signals[i].heatScore)
    }
  })
})
