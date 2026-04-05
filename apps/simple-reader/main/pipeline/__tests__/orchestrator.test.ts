import os from "node:os"

import { describe, expect, it, vi } from "vitest"

import { createContext } from "../context"
import { buildStageList, resolveStartIndex } from "../orchestrator"
import type { StageDefinition } from "../types"

vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() } }))
vi.mock("../../preferences", () => ({
  loadPreferences: vi.fn(() => ({
    language: "en",
    interests: [],
    reportStyle: "detailed",
    timeRange: 24,
    minimaxApiKey: "test",
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

const makeStage = (name: string, shouldRun = true): StageDefinition => ({
  name: name as any,
  label: name,
  shouldRun: () => shouldRun,
  run: vi.fn(async (ctx) => ctx),
})

describe("orchestrator", () => {
  it("buildStageList filters out disabled stages", () => {
    const ctx = createContext()
    const stages = [makeStage("verify"), makeStage("report"), makeStage("video", false)]
    const filtered = buildStageList(stages, ctx)
    expect(filtered.map((s) => s.name)).toEqual(["verify", "report"])
  })

  it("resolveStartIndex returns 0 for full run", () => {
    const stages = [makeStage("verify"), makeStage("report"), makeStage("podcast")]
    expect(resolveStartIndex(stages)).toBe(0)
  })

  it("resolveStartIndex finds correct stage by name", () => {
    const stages = [makeStage("verify"), makeStage("report"), makeStage("podcast")]
    expect(resolveStartIndex(stages, "report")).toBe(1)
  })

  it("resolveStartIndex throws for unknown stage", () => {
    const stages = [makeStage("verify")]
    expect(() => resolveStartIndex(stages, "unknown" as any)).toThrow()
  })
})
