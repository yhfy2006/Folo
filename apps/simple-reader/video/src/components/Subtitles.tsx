import * as React from "react"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { colors, fonts, spacing } from "../styles/theme"
import type { SubtitleLine } from "../types"

interface SubtitlesProps {
  lines: SubtitleLine[]
}

/**
 * Karaoke-style subtitles: highlights the current phrase with accent color
 * while showing the full subtitle line. Creates a progressive reveal effect
 * that boosts viewer retention.
 */
export const Subtitles: React.FC<SubtitlesProps> = ({ lines }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTime = frame / fps

  const currentLine = findCurrentLine(lines, currentTime)

  if (!currentLine) return null

  // Fade in/out timing
  const fadeIn = Math.min(currentLine.start + 0.1, (currentLine.start + currentLine.end) / 2)
  const fadeOut = Math.max(currentLine.end - 0.1, (currentLine.start + currentLine.end) / 2 + 0.01)

  const opacity = interpolate(
    currentTime,
    [currentLine.start, fadeIn, fadeOut, currentLine.end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )

  // Calculate progress through current line (0 to 1)
  const lineDuration = currentLine.end - currentLine.start
  const lineProgress =
    lineDuration > 0
      ? Math.max(0, Math.min(1, (currentTime - currentLine.start) / lineDuration))
      : 1

  // Split text into characters for karaoke highlight
  const chars = [...currentLine.text]
  const highlightIndex = Math.floor(lineProgress * chars.length)

  // Slide-up entrance animation
  const slideUp = interpolate(currentTime, [currentLine.start, fadeIn], [12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        bottom: spacing.xl + spacing.lg,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 100,
        opacity,
        transform: `translateY(${slideUp}px)`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0,
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          borderRadius: 12,
          padding: `${spacing.xs + 4}px ${spacing.md}px`,
          maxWidth: "88%",
          textAlign: "center",
          borderLeft: `4px solid ${colors.primary}`,
          boxShadow: `0 4px 24px rgba(0, 0, 0, 0.5), 0 0 12px ${colors.primary}30`,
        }}
      >
        <span
          style={{
            fontSize: 42,
            fontFamily: fonts.body,
            fontWeight: 600,
            lineHeight: 1.5,
            letterSpacing: 1.5,
          }}
        >
          {chars.map((char, i) => (
            <span
              key={i}
              style={{
                color: i < highlightIndex ? colors.primary : colors.text,
                transition: "color 0.05s",
              }}
            >
              {char}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

function findCurrentLine(lines: SubtitleLine[], time: number): SubtitleLine | null {
  for (const line of lines) {
    if (time >= line.start - 0.05 && time <= line.end + 0.05) {
      return line
    }
    if (line.start > time + 0.1) break
  }
  return null
}
