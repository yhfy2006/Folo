import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

import { EDITORIAL_PALETTE, SANS, SERIF } from "../fonts"

interface TextCardProps {
  text: string
  startFrame: number
  durationFrames: number
  fadeOutFrames?: number // default 15; pass ~60 for the final card to sync with BGM fade
}

export const TextCard: React.FC<TextCardProps> = ({
  text,
  startFrame,
  durationFrames,
  fadeOutFrames = 15,
}) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  const fadeIn = interpolate(localFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(
    localFrame,
    [durationFrames - fadeOutFrames, durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  )
  const opacity = Math.min(fadeIn, fadeOut)
  const scale = interpolate(localFrame, [0, 28], [0.96, 1], { extrapolateRight: "clamp" })

  const wordCount = text.trim().split(/\s+/).length
  const fontSize = wordCount > 16 ? 68 : wordCount > 10 ? 82 : 96

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: EDITORIAL_PALETTE.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "240px 100px",
        opacity,
        zIndex: 100,
      }}
    >
      {/* Tiny kicker mark — single red rule establishes editorial frame */}
      <div
        style={{
          width: 48,
          height: 3,
          backgroundColor: EDITORIAL_PALETTE.accent,
          marginBottom: 60,
          opacity: 0.85,
        }}
      />

      {/* Commentary — serif, cream, centered, magazine-weighted */}
      <div
        style={{
          fontSize,
          fontFamily: SERIF,
          fontWeight: 500,
          color: EDITORIAL_PALETTE.cream,
          textAlign: "center",
          lineHeight: 1.25,
          letterSpacing: 0.3,
          maxWidth: 880,
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </div>

      {/* Small brand watermark — unobtrusive, establishes publication */}
      <div
        style={{
          position: "absolute",
          bottom: 90,
          right: 100,
          fontFamily: SANS,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: 2,
          color: EDITORIAL_PALETTE.dim,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>signalist</span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 8,
            backgroundColor: EDITORIAL_PALETTE.accent,
            display: "inline-block",
          }}
        />
      </div>
    </div>
  )
}
