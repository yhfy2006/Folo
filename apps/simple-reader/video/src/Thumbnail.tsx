import * as React from "react"

import { colors, fonts, spacing } from "./styles/theme"
import type { ScenesData } from "./types"

export const Thumbnail: React.FC<ScenesData> = ({ date, scenes, thumbnailTitle }) => {
  const newsCount = scenes.filter((s) => s.type === "news").length
  const headline = thumbnailTitle || "每日AI快送"

  return (
    <div
      data-testid="thumbnail"
      style={{
        width: 1280,
        height: 720,
        backgroundColor: colors.background,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow — top right */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.primary}40, transparent)`,
          top: -150,
          right: -150,
        }}
      />

      {/* Secondary glow — bottom left */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.secondary}25, transparent)`,
          bottom: -100,
          left: -100,
        }}
      />

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: `0 ${spacing.xl}px`,
          zIndex: 1,
        }}
      >
        {/* Top bar: logo + date */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 28,
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
              fontSize: 24,
              fontFamily: fonts.body,
              fontWeight: 600,
              color: colors.muted,
            }}
          >
            YOMOO 每日AI快送
          </span>
          <span
            style={{
              fontSize: 22,
              fontFamily: fonts.body,
              color: colors.muted,
              marginLeft: "auto",
            }}
          >
            {date}
          </span>
        </div>

        {/* Main headline — the eye-catching title */}
        <div
          style={{
            fontSize: headline.length > 12 ? 72 : 84,
            fontFamily: fonts.body,
            fontWeight: 900,
            color: colors.text,
            lineHeight: 1.2,
            letterSpacing: 2,
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>

        {/* Accent underline */}
        <div
          style={{
            width: 120,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
            marginTop: spacing.md,
          }}
        />

        {/* News count */}
        <div
          style={{
            marginTop: spacing.lg,
            display: "flex",
            gap: spacing.sm,
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontFamily: fonts.body,
              fontWeight: 600,
              color: colors.secondary,
            }}
          >
            {newsCount} 条重点新闻
          </span>
        </div>
      </div>
    </div>
  )
}
