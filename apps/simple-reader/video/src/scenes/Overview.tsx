import * as React from "react"
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"

import { AnimatedText } from "../components/AnimatedText"
import { BackgroundGlow } from "../components/BackgroundGlow"
import { colors, fonts, spacing } from "../styles/theme"
import type { OverviewScene } from "../types"

interface OverviewProps {
  scene: OverviewScene
}

export const Overview: React.FC<OverviewProps> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Left decorative accent bar
  const barHeight = interpolate(frame, [0, fps * 0.6], [0, 100], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      data-testid="overview"
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: `0 ${spacing.xxl}px`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <BackgroundGlow />

      {/* Left decorative gradient stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          background: `linear-gradient(180deg, ${colors.primary}, ${colors.secondary}, transparent)`,
          opacity: interpolate(frame, [0, fps * 0.5], [0, 0.6], {
            extrapolateRight: "clamp",
          }),
        }}
      />

      {/* Title with decorative vertical bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: spacing.md,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 5,
            height: barHeight,
            backgroundColor: colors.primary,
            borderRadius: 3,
            flexShrink: 0,
          }}
        />
        <AnimatedText
          text={`今天有 ${scene.headlines.length} 条重点新闻`}
          fontSize={44}
          color={colors.secondary}
          fontFamily={fonts.body}
          fontWeight={700}
          delay={0}
        />
      </div>

      {/* Headlines with numbered circles */}
      <div style={{ marginTop: spacing.lg, position: "relative", zIndex: 1 }}>
        {scene.headlines.map((headline, i) => {
          const circleDelay = Math.round(fps * 0.5 + i * fps * 0.4)
          const textDelay = circleDelay + Math.round(fps * 0.15)

          // Circle pop-in animation
          const circleScale = spring({
            frame: Math.max(0, frame - circleDelay),
            fps,
            config: { damping: 12, stiffness: 150, mass: 0.5 },
          })

          const circleOpacity = interpolate(Math.max(0, frame - circleDelay), [0, 8], [0, 1], {
            extrapolateRight: "clamp",
          })

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              {/* Numbered circle */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  backgroundColor: colors.primary,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 700,
                  color: colors.background,
                  fontFamily: fonts.body,
                  opacity: circleOpacity,
                  transform: `scale(${circleScale})`,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>

              {/* Headline text */}
              <AnimatedText
                text={headline}
                delay={textDelay}
                fontSize={30}
                color={colors.text}
                fontFamily={fonts.body}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
