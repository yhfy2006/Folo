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

const KeyPoint: React.FC<{ point: ShortsKeyPoint; index: number }> = ({ point, index }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const showAtFrame = Math.round(point.showAt * fps)
  const localFrame = frame - showAtFrame

  // Don't render before showAt
  if (localFrame < 0) return null

  // Slide in from right + fade in
  const slideX = interpolate(localFrame, [0, 12], [80, 0], {
    extrapolateRight: "clamp",
  })

  const opacity = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  })

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.6 },
  })

  // Alternate left/right alignment
  const isLeft = index % 2 === 0

  return (
    <div
      style={{
        position: "absolute",
        top: 620 + index * 80,
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
          backgroundColor: `${colors.primary}dd`,
          borderRadius: 12,
          padding: "10px 20px",
          boxShadow: `0 4px 20px ${colors.primary}60`,
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontFamily: fonts.body,
            fontWeight: 700,
            color: colors.text,
            letterSpacing: 1,
          }}
        >
          {point.text}
        </span>
      </div>
    </div>
  )
}

export const ShortsVideo: React.FC<ShortsData> = ({
  headline,
  ogImagePath,
  subtitles,
  keyPoints,
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const audioFile = staticFile("shorts.mp3")
  const time = frame / fps

  // --- Continuous animations ---

  // Ken Burns: slow zoom over entire video duration
  const imgScale = interpolate(frame, [0, durationInFrames], [1, 1.15], {
    extrapolateRight: "clamp",
  })

  // Slow pan on OG image
  const imgTranslateY = interpolate(frame, [0, durationInFrames], [0, -30], {
    extrapolateRight: "clamp",
  })

  // Background glow: drifting circles (continuous)
  const glow1X = 70 + Math.sin(time * 0.2) * 15
  const glow1Y = 20 + Math.cos(time * 0.15) * 10
  const glow2X = 30 + Math.sin(time * 0.12 + 2) * 12
  const glow2Y = 45 + Math.cos(time * 0.1 + 1) * 15
  const glow3X = 50 + Math.sin(time * 0.18 + 4) * 10
  const glow3Y = 70 + Math.cos(time * 0.14 + 3) * 8

  // Accent line: width animates in, then pulses gently
  const accentWidth = interpolate(frame, [15, 40], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const accentPulse = 1 + Math.sin(time * 2) * 0.15

  // Headline animation: scale up + fade in at start
  const headlineScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  })

  const headlineOpacity = interpolate(frame, [3, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Headline subtle float (continuous)
  const headlineFloat = Math.sin(time * 0.8) * 3

  // Logo fade in + subtle pulse
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  })
  const logoPulse = 1 + Math.sin(time * 1.5) * 0.03

  // Bottom gradient overlay: subtle shimmer
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
        <div
          style={{
            position: "absolute",
            left: `${glow3X}%`,
            top: `${glow3Y}%`,
            width: 350,
            height: 350,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.primary}, transparent 70%)`,
            opacity: 0.06,
            transform: "translate(-50%, -50%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* OG Image background — top 55% with Ken Burns + pan */}
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
          {/* Dark overlay with animated opacity */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to bottom, rgba(26,20,16,${0.2 + overlayOpacity * 0.1}) 0%, rgba(26,20,16,${overlayOpacity}) 100%)`,
            }}
          />
        </div>
      )}

      {/* YOMOO logo — top left with subtle pulse */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 48,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: logoOpacity,
          transform: `scale(${logoPulse})`,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 24,
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
            fontSize: 20,
            fontFamily: fonts.body,
            fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          YOMOO 每日AI快送
        </span>
      </div>

      {/* Bold headline — center with float animation */}
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
            fontSize: headline.length > 8 ? 80 : 96,
            fontFamily: fonts.body,
            fontWeight: 900,
            color: colors.text,
            lineHeight: 1.3,
            letterSpacing: 4,
            textShadow: "0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)",
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
            marginTop: 24,
            boxShadow: `0 0 ${8 + Math.sin(time * 3) * 4}px ${colors.primary}80`,
          }}
        />
      </div>

      {/* Key points — slide in at their matched timestamps */}
      {keyPoints && keyPoints.map((point, i) => <KeyPoint key={i} point={point} index={i} />)}

      {/* Subtitles */}
      {subtitles && subtitles.length > 0 && <Subtitles lines={subtitles} />}
    </div>
  )
}
