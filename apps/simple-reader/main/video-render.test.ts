import { spawn } from "node:child_process"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderThumbnail, renderVideo } from "./video-render"

// Mock child_process before importing
/* eslint-disable unicorn/prefer-event-target -- Node EventEmitter needed for child_process mock */
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events") as typeof import("node:events")

  function createMockProcess() {
    const proc = new EventEmitter()
    ;(proc as any).stdin = { write: vi.fn(), end: vi.fn(), on: vi.fn() }
    ;(proc as any).stdout = new EventEmitter()
    ;(proc as any).stderr = new EventEmitter()
    return proc
  }

  return {
    spawn: vi.fn(() => createMockProcess()),
  }
})

describe("video-render", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("renderVideo", () => {
    it("should spawn remotion render with correct arguments", async () => {
      const promise = renderVideo(
        "/path/to/scenes.json",
        "/path/to/audio.mp3",
        "/path/to/output.mp4",
      )

      // Get the spawned process
      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      expect(spawn).toHaveBeenCalledOnce()
      const [cmd, args] = vi.mocked(spawn).mock.calls[0]!
      expect(cmd).toBe("npx")
      expect(args).toContain("remotion")
      expect(args).toContain("render")
      expect(args).toContain("--codec")
      expect(args).toContain("h264")
      expect(args).toContain("--fps")
      expect(args).toContain("30")
      expect(args).toContain("--output")
      expect(args).toContain("/path/to/output.mp4")

      // Simulate successful exit
      proc.emit("close", 0)

      const result = await promise
      expect(result).toBe("/path/to/output.mp4")
    })

    it("should parse progress from stderr", async () => {
      const onProgress = vi.fn()

      const promise = renderVideo(
        "/path/to/scenes.json",
        "/path/to/audio.mp3",
        "/path/to/output.mp4",
        { onProgress },
      )

      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      // Simulate progress output from Remotion
      proc.stderr.emit("data", Buffer.from("Rendering: 25% done"))
      proc.stderr.emit("data", Buffer.from("Rendering: 50% done"))
      proc.stderr.emit("data", Buffer.from("Rendering: 75% done"))

      proc.emit("close", 0)

      await promise

      expect(onProgress).toHaveBeenCalled()
    })

    it("should reject on non-zero exit code", async () => {
      const promise = renderVideo(
        "/path/to/scenes.json",
        "/path/to/audio.mp3",
        "/path/to/output.mp4",
      )

      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      proc.stderr.emit("data", Buffer.from("Error: composition not found"))
      proc.emit("close", 1)

      await expect(promise).rejects.toThrow(/exited with code 1/)
    })

    it("should reject on spawn error", async () => {
      const promise = renderVideo(
        "/path/to/scenes.json",
        "/path/to/audio.mp3",
        "/path/to/output.mp4",
      )

      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      proc.emit("error", new Error("ENOENT: npx not found"))

      await expect(promise).rejects.toThrow(/npx not found/)
    })

    it("should pass onStatus callback", async () => {
      const onStatus = vi.fn()

      const promise = renderVideo(
        "/path/to/scenes.json",
        "/path/to/audio.mp3",
        "/path/to/output.mp4",
        { onStatus },
      )

      const proc = vi.mocked(spawn).mock.results[0]!.value as any
      proc.emit("close", 0)

      await promise

      expect(onStatus).toHaveBeenCalled()
    })
  })

  describe("renderThumbnail", () => {
    it("should spawn remotion still with correct arguments", async () => {
      const promise = renderThumbnail("/path/to/scenes.json", "/path/to/thumbnail.png")

      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      expect(spawn).toHaveBeenCalledOnce()
      const [cmd, args] = vi.mocked(spawn).mock.calls[0]!
      expect(cmd).toBe("npx")
      expect(args).toContain("remotion")
      expect(args).toContain("still")
      expect(args).toContain("--output")
      expect(args).toContain("/path/to/thumbnail.png")
      expect(args).toContain("--width")
      expect(args).toContain("1280")
      expect(args).toContain("--height")
      expect(args).toContain("720")

      proc.emit("close", 0)

      const result = await promise
      expect(result).toBe("/path/to/thumbnail.png")
    })

    it("should reject on failure", async () => {
      const promise = renderThumbnail("/path/to/scenes.json", "/path/to/thumbnail.png")

      const proc = vi.mocked(spawn).mock.results[0]!.value as any

      proc.stderr.emit("data", Buffer.from("Render failed"))
      proc.emit("close", 1)

      await expect(promise).rejects.toThrow(/exited with code 1/)
    })
  })
})
