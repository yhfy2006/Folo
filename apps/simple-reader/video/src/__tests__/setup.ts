import * as React from "react"
import { vi } from "vitest"

// Mock remotion module - this runs before test files import their modules
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 30),
  useVideoConfig: vi.fn(() => ({
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 18000,
  })),
  interpolate: vi.fn(
    (
      input: number,
      inputRange: number[],
      outputRange: number[],
      options?: { extrapolateRight?: string; extrapolateLeft?: string },
    ) => {
      const [inMin, inMax] = inputRange
      const [outMin, outMax] = outputRange
      let t = (input - inMin) / (inMax - inMin)
      if (options?.extrapolateRight === "clamp") t = Math.min(t, 1)
      if (options?.extrapolateLeft === "clamp") t = Math.max(t, 0)
      return outMin + t * (outMax - outMin)
    },
  ),
  spring: vi.fn(() => 1),
  Sequence: vi.fn(
    ({ children }: { children: React.ReactNode; from?: number; durationInFrames?: number }) =>
      React.createElement("div", { "data-testid": "sequence" }, children),
  ),
  Audio: vi.fn(() => null),
  Composition: vi.fn(() => null),
  staticFile: vi.fn((path: string) => path),
  registerRoot: vi.fn(),
}))
