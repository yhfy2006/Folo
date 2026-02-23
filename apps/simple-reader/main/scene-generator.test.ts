import { describe, expect, it } from "vitest"

import type { DeepgramWord } from "./deepgram"
import { alignTranscriptWithScript } from "./scene-generator"

describe("scene-generator", () => {
  describe("alignTranscriptWithScript", () => {
    it("should align a single paragraph with Deepgram words", () => {
      const words: DeepgramWord[] = [
        { word: "大家好", start: 0.5, end: 1.2, confidence: 0.98 },
        { word: "欢迎", start: 1.3, end: 1.8, confidence: 0.97 },
        { word: "收听", start: 1.9, end: 2.3, confidence: 0.96 },
        { word: "今天", start: 2.5, end: 3, confidence: 0.95 },
        { word: "的", start: 3, end: 3.1, confidence: 0.99 },
        { word: "节目", start: 3.2, end: 3.8, confidence: 0.97 },
      ]

      const script = "大家好，欢迎收听今天的节目。"

      const result = alignTranscriptWithScript(words, script)

      expect(result).toHaveLength(1)
      expect(result[0]!.text).toBe("大家好，欢迎收听今天的节目。")
      expect(result[0]!.start).toBe(0.5)
      expect(result[0]!.end).toBe(3.8)
    })

    it("should align multiple paragraphs correctly", () => {
      const words: DeepgramWord[] = [
        { word: "大家好", start: 0.5, end: 1.2, confidence: 0.98 },
        { word: "欢迎", start: 1.3, end: 1.8, confidence: 0.97 },
        { word: "收听", start: 1.9, end: 2.3, confidence: 0.96 },
        { word: "今天", start: 5, end: 5.5, confidence: 0.95 },
        { word: "第一条", start: 5.6, end: 6.2, confidence: 0.94 },
        { word: "新闻", start: 6.3, end: 6.8, confidence: 0.93 },
        { word: "是", start: 6.9, end: 7, confidence: 0.99 },
        { word: "关于", start: 7.1, end: 7.5, confidence: 0.95 },
        { word: "AI", start: 7.6, end: 8, confidence: 0.92 },
      ]

      const script = "大家好，欢迎收听。\n\n今天第一条新闻是关于AI。"

      const result = alignTranscriptWithScript(words, script)

      expect(result).toHaveLength(2)
      expect(result[0]!.text).toBe("大家好，欢迎收听。")
      expect(result[0]!.start).toBe(0.5)
      expect(result[0]!.end).toBe(2.3)

      expect(result[1]!.text).toBe("今天第一条新闻是关于AI。")
      expect(result[1]!.start).toBe(5)
      expect(result[1]!.end).toBe(8)
    })

    it("should handle single paragraph input", () => {
      const words: DeepgramWord[] = [{ word: "你好", start: 0, end: 0.5, confidence: 0.99 }]

      const script = "你好"

      const result = alignTranscriptWithScript(words, script)

      expect(result).toHaveLength(1)
      expect(result[0]!.text).toBe("你好")
      expect(result[0]!.start).toBe(0)
      expect(result[0]!.end).toBe(0.5)
    })

    it("should handle mismatched text with fuzzy matching", () => {
      // Deepgram might transcribe slightly differently
      const words: DeepgramWord[] = [
        { word: "大家好", start: 0.5, end: 1.2, confidence: 0.98 },
        { word: "欢迎", start: 1.3, end: 1.8, confidence: 0.97 },
        // Deepgram might misheard something
        { word: "今天", start: 5, end: 5.5, confidence: 0.7 },
        { word: "的", start: 5.6, end: 5.7, confidence: 0.9 },
        { word: "新闻", start: 5.8, end: 6.2, confidence: 0.85 },
      ]

      const script = "大家好，欢迎。\n\n今天的新闻。"

      const result = alignTranscriptWithScript(words, script)

      expect(result).toHaveLength(2)
      // Original text preserved
      expect(result[0]!.text).toBe("大家好，欢迎。")
      expect(result[1]!.text).toBe("今天的新闻。")
    })

    it("should handle empty words array", () => {
      const result = alignTranscriptWithScript([], "一些文字")

      expect(result).toHaveLength(1)
      expect(result[0]!.text).toBe("一些文字")
      expect(result[0]!.start).toBe(0)
      expect(result[0]!.end).toBe(0)
    })

    it("should handle empty script", () => {
      const words: DeepgramWord[] = [{ word: "test", start: 0, end: 1, confidence: 0.9 }]

      const result = alignTranscriptWithScript(words, "")

      expect(result).toHaveLength(0)
    })

    it("should filter out blank paragraphs", () => {
      const words: DeepgramWord[] = [
        { word: "你好", start: 0, end: 0.5, confidence: 0.99 },
        { word: "世界", start: 0.6, end: 1, confidence: 0.99 },
      ]

      const script = "你好\n\n\n\n世界"

      const result = alignTranscriptWithScript(words, script)

      expect(result).toHaveLength(2)
    })
  })

  // generateScenes is tested separately since it requires mocking child_process
  describe("generateScenes", () => {
    it("should be importable", async () => {
      const mod = await import("./scene-generator")
      expect(mod.generateScenes).toBeDefined()
    })
  })
})
