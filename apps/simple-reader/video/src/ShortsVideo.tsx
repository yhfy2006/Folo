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
import type { ShortsData } from "./types"

export const ShortsVideo: React.FC<ShortsData> = ({ headline, ogImagePath, subtitles }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const audioFile = staticFile("shorts.mp3")

  // Ken Burns: slow zoom on OG image
  const imgScale = interpolate(frame, [0, fps * 30], [1, 1.1], {
    extrapolateRight: "clamp",
  })

  // Headline animation: scale up + fade in
  const headlineScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  })

  const headlineOpacity = interpolate(frame, [3, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Logo fade in
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  })

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

      {/* OG Image background — top 55% */}
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
              transform: `scale(${imgScale})`,
            }}
          />
          {/* Dark overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(26,20,16,0.3) 0%, rgba(26,20,16,0.8) 100%)",
            }}
          />
        </div>
      )}

      {/* Background glow when no image */}
      {!ogImagePath && (
        <>
          <div
            style={{
              position: "absolute",
              width: 600,
              height: 600,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colors.primary}40, transparent)`,
              top: "10%",
              right: "-10%",
              filter: "blur(60px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 400,
              height: 400,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colors.secondary}25, transparent)`,
              top: "30%",
              left: "-5%",
              filter: "blur(60px)",
            }}
          />
        </>
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

      {/* Bold headline — center */}
      <div
        style={{
          position: "absolute",
          top: "38%",
          left: 48,
          right: 48,
          zIndex: 10,
          opacity: headlineOpacity,
          transform: `scale(${headlineScale})`,
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
        {/* Accent underline */}
        <div
          style={{
            width: 100,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
            marginTop: 24,
          }}
        />
      </div>

      {/* Subtitles */}
      {subtitles && subtitles.length > 0 && <Subtitles lines={subtitles} />}
    </div>
  )
}
