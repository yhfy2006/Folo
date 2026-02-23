import * as React from "react"
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

import { colors, fonts } from "../styles/theme"

interface YomooLogoProps {
  size?: number
}

export const YomooLogo: React.FC<YomooLogoProps> = ({ size = 80 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const scale = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80, mass: 0.8 },
  })

  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      data-testid="yomoo-logo"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.2,
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontSize: size * 0.5,
            fontFamily: fonts.brand,
            fontWeight: 700,
            color: colors.text,
          }}
        >
          Y
        </span>
      </div>
      <span
        style={{
          fontSize: size * 0.5,
          fontFamily: fonts.brand,
          fontWeight: 700,
          color: colors.text,
          letterSpacing: 2,
        }}
      >
        YOMOO
      </span>
    </div>
  )
}
