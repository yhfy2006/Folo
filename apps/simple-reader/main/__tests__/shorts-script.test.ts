import { describe, expect, it, vi } from "vitest"

import { parseShortsScriptResult } from "../ai-report"

vi.mock("../database", () => ({
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(),
  execute: vi.fn(),
  saveDatabase: vi.fn(),
}))

vi.mock("../skills", () => ({
  loadAllSkills: vi.fn(() => []),
  formatSkillsPrompt: vi.fn(() => ""),
}))

vi.mock("../workspace", () => ({
  getWorkspacePath: vi.fn(() => "/tmp"),
}))

describe("parseShortsScriptResult", () => {
  it("should parse valid JSON result from Claude", () => {
    const result = JSON.stringify({
      title: "AI接管你的电脑了！Claude直接操控Mac",
      headline: "AI接管电脑",
      script: "你知道吗，Claude现在可以直接操控你的Mac电脑了。关注看更多每日AI快送。",
      newsUrl: "https://example.com/article",
      ogImageUrl: "https://example.com/og.jpg",
      keyPoints: ["直接操控Mac", "打开应用写代码", "自动发邮件"],
    })

    const parsed = parseShortsScriptResult(result)

    expect(parsed).toEqual({
      title: "AI接管你的电脑了！Claude直接操控Mac",
      headline: "AI接管电脑",
      script: expect.stringContaining("Claude"),
      newsUrl: "https://example.com/article",
      ogImageUrl: "https://example.com/og.jpg",
      keyPoints: ["直接操控Mac", "打开应用写代码", "自动发邮件"],
    })
  })

  it("should default keyPoints to empty array when missing", () => {
    const result = JSON.stringify({
      title: "Test",
      headline: "测试",
      script: "Test script.",
      newsUrl: "https://example.com",
    })

    const parsed = parseShortsScriptResult(result)
    expect(parsed.keyPoints).toEqual([])
  })

  it("should handle result with extra text around JSON", () => {
    const result = `Here is the result:
{
  "title": "Test Title",
  "headline": "测试标题",
  "script": "Test script content.",
  "newsUrl": "https://example.com"
}
Some trailing text.`

    const parsed = parseShortsScriptResult(result)
    expect(parsed.title).toBe("Test Title")
    expect(parsed.headline).toBe("测试标题")
    expect(parsed.script).toBe("Test script content.")
    expect(parsed.ogImageUrl).toBeUndefined()
    expect(parsed.keyPoints).toEqual([])
  })

  it("should throw on invalid result", () => {
    expect(() => parseShortsScriptResult("not json at all")).toThrow()
  })

  it("should throw if required fields are missing", () => {
    const result = JSON.stringify({ title: "Only title" })
    expect(() => parseShortsScriptResult(result)).toThrow()
  })
})
