import * as React from "react"
import { Composition } from "remotion"

import { DailyReport } from "./DailyReport"
import { ShortsVideo } from "./ShortsVideo"
import { SignalistShorts } from "./SignalistShorts"
import { shorts, thumbnail, video } from "./styles/theme"
import { Thumbnail } from "./Thumbnail"
import type { ScenesData, ShortsData, SignalistShortsData } from "./types"

const defaultSignalistProps: SignalistShortsData = {
  segments: [
    { type: "text", text: "The moment everything changed.", durationFrames: 90 },
    {
      type: "clip",
      videoPath: "signalist-clip.mp4",
      subtitleText: "This is incredible...",
      durationFrames: 300,
    },
    { type: "text", text: "Are we ready?", durationFrames: 90 },
  ],
  totalDurationSeconds: 16,
  fps: 30,
}

const defaultShortsProps: ShortsData = {
  headline: "AI接管电脑",
  audioDuration: 45,
  fps: 30,
  youtubeTitle: "AI接管你的电脑了！",
}

const defaultProps: ScenesData = {
  date: "2026-02-22",
  title: "YOMOO 每日AI快送",
  audioDuration: 600,
  fps: 30,
  scenes: [
    { type: "intro", start: 0, end: 5 },
    {
      type: "overview",
      start: 5,
      end: 15,
      headlines: ["OpenAI 发布 GPT-5", "Apple 推出 AI 芯片"],
    },
    {
      type: "news",
      start: 15,
      end: 85,
      index: 1,
      total: 2,
      title: "OpenAI 发布 GPT-5",
      source: "TechCrunch",
      points: [
        { text: "性能提升 5 倍", showAt: 25 },
        { text: "原生多模态支持", showAt: 40 },
        { text: "价格降低 50%", showAt: 55 },
      ],
    },
    { type: "outro", start: 570, end: 600 },
  ],
  thumbnailTitle: "AI一夜干掉程序员？",
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DailyReport"
        component={DailyReport}
        durationInFrames={defaultProps.audioDuration * defaultProps.fps}
        fps={video.fps}
        width={video.width}
        height={video.height}
        defaultProps={defaultProps}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        durationInFrames={1}
        fps={video.fps}
        width={thumbnail.width}
        height={thumbnail.height}
        defaultProps={defaultProps}
      />
      <Composition
        id="ShortsVideo"
        component={ShortsVideo}
        durationInFrames={defaultShortsProps.audioDuration * defaultShortsProps.fps}
        fps={shorts.fps}
        width={shorts.width}
        height={shorts.height}
        defaultProps={defaultShortsProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: Math.ceil(props.audioDuration * props.fps),
        })}
      />
      <Composition
        id="SignalistShorts"
        component={SignalistShorts}
        durationInFrames={defaultSignalistProps.totalDurationSeconds * defaultSignalistProps.fps}
        fps={shorts.fps}
        width={shorts.width}
        height={shorts.height}
        defaultProps={defaultSignalistProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: Math.ceil(props.totalDurationSeconds * props.fps),
        })}
      />
    </>
  )
}
