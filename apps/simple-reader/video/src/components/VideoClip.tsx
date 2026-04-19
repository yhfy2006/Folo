import * as React from "react"
import { interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion"

import { EDITORIAL_PALETTE, SANS, SERIF } from "../fonts"

interface VideoClipProps {
  videoPath: string
  subtitleText?: string
  topText?: string // kicker label above video
  bottomText?: string // pull-quote headline below video
  startFrame: number
  durationFrames: number
  videoStartFrom?: number // frame offset into the source video (default: 0)
}

/** Top kicker — small caps sans-serif label above video (editorial chapter-heading) */
const topKickerStyle: React.CSSProperties = {
  fontSize: 34,
  fontFamily: SANS,
  fontWeight: 700,
  color: EDITORIAL_PALETTE.goldWarm,
  textAlign: "center",
  lineHeight: 1.2,
  letterSpacing: 6,
  textTransform: "uppercase",
  textShadow: "0 2px 8px rgba(0,0,0,0.95)",
}

/** Bottom headline — heavy serif pull-quote below video */
const bottomHeadlineStyle: React.CSSProperties = {
  fontSize: 58,
  fontFamily: SERIF,
  fontWeight: 700,
  fontStyle: "italic",
  color: EDITORIAL_PALETTE.cream,
  textAlign: "center",
  lineHeight: 1.18,
  letterSpacing: 0.5,
  textShadow: "0 2px 12px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,1)",
}

export const VideoClip: React.FC<VideoClipProps> = ({
  videoPath,
  subtitleText,
  topText,
  bottomText,
  startFrame,
  durationFrames,
  videoStartFrom = 0,
}) => {
  const frame = useCurrentFrame()
  const localFrame = frame - startFrame

  if (localFrame < 0 || localFrame >= durationFrames) return null

  const fadeIn = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: "clamp" })
  const fadeOut = interpolate(localFrame, [durationFrames - 8, durationFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const opacity = Math.min(fadeIn, fadeOut)

  // 16:9 video centered in 9:16 frame → letterbox with cinematic gradient masks
  const videoWidth = 1080
  const videoHeight = Math.round(videoWidth * (9 / 16)) // 608px for 16:9
  const videoTop = Math.round((1920 - videoHeight) / 2) // centered vertically

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: EDITORIAL_PALETTE.bg,
        opacity,
        zIndex: 50,
      }}
    >
      {/* 16:9 video centered — Sequence resets timeline so video starts from videoStartFrom */}
      <div
        style={{
          position: "absolute",
          top: videoTop,
          left: 0,
          width: videoWidth,
          height: videoHeight,
          overflow: "hidden",
        }}
      >
        <Sequence from={startFrame} durationInFrames={durationFrames} layout="none">
          <OffthreadVideo
            src={staticFile(videoPath)}
            startFrom={videoStartFrom}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </Sequence>
      </div>

      {/* Top gradient mask — black to transparent */}
      <div
        style={{
          position: "absolute",
          top: videoTop - 40,
          left: 0,
          right: 0,
          height: 120,
          background: `linear-gradient(to bottom, ${EDITORIAL_PALETTE.bg} 0%, transparent 100%)`,
          zIndex: 55,
        }}
      />

      {/* Bottom gradient mask — transparent to black */}
      <div
        style={{
          position: "absolute",
          top: videoTop + videoHeight - 80,
          left: 0,
          right: 0,
          height: 120,
          background: `linear-gradient(to bottom, transparent 0%, ${EDITORIAL_PALETTE.bg} 100%)`,
          zIndex: 55,
        }}
      />

      {/* Top kicker — small caps sans-serif label above video */}
      {topText && (
        <div
          style={{
            position: "absolute",
            bottom: 1920 - videoTop + 30,
            left: 60,
            right: 60,
            zIndex: 60,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
          }}
        >
          <span style={topKickerStyle}>{topText}</span>
          <span
            style={{
              width: 40,
              height: 2,
              backgroundColor: EDITORIAL_PALETTE.goldWarm,
              opacity: 0.6,
            }}
          />
        </div>
      )}

      {/* Bottom headline — italic serif pull-quote below video */}
      {bottomText && (
        <div
          style={{
            position: "absolute",
            top: videoTop + videoHeight + 36,
            left: 60,
            right: 60,
            zIndex: 60,
            textAlign: "center",
          }}
        >
          <span style={bottomHeadlineStyle}>&ldquo;{bottomText}&rdquo;</span>
        </div>
      )}

      {/* Subtitle — smaller text below video (if no bottomText) */}
      {subtitleText && !bottomText && (
        <div
          style={{
            position: "absolute",
            top: videoTop + videoHeight + 40,
            left: 48,
            right: 48,
            zIndex: 60,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontFamily: SANS,
              fontWeight: 500,
              color: EDITORIAL_PALETTE.cream,
              lineHeight: 1.5,
            }}
          >
            {subtitleText}
          </span>
        </div>
      )}
    </div>
  )
}
