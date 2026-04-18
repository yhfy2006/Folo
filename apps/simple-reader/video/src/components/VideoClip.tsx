import * as React from "react"
import { interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion"

interface VideoClipProps {
  videoPath: string
  subtitleText?: string
  topText?: string // bold headline above video
  bottomText?: string // bold headline below video
  startFrame: number
  durationFrames: number
  videoStartFrom?: number // frame offset into the source video (default: 0)
}

/** Bold outlined text style for top/bottom headlines */
const headlineStyle: React.CSSProperties = {
  fontSize: 64,
  fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
  fontWeight: 900,
  color: "#FFD700",
  textAlign: "center",
  lineHeight: 1.2,
  letterSpacing: 2,
  WebkitTextStroke: "3px #000",
  paintOrder: "stroke fill",
  textShadow: "0 4px 12px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)",
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
    <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", opacity, zIndex: 50 }}>
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
          background: "linear-gradient(to bottom, #000 0%, transparent 100%)",
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
          background: "linear-gradient(to bottom, transparent 0%, #000 100%)",
          zIndex: 55,
        }}
      />

      {/* Top headline — bold outlined text just above video */}
      {topText && (
        <div
          style={{
            position: "absolute",
            bottom: 1920 - videoTop + 20,
            left: 40,
            right: 40,
            zIndex: 60,
            textAlign: "center",
          }}
        >
          <span style={headlineStyle}>{topText}</span>
        </div>
      )}

      {/* Bottom headline — bold outlined text just below video */}
      {bottomText && (
        <div
          style={{
            position: "absolute",
            top: videoTop + videoHeight + 20,
            left: 40,
            right: 40,
            zIndex: 60,
            textAlign: "center",
          }}
        >
          <span style={headlineStyle}>{bottomText}</span>
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
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 600,
              color: "rgba(255, 255, 255, 0.9)",
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
