import * as React from "react"
import { interpolate, useCurrentFrame } from "remotion"

import { colors } from "../styles/theme"

interface ProgressBarProps {
  current: number
  total: number
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const frame = useCurrentFrame()
  const ratio = total > 0 ? current / total : 0

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 6,
        backgroundColor: `${colors.muted}33`,
        opacity,
      }}
    >
      <div
        data-testid="progress-fill"
        style={{
          width: `${ratio * 100}%`,
          height: "100%",
          backgroundColor: colors.primary,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  )
}
