import * as React from "react"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { colors, fonts, spacing } from "../styles/theme"
import type { SubtitleLine } from "../types"

interface SubtitlesProps {
  lines: SubtitleLine[]
}

/**
 * Displays pre-computed subtitle lines at the bottom of the video.
 * Lines are generated from the original script text (ground truth)
 * with timestamps derived from Deepgram word alignment.
 */
export const Subtitles: React.FC<SubtitlesProps> = ({ lines }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTime = frame / fps

  // Binary search for the current line (lines are sorted by start time)
  const currentLine = findCurrentLine(lines, currentTime)

  if (!currentLine) return null

  // Ensure monotonically increasing input range for interpolate
  const fadeIn = Math.min(currentLine.start + 0.1, (currentLine.start + currentLine.end) / 2)
  const fadeOut = Math.max(currentLine.end - 0.1, (currentLine.start + currentLine.end) / 2 + 0.01)

  const opacity = interpolate(
    currentTime,
    [currentLine.start, fadeIn, fadeOut, currentLine.end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )

  return (
    <div
      style={{
        position: "absolute",
        bottom: spacing.xl + spacing.md,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          borderRadius: 8,
          padding: `${spacing.xs}px ${spacing.md}px`,
          maxWidth: "85%",
          textAlign: "center",
          opacity,
        }}
      >
        <span
          style={{
            fontSize: 36,
            color: colors.text,
            fontFamily: fonts.body,
            fontWeight: 500,
            letterSpacing: 1,
            lineHeight: 1.5,
          }}
        >
          {currentLine.text}
        </span>
      </div>
    </div>
  )
}

function findCurrentLine(lines: SubtitleLine[], time: number): SubtitleLine | null {
  // Linear scan (lines are sorted, could be binary search but N is small)
  for (const line of lines) {
    if (time >= line.start - 0.05 && time <= line.end + 0.05) {
      return line
    }
    // Early exit since lines are sorted
    if (line.start > time + 0.1) break
  }
  return null
}
