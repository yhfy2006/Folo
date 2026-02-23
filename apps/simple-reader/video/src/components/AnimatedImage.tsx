import * as React from "react"
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion"

import { colors } from "../styles/theme"

interface AnimatedImageProps {
  src: string
  delay?: number
  width?: number
  height?: number
  kenBurns?: boolean
}

/**
 * Animated image component with fade-in and optional Ken Burns effect.
 * Uses Remotion's staticFile() for local images.
 */
export const AnimatedImage: React.FC<AnimatedImageProps> = ({
  src,
  delay = 0,
  width = 520,
  height = 320,
  kenBurns = true,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const adjustedFrame = Math.max(0, frame - delay)

  // Fade in over 15 frames
  const opacity = interpolate(adjustedFrame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Ken Burns: slow zoom from 1.0 to 1.08 over ~20 seconds
  const scale = kenBurns
    ? interpolate(adjustedFrame, [0, fps * 20], [1, 1.08], {
        extrapolateRight: "clamp",
      })
    : 1

  // Subtle pan: shift slightly right and up
  const translateX = kenBurns
    ? interpolate(adjustedFrame, [0, fps * 20], [0, 8], {
        extrapolateRight: "clamp",
      })
    : 0

  const translateY = kenBurns
    ? interpolate(adjustedFrame, [0, fps * 20], [0, -4], {
        extrapolateRight: "clamp",
      })
    : 0

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 12,
        overflow: "hidden",
        opacity,
        position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
      {/* Bottom gradient overlay for readability */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          background: `linear-gradient(transparent, ${colors.background}cc)`,
        }}
      />
    </div>
  )
}
