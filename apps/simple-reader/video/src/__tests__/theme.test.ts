import { describe, expect, it } from "vitest"

import { colors, fonts, spacing, thumbnail, video } from "../styles/theme"

describe("theme", () => {
  describe("colors", () => {
    it("has correct background color", () => {
      expect(colors.background).toBe("#1a1410")
    })

    it("has correct primary color (amber orange)", () => {
      expect(colors.primary).toBe("#E8722A")
    })

    it("has correct secondary color (gold)", () => {
      expect(colors.secondary).toBe("#D4A053")
    })

    it("has correct text color (warm white)", () => {
      expect(colors.text).toBe("#f5efe6")
    })

    it("has correct muted color", () => {
      expect(colors.muted).toBe("#8a7e6e")
    })
  })

  describe("fonts", () => {
    it("has Noto Sans SC as body font", () => {
      expect(fonts.body).toContain("Noto Sans SC")
    })

    it("has Playfair Display as brand font", () => {
      expect(fonts.brand).toContain("Playfair Display")
    })
  })

  describe("video dimensions", () => {
    it("is 1920x1080 at 30fps", () => {
      expect(video.width).toBe(1920)
      expect(video.height).toBe(1080)
      expect(video.fps).toBe(30)
    })
  })

  describe("thumbnail dimensions", () => {
    it("is 1280x720", () => {
      expect(thumbnail.width).toBe(1280)
      expect(thumbnail.height).toBe(720)
    })
  })

  describe("spacing", () => {
    it("has all spacing values defined", () => {
      expect(spacing.xs).toBe(8)
      expect(spacing.sm).toBe(16)
      expect(spacing.md).toBe(24)
      expect(spacing.lg).toBe(40)
      expect(spacing.xl).toBe(64)
      expect(spacing.xxl).toBe(96)
    })
  })
})
