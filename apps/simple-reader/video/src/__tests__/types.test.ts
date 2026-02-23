import { describe, expect, it } from "vitest"

import type { Scene, ScenesData } from "../types"

describe("types", () => {
  it("ScenesData accepts valid data structure", () => {
    const data: ScenesData = {
      date: "2026-02-22",
      title: "YOMOO 每日AI快送",
      audioDuration: 600,
      fps: 30,
      scenes: [
        { type: "intro", start: 0, end: 5 },
        { type: "overview", start: 5, end: 15, headlines: ["Test"] },
        {
          type: "news",
          start: 15,
          end: 85,
          index: 1,
          total: 1,
          title: "Test",
          source: "Test",
          points: [{ text: "Point", showAt: 25 }],
        },
        { type: "outro", start: 570, end: 600 },
      ],
    }
    expect(data.scenes).toHaveLength(4)
    expect(data.scenes[0].type).toBe("intro")
    expect(data.scenes[1].type).toBe("overview")
    expect(data.scenes[2].type).toBe("news")
    expect(data.scenes[3].type).toBe("outro")
  })

  it("Scene union type discriminates correctly", () => {
    const scenes: Scene[] = [
      { type: "intro", start: 0, end: 5 },
      { type: "overview", start: 5, end: 15, headlines: [] },
      {
        type: "news",
        start: 15,
        end: 85,
        index: 1,
        total: 1,
        title: "T",
        source: "S",
        points: [],
      },
      { type: "outro", start: 570, end: 600 },
    ]

    for (const scene of scenes) {
      switch (scene.type) {
        case "intro": {
          expect(scene.start).toBeDefined()
          break
        }
        case "overview": {
          expect(scene.headlines).toBeDefined()
          break
        }
        case "news": {
          expect(scene.title).toBeDefined()
          expect(scene.points).toBeDefined()
          break
        }
        case "outro": {
          expect(scene.end).toBeDefined()
          break
        }
      }
    }
  })
})
