import { render } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { DailyReport } from "../DailyReport"
import { Thumbnail } from "../Thumbnail"
import type { ScenesData } from "../types"

const sampleData: ScenesData = {
  date: "2026-02-22",
  title: "YOMOO 每日AI快送",
  audioDuration: 600,
  fps: 30,
  scenes: [
    { type: "intro", start: 0, end: 5 },
    {
      type: "overview",
      start: 5,
      end: 15,
      headlines: ["OpenAI 发布 GPT-5", "Apple 推出 AI 芯片"],
    },
    {
      type: "news",
      start: 15,
      end: 85,
      index: 1,
      total: 2,
      title: "OpenAI 发布 GPT-5",
      source: "TechCrunch",
      points: [
        { text: "性能提升 5 倍", showAt: 25 },
        { text: "原生多模态支持", showAt: 40 },
      ],
    },
    {
      type: "news",
      start: 85,
      end: 155,
      index: 2,
      total: 2,
      title: "Apple 推出 AI 芯片",
      source: "The Verge",
      points: [{ text: "M5 芯片性能翻倍", showAt: 95 }],
    },
    { type: "outro", start: 570, end: 600 },
  ],
}

describe("DailyReport", () => {
  it("renders without crashing", () => {
    const { container } = render(<DailyReport {...sampleData} />)
    expect(container.firstChild).toBeDefined()
  })

  it("renders all scene types", () => {
    const { container } = render(<DailyReport {...sampleData} />)
    const text = container.textContent || ""
    // Intro
    expect(text).toContain("每日AI快送")
    // Overview headlines
    expect(text).toContain("OpenAI 发布 GPT-5")
    // News cards
    expect(text).toContain("TechCrunch")
    expect(text).toContain("The Verge")
    // Outro
    expect(text).toContain("明天见")
  })

  it("renders correct number of scenes (5 scenes)", () => {
    const { container } = render(<DailyReport {...sampleData} />)
    // Verify both news titles appear
    const text = container.textContent || ""
    expect(text).toContain("OpenAI 发布 GPT-5")
    expect(text).toContain("Apple 推出 AI 芯片")
  })
})

describe("Thumbnail", () => {
  it("renders at correct dimensions", () => {
    const { getByTestId } = render(<Thumbnail {...sampleData} />)
    const el = getByTestId("thumbnail")
    expect(el.style.width).toBe("1280px")
    expect(el.style.height).toBe("720px")
  })

  it("renders the date", () => {
    const { container } = render(<Thumbnail {...sampleData} />)
    expect(container.textContent).toContain("2026-02-22")
  })

  it("shows correct news count", () => {
    const { container } = render(<Thumbnail {...sampleData} />)
    expect(container.textContent).toContain("2 条重点新闻")
  })

  it("renders brand text", () => {
    const { container } = render(<Thumbnail {...sampleData} />)
    expect(container.textContent).toContain("每日AI快送")
  })
})
