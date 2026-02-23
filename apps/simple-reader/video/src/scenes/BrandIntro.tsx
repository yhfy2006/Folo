import * as React from "react"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { AnimatedText } from "../components/AnimatedText"
import { YomooLogo } from "../components/YomooLogo"
import { colors, fonts, spacing } from "../styles/theme"
import type { IntroScene } from "../types"

interface BrandIntroProps {
  scene: IntroScene
  date: string
}

export const BrandIntro: React.FC<BrandIntroProps> = ({ scene: _scene, date }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const time = frame / fps

  const bgGlowOpacity = interpolate(frame, [0, fps * 2], [0, 0.6], {
    extrapolateRight: "clamp",
  })

  // Gradient line animation under the date
  const lineWidth = interpolate(frame, [fps * 1.8, fps * 3], [0, 200], {
    extrapolateRight: "clamp",
  })

  const lineOpacity = interpolate(frame, [fps * 1.8, fps * 2.2], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Floating glow circles for ambient effect
  const glowCircles = [
    {
      x: 25 + Math.sin(time * 0.2) * 10,
      y: 30 + Math.cos(time * 0.15) * 8,
      size: 200,
      color: colors.primary,
      opacity: 0.15,
    },
    {
      x: 75 + Math.sin(time * 0.18 + 2) * 12,
      y: 70 + Math.cos(time * 0.12 + 1) * 10,
      size: 180,
      color: colors.secondary,
      opacity: 0.1,
    },
    {
      x: 50 + Math.sin(time * 0.22 + 4) * 8,
      y: 20 + Math.cos(time * 0.16 + 3) * 6,
      size: 120,
      color: colors.secondary,
      opacity: 0.08,
    },
  ]

  return (
    <div
      data-testid="brand-intro"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Floating glow circles */}
      {glowCircles.map((glow, i) => (
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
            opacity: glow.opacity * bgGlowOpacity,
            transform: "translate(-50%, -50%)",
            filter: "blur(40px)",
          }}
        />
      ))}

      {/* Central amber gradient glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}40, transparent)`,
          opacity: bgGlowOpacity,
        }}
      />

      <YomooLogo size={100} />

      <AnimatedText
        text="每日AI快送"
        delay={Math.round(fps * 0.8)}
        fontSize={56}
        color={colors.text}
        fontFamily={fonts.body}
        fontWeight={700}
        style={{ marginTop: spacing.lg }}
      />

      <AnimatedText
        text={date}
        delay={Math.round(fps * 1.5)}
        fontSize={28}
        color={colors.muted}
        fontFamily={fonts.body}
        style={{ marginTop: spacing.sm }}
      />

      {/* Gradient line under date */}
      <div
        style={{
          width: lineWidth,
          height: 3,
          marginTop: spacing.sm,
          borderRadius: 2,
          background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
          opacity: lineOpacity,
        }}
      />
    </div>
  )
}
