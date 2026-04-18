import * as React from "react"
import { Audio, staticFile, useVideoConfig } from "remotion"

import { TextCard } from "./components/TextCard"
import { VideoClip } from "./components/VideoClip"
import type { SignalistShortsData } from "./types"

export const SignalistShorts: React.FC<SignalistShortsData> = ({ segments, bgmPath }) => {
  const { fps, durationInFrames } = useVideoConfig()

  // Calculate cumulative start frames for each segment
  let currentFrame = 0
  const segmentLayout = segments.map((seg) => {
    const start = currentFrame
    currentFrame += seg.durationFrames
    return { ...seg, startFrame: start }
  })

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: "#000",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {bgmPath && (
        <Audio
          src={staticFile(bgmPath)}
          volume={(f) => {
            const t = f / fps
            const dur = durationInFrames / fps
            const inClip = segmentLayout.some(
              (seg) =>
                seg.type === "clip" &&
                f >= seg.startFrame &&
                f < seg.startFrame + seg.durationFrames,
            )
            const baseVol = inClip ? 0.15 : 0.4
            if (t < 1) return baseVol * t
            if (t > dur - 2) return baseVol * ((dur - t) / 2)
            return baseVol
          }}
          loop
        />
      )}

      {segmentLayout.map((seg, i) => {
        if (seg.type === "text" && seg.text) {
          return (
            <TextCard
              key={i}
              text={seg.text}
              startFrame={seg.startFrame}
              durationFrames={seg.durationFrames}
            />
          )
        }
        if (seg.type === "clip" && seg.videoPath) {
          return (
            <VideoClip
              key={i}
              videoPath={seg.videoPath}
              subtitleText={seg.subtitleText}
              topText={seg.topText}
              bottomText={seg.bottomText}
              startFrame={seg.startFrame}
              durationFrames={seg.durationFrames}
              videoStartFrom={seg.videoStartFrom}
            />
          )
        }
        return null
      })}
    </div>
  )
}
