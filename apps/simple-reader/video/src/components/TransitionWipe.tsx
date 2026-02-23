import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

import { colors } from "../styles/theme"

interface TransitionWipeProps {
  direction?: "left" | "right"
  durationInFrames?: number
}

export const TransitionWipe: React.FC<TransitionWipeProps> = ({
  direction = "right",
  durationInFrames = 15,
}) => {
  const frame = useCurrentFrame()

  const progress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  })

  const opacity = interpolate(frame, [0, durationInFrames * 0.5, durationInFrames], [0, 1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  })

  const translateX =
    direction === "right"
      ? interpolate(progress, [0, 100], [-100, 100])
      : interpolate(progress, [0, 100], [100, -100])

  return (
    <div
      data-testid="transition-wipe"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: colors.primary,
        opacity,
        transform: `translateX(${translateX}%)`,
        zIndex: 100,
        pointerEvents: "none",
      }}
    />
  )
}
