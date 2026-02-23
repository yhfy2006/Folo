import * as React from "react"
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion"

import { AnimatedImage } from "../components/AnimatedImage"
import { AnimatedText } from "../components/AnimatedText"
import { BackgroundGlow } from "../components/BackgroundGlow"
import { ProgressBar } from "../components/ProgressBar"
import { colors, fonts, spacing } from "../styles/theme"
import type { NewsScene } from "../types"

interface NewsCardProps {
  scene: NewsScene
}

export const NewsCard: React.FC<NewsCardProps> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const sceneStartFrame = Math.round(scene.start * fps)
  const hasImage = !!scene.ogImage

  // Index number fade in
  const indexOpacity = interpolate(frame, [0, fps * 0.5], [0, 0.3], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      data-testid="news-card"
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

      {/* News index — large watermark */}
      <div
        style={{
          fontSize: 120,
          fontFamily: fonts.brand,
          fontWeight: 700,
          color: colors.primary,
          opacity: indexOpacity,
          position: "absolute",
          top: spacing.xl,
          right: spacing.xxl,
        }}
      >
        {String(scene.index).padStart(2, "0")}
      </div>

      {/* Main content area */}
      <div
        style={{
          display: "flex",
          flexDirection: hasImage ? "row" : "column",
          alignItems: hasImage ? "flex-start" : "stretch",
          gap: hasImage ? spacing.lg : 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* OG Image (left side when present) */}
        {hasImage && (
          <AnimatedImage
            src={scene.ogImage!}
            delay={Math.round(fps * 0.2)}
            width={520}
            height={320}
            kenBurns
          />
        )}

        {/* Text content */}
        <div style={{ flex: 1 }}>
          {/* Title */}
          <AnimatedText
            text={scene.title}
            fontSize={hasImage ? 42 : 48}
            color={colors.text}
            fontFamily={fonts.body}
            fontWeight={700}
            delay={0}
          />

          {/* Source */}
          <AnimatedText
            text={scene.source}
            fontSize={22}
            color={colors.muted}
            fontFamily={fonts.body}
            delay={Math.round(fps * 0.3)}
            style={{ marginTop: spacing.xs }}
          />
        </div>
      </div>

      {/* Points */}
      <div style={{ marginTop: spacing.lg, position: "relative", zIndex: 1 }}>
        {scene.points.map((point, i) => {
          const pointLocalFrame = Math.round(point.showAt * fps) - sceneStartFrame
          return (
            <AnimatedText
              key={i}
              text={`• ${point.text}`}
              delay={pointLocalFrame}
              fontSize={30}
              color={colors.text}
              fontFamily={fonts.body}
              style={{ marginTop: spacing.sm }}
            />
          )
        })}
      </div>

      {/* Progress bar */}
      <ProgressBar current={scene.index} total={scene.total} />
    </div>
  )
}
