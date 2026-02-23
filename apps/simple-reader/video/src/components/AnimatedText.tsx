import * as React from "react"
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

interface AnimatedTextProps {
  text: string
  delay?: number
  fontSize?: number
  color?: string
  fontFamily?: string
  fontWeight?: number | string
  style?: React.CSSProperties
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  delay = 0,
  fontSize = 32,
  color = "#f5efe6",
  fontFamily,
  fontWeight,
  style,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const adjustedFrame = Math.max(0, frame - delay)

  const opacity = interpolate(adjustedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  const translateY = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 20, stiffness: 100, mass: 0.5 },
  })

  const y = interpolate(translateY, [0, 1], [20, 0])

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        fontSize,
        color,
        fontFamily,
        fontWeight,
        ...style,
      }}
    >
      {text}
    </div>
  )
}
