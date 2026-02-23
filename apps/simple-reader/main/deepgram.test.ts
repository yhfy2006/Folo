import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { transcribeAudio } from "./deepgram"

// Mock node:fs
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(() => Buffer.from("fake-audio-data")),
  },
}))

describe("deepgram", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("transcribeAudio", () => {
    it("should call Deepgram API with correct parameters", async () => {
      const mockResponse = {
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "大家好 欢迎收听",
                  words: [
                    { word: "大家好", start: 0.5, end: 1.2, confidence: 0.98 },
                    { word: "欢迎", start: 1.3, end: 1.8, confidence: 0.97 },
                    { word: "收听", start: 1.9, end: 2.3, confidence: 0.96 },
                  ],
                },
              ],
            },
          ],
        },
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await transcribeAudio("/path/to/audio.mp3", "test-api-key")

      expect(fetch).toHaveBeenCalledOnce()
      const [url, options] = vi.mocked(fetch).mock.calls[0]!
      expect(url).toContain("https://api.deepgram.com/v1/listen")
      expect(url).toContain("model=nova-3")
      expect(url).toContain("language=zh")
      expect(url).toContain("punctuate=true")
      expect(url).toContain("utterances=true")
      expect(url).toContain("smart_format=true")
      expect(options?.method).toBe("POST")
      expect(options?.headers).toMatchObject({
        Authorization: "Token test-api-key",
        "Content-Type": "audio/mpeg",
      })

      expect(result.words).toHaveLength(3)
      expect(result.words[0]).toEqual({
        word: "大家好",
        start: 0.5,
        end: 1.2,
        confidence: 0.98,
      })
      expect(result.transcript).toBe("大家好 欢迎收听")
    })

    it("should handle 401 unauthorized error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })

      await expect(transcribeAudio("/path/to/audio.mp3", "bad-key")).rejects.toThrow(
        /401.*Unauthorized/,
      )
    })

    it("should handle 429 rate limit error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })

      await expect(transcribeAudio("/path/to/audio.mp3", "test-key")).rejects.toThrow(
        /429.*Too Many Requests/,
      )
    })

    it("should handle network errors", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

      await expect(transcribeAudio("/path/to/audio.mp3", "test-key")).rejects.toThrow(
        "Network error",
      )
    })

    it("should handle empty response gracefully", async () => {
      const mockResponse = {
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: "",
                  words: [],
                },
              ],
            },
          ],
        },
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await transcribeAudio("/path/to/audio.mp3", "test-key")
      expect(result.words).toHaveLength(0)
      expect(result.transcript).toBe("")
    })

    it("should pass onStatus callback", async () => {
      const mockResponse = {
        results: {
          channels: [
            {
              alternatives: [{ transcript: "test", words: [] }],
            },
          ],
        },
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const onStatus = vi.fn()
      await transcribeAudio("/path/to/audio.mp3", "test-key", { onStatus })

      expect(onStatus).toHaveBeenCalled()
    })
  })
})
