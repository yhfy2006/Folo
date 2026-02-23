import * as React from "react"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { colors } from "../styles/theme"

/**
 * Reusable animated background with slowly drifting glow circles.
 * Adds visual depth to any scene.
 */
export const BackgroundGlow: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const time = frame / fps

  // Three glow circles with different speeds and positions
  const glows = [
    {
      x: 30 + Math.sin(time * 0.15) * 15,
      y: 25 + Math.cos(time * 0.12) * 10,
      size: 500,
      color: colors.primary,
      opacity: 0.12,
    },
    {
      x: 70 + Math.sin(time * 0.1 + 2) * 12,
      y: 65 + Math.cos(time * 0.08 + 1) * 15,
      size: 450,
      color: colors.secondary,
      opacity: 0.08,
    },
    {
      x: 50 + Math.sin(time * 0.13 + 4) * 18,
      y: 45 + Math.cos(time * 0.11 + 3) * 12,
      size: 380,
      color: colors.primary,
      opacity: 0.06,
    },
  ]

  const fadeIn = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        opacity: fadeIn,
        pointerEvents: "none",
      }}
    >
      {glows.map((glow, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${glow.x}%`,
            top: `${glow.y}%`,
            width: glow.size,
            height: glow.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${glow.color}, transparent 70%)`,
            opacity: glow.opacity,
            transform: "translate(-50%, -50%)",
            filter: "blur(60px)",
          }}
        />
      ))}
    </div>
  )
}
