import * as React from "react"
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion"

import { Subtitles } from "./components/Subtitles"
import { TransitionWipe } from "./components/TransitionWipe"
import { BrandIntro } from "./scenes/BrandIntro"
import { NewsCard } from "./scenes/NewsCard"
import { Outro } from "./scenes/Outro"
import { Overview } from "./scenes/Overview"
import type { Scene, ScenesData } from "./types"

interface DailyReportProps extends ScenesData {
  audioSrc?: string
}

export const DailyReport: React.FC<DailyReportProps> = (props) => {
  const { fps } = useVideoConfig()
  const { date, scenes, audioSrc, subtitles } = props

  const audioFile = audioSrc || staticFile("podcast.mp3")

  const renderScene = (scene: Scene, i: number) => {
    const from = Math.round(scene.start * fps)
    const durationInFrames = Math.round((scene.end - scene.start) * fps)

    let content: React.ReactNode

    switch (scene.type) {
      case "intro": {
        content = <BrandIntro scene={scene} date={date} />
        break
      }
      case "overview": {
        content = <Overview scene={scene} />
        break
      }
      case "news": {
        content = <NewsCard scene={scene} />
        break
      }
      case "outro": {
        content = <Outro scene={scene} />
        break
      }
    }

    return (
      <Sequence key={i} from={from} durationInFrames={durationInFrames}>
        {content}
        {/* Transition wipe at scene start (skip intro) */}
        {i > 0 && (
          <Sequence from={0} durationInFrames={15}>
            <TransitionWipe />
          </Sequence>
        )}
      </Sequence>
    )
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#1a1410",
        position: "relative",
      }}
    >
      <Audio src={audioFile} />
      {scenes.map(renderScene)}
      {/* Subtitles from original script text with Deepgram timing */}
      {subtitles && subtitles.length > 0 && <Subtitles lines={subtitles} />}
    </div>
  )
}
