import * as React from "react"
import {
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { Subtitles } from "./components/Subtitles"
import { colors, fonts } from "./styles/theme"
import type { ShortsData, ShortsKeyPoint } from "./types"

/* ── Key Point Pill ── */
const KeyPoint: React.FC<{ point: ShortsKeyPoint; index: number }> = ({ point, index }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const showAtFrame = Math.round(point.showAt * fps)
  const localFrame = frame - showAtFrame

  if (localFrame < 0) return null

  const slideX = interpolate(localFrame, [0, 10], [60, 0], {
    extrapolateRight: "clamp",
  })

  const opacity = interpolate(localFrame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  })

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 16, stiffness: 140, mass: 0.5 },
  })

  const isLeft = index % 2 === 0

  return (
    <div
      style={{
        position: "absolute",
        top: 640 + index * 85,
        left: isLeft ? 48 : undefined,
        right: isLeft ? undefined : 48,
        opacity,
        transform: `translateX(${isLeft ? -slideX : slideX}px) scale(${scale})`,
        zIndex: 20,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.primary,
          borderRadius: 14,
          padding: "12px 22px",
          boxShadow: `0 4px 20px ${colors.primary}60, 0 0 8px ${colors.primary}40`,
        }}
      >
        {/* Numbered badge */}
        <span
          style={{
            fontSize: 24,
            fontFamily: fonts.body,
            fontWeight: 800,
            color: "rgba(255,255,255,0.6)",
            marginRight: 2,
          }}
        >
          {`${index + 1}`}
        </span>
        <span
          style={{
            fontSize: 36,
            fontFamily: fonts.body,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: 1,
          }}
        >
          {point.text}
        </span>
      </div>
    </div>
  )
}

/* ── Progress Bar ── */
const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const progress = (frame / durationInFrames) * 100

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.15)",
        zIndex: 200,
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
          boxShadow: `0 0 8px ${colors.primary}80`,
        }}
      />
    </div>
  )
}

/* ── Subscribe CTA ── */
const SubscribeCta: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // Show at 80% of video duration
  const showAtFrame = Math.floor(durationInFrames * 0.8)
  const localFrame = frame - showAtFrame

  if (localFrame < 0) return null

  const slideUp = interpolate(localFrame, [0, 10], [40, 0], {
    extrapolateRight: "clamp",
  })

  const opacity = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Subtle pulse
  const pulse = 1 + Math.sin((localFrame / fps) * 3) * 0.04

  return (
    <div
      style={{
        position: "absolute",
        bottom: 180,
        right: 48,
        opacity,
        transform: `translateY(${slideUp}px) scale(${pulse})`,
        zIndex: 150,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          backgroundColor: "#FF0000",
          borderRadius: 28,
          padding: "14px 28px",
          boxShadow: "0 4px 20px rgba(255, 0, 0, 0.4)",
        }}
      >
        {/* Play triangle icon */}
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "12px solid #fff",
            borderTop: "7px solid transparent",
            borderBottom: "7px solid transparent",
          }}
        />
        <span
          style={{
            fontSize: 28,
            fontFamily: fonts.body,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: 1,
          }}
        >
          关注
        </span>
      </div>
    </div>
  )
}

