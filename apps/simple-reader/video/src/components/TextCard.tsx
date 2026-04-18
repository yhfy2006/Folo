import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

interface TextCardProps {
  text: string
  startFrame: number
  durationFrames: number
}

export const TextCard: React.FC<TextCardProps> = ({ text, startFrame, durationFrames }) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  // Fade in over 20 frames (~0.67s), fade out over 15 frames (~0.5s)
  const fadeIn = interpolate(localFrame, [0, 20], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(localFrame, [durationFrames - 15, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = Math.min(fadeIn, fadeOut)

  // Gentle scale-up on entry
  const scale = interpolate(localFrame, [0, 25], [0.92, 1], { extrapolateRight: "clamp" })

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 80,
        opacity,
        zIndex: 100,
      }}
    >
      <div
        style={{
          fontSize: text.length > 40 ? 52 : 64,
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
          color: "#fff",
          textAlign: "center",
          lineHeight: 1.4,
          letterSpacing: 1.5,
          transform: `scale(${scale})`,
        }}
      >
        {text}
      </div>
    </div>
  )
}
