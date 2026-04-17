import * as React from "react"
import { interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion"

interface VideoClipProps {
  videoPath: string
  subtitleText?: string
  startFrame: number
  durationFrames: number
}

export const VideoClip: React.FC<VideoClipProps> = ({
  videoPath,
  subtitleText,
  startFrame,
  durationFrames,
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

  return (
    <div style={{ position: "absolute", inset: 0, opacity, zIndex: 50 }}>
      <div style={{ width: 1080, height: 1920, overflow: "hidden", position: "relative" }}>
        <OffthreadVideo
          src={staticFile(videoPath)}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            minWidth: "100%",
            minHeight: "100%",
            transform: "translate(-50%, -50%)",
            objectFit: "cover",
          }}
        />
      </div>

      {subtitleText && (
        <div style={{ position: "absolute", bottom: 180, left: 48, right: 48, zIndex: 60 }}>
          <div
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              borderRadius: 8,
              padding: "12px 20px",
              display: "inline-block",
            }}
          >
            <span
              style={{
                fontSize: 36,
                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                fontWeight: 600,
                color: "#fff",
                lineHeight: 1.4,
              }}
            >
              {subtitleText}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
