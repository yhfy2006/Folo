import { render } from "@testing-library/react"
import * as React from "react"
import { describe, expect, it } from "vitest"

import { BrandIntro } from "../scenes/BrandIntro"
import { NewsCard } from "../scenes/NewsCard"
import { Outro } from "../scenes/Outro"
import { Overview } from "../scenes/Overview"
import type { IntroScene, NewsScene, OutroScene, OverviewScene } from "../types"

describe("BrandIntro", () => {
  const scene: IntroScene = { type: "intro", start: 0, end: 5 }

  it("renders the brand intro section", () => {
    const { getByTestId } = render(<BrandIntro scene={scene} date="2026-02-22" />)
    expect(getByTestId("brand-intro")).toBeDefined()
  })

  it("renders YOMOO logo", () => {
    const { getByTestId } = render(<BrandIntro scene={scene} date="2026-02-22" />)
    expect(getByTestId("yomoo-logo")).toBeDefined()
  })

  it("renders the date", () => {
    const { container } = render(<BrandIntro scene={scene} date="2026-02-22" />)
    expect(container.textContent).toContain("2026-02-22")
  })

  it("renders 每日AI快送 title", () => {
    const { container } = render(<BrandIntro scene={scene} date="2026-02-22" />)
    expect(container.textContent).toContain("每日AI快送")
  })
})

describe("Overview", () => {
  const scene: OverviewScene = {
    type: "overview",
    start: 5,
    end: 15,
    headlines: ["OpenAI 发布 GPT-5", "Apple 推出 AI 芯片", "Google Gemini 2.0"],
  }

  it("renders the overview section", () => {
    const { getByTestId } = render(<Overview scene={scene} />)
    expect(getByTestId("overview")).toBeDefined()
  })

  it("displays correct headline count", () => {
    const { container } = render(<Overview scene={scene} />)
    expect(container.textContent).toContain("3 条重点新闻")
  })

  it("renders all headlines", () => {
    const { container } = render(<Overview scene={scene} />)
    for (const headline of scene.headlines) {
      expect(container.textContent).toContain(headline)
    }
  })

  it("renders numbered circles for headlines", () => {
    const { container } = render(<Overview scene={scene} />)
    // Numbered circles render as separate elements: "1", "2", "3"
    expect(container.textContent).toContain("1")
    expect(container.textContent).toContain("2")
    expect(container.textContent).toContain("3")
  })
})

describe("NewsCard", () => {
  const scene: NewsScene = {
    type: "news",
    start: 15,
    end: 85,
    index: 1,
    total: 8,
    title: "OpenAI 发布 GPT-5",
    source: "TechCrunch",
    points: [
      { text: "性能提升 5 倍", showAt: 25 },
      { text: "原生多模态支持", showAt: 40 },
      { text: "价格降低 50%", showAt: 55 },
    ],
  }

  it("renders the news card", () => {
    const { getByTestId } = render(<NewsCard scene={scene} />)
    expect(getByTestId("news-card")).toBeDefined()
  })

  it("renders the title", () => {
    const { container } = render(<NewsCard scene={scene} />)
    expect(container.textContent).toContain("OpenAI 发布 GPT-5")
  })

  it("renders the source", () => {
    const { container } = render(<NewsCard scene={scene} />)
    expect(container.textContent).toContain("TechCrunch")
  })

  it("renders all points", () => {
    const { container } = render(<NewsCard scene={scene} />)
    expect(container.textContent).toContain("性能提升 5 倍")
    expect(container.textContent).toContain("原生多模态支持")
    expect(container.textContent).toContain("价格降低 50%")
  })

  it("renders the index number", () => {
    const { container } = render(<NewsCard scene={scene} />)
    expect(container.textContent).toContain("01")
  })

  it("renders progress bar", () => {
    const { getByTestId } = render(<NewsCard scene={scene} />)
    const fill = getByTestId("progress-fill")
    // 1/8 = 12.5%
    expect(fill.style.width).toBe("12.5%")
  })
})

describe("Outro", () => {
  const scene: OutroScene = { type: "outro", start: 570, end: 600 }

  it("renders the outro section", () => {
    const { getByTestId } = render(<Outro scene={scene} />)
    expect(getByTestId("outro")).toBeDefined()
  })

  it("renders CTA text", () => {
    const { container } = render(<Outro scene={scene} />)
    expect(container.textContent).toContain("订阅")
  })

  it("renders closing message", () => {
    const { container } = render(<Outro scene={scene} />)
    expect(container.textContent).toContain("明天见")
  })

  it("renders YOMOO logo", () => {
    const { getByTestId } = render(<Outro scene={scene} />)
    expect(getByTestId("yomoo-logo")).toBeDefined()
  })
})