/* ── Main ShortsVideo Composition ── */
export const ShortsVideo: React.FC<ShortsData> = ({
  headline,
  ogImagePath,
  subtitles,
  keyPoints,
  bgmPath,
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const audioFile = staticFile("shorts.mp3")
  const time = frame / fps

  // --- Headline: instant visibility (no slow fade) ---
  const headlineScale = spring({
    frame: frame - 2,
    fps,
    config: { damping: 18, stiffness: 160, mass: 0.5 },
  })

  const headlineOpacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  })

  const headlineFloat = Math.sin(time * 0.6) * 2

  // --- Ken Burns on OG image ---
  const imgScale = interpolate(frame, [0, durationInFrames], [1, 1.15], {
    extrapolateRight: "clamp",
  })

  const imgTranslateY = interpolate(frame, [0, durationInFrames], [0, -30], {
    extrapolateRight: "clamp",
  })

  // --- Background glows ---
  const glow1X = 70 + Math.sin(time * 0.2) * 15
  const glow1Y = 20 + Math.cos(time * 0.15) * 10
  const glow2X = 30 + Math.sin(time * 0.12 + 2) * 12
  const glow2Y = 45 + Math.cos(time * 0.1 + 1) * 15

  // --- Accent underline ---
  const accentWidth = interpolate(frame, [8, 28], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const accentPulse = 1 + Math.sin(time * 2) * 0.15

  // --- Logo ---
  const logoOpacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  })

  // --- Background overlay shimmer ---
  const overlayOpacity = 0.7 + Math.sin(time * 0.5) * 0.1

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: colors.background,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Audio src={audioFile} />

      {/* Background music at low volume (~-12dB) with fade in/out */}
      {bgmPath && (
        <Audio
          src={staticFile(bgmPath)}
          volume={(f) => {
            const t = f / fps
            const dur = durationInFrames / fps
            // Fade in over 2s, fade out over 3s
            if (t < 2) return 0.15 * (t / 2)
            if (t > dur - 3) return 0.15 * ((dur - t) / 3)
            return 0.15
          }}
          loop
        />
      )}

      {/* Animated background glows */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${glow1X}%`,
            top: `${glow1Y}%`,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.primary}, transparent 70%)`,
            opacity: 0.12,
            transform: "translate(-50%, -50%)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${glow2X}%`,
            top: `${glow2Y}%`,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.secondary}, transparent 70%)`,
            opacity: 0.08,
            transform: "translate(-50%, -50%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* OG Image — top 55% with Ken Burns */}
      {ogImagePath && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "55%",
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile(ogImagePath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${imgScale}) translateY(${imgTranslateY}px)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to bottom, rgba(26,20,16,${0.2 + overlayOpacity * 0.1}) 0%, rgba(26,20,16,${overlayOpacity}) 100%)`,
            }}
          />
        </div>
      )}

      {/* YOMOO logo — top left */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 48,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: logoOpacity,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 2px 12px ${colors.primary}60`,
          }}
        >
          <span
            style={{
              fontSize: 26,
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
            fontSize: 22,
            fontFamily: fonts.body,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          YOMOO 每日AI快送
        </span>
      </div>

      {/* Bold headline — fast entrance, instant visibility */}
      <div
        style={{
          position: "absolute",
          top: "25%",
          left: 48,
          right: 48,
          zIndex: 10,
          opacity: headlineOpacity,
          transform: `scale(${headlineScale}) translateY(${headlineFloat}px)`,
        }}
      >
        <div
          style={{
            fontSize: headline.length > 10 ? 76 : headline.length > 6 ? 88 : 96,
            fontFamily: fonts.body,
            fontWeight: 900,
            color: colors.text,
            lineHeight: 1.3,
            letterSpacing: 3,
            textShadow: `0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6), 0 0 40px ${colors.primary}30`,
          }}
        >
          {headline}
        </div>
        {/* Accent underline — animated width + pulse */}
        <div
          style={{
            width: accentWidth * accentPulse,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
            marginTop: 20,
            boxShadow: `0 0 ${8 + Math.sin(time * 3) * 4}px ${colors.primary}80`,
          }}
        />
      </div>

      {/* Key points with numbered badges */}
      {keyPoints && keyPoints.map((point, i) => <KeyPoint key={i} point={point} index={i} />)}

      {/* Karaoke subtitles */}
      {subtitles && subtitles.length > 0 && <Subtitles lines={subtitles} />}

      {/* Subscribe CTA at 80% mark */}
      <SubscribeCta />

      {/* Progress bar at bottom */}
      <ProgressBar />
    </div>
  )
}
