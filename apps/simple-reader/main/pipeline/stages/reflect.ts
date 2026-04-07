import fs from "node:fs"

import path from "pathe"

import { runClaude } from "../../ai-report"
import type { TopicEntry } from "../../database"
import { queryAll } from "../../database"
import type { ChannelVideo } from "../../youtube"
import { listChannelVideos, parseDuration } from "../../youtube"
import type { PipelineContext } from "../context"
import { readSkill, writeSkill } from "../prompt-loader"
import type { StageCallbacks, StageDefinition } from "../types"

interface ClassifiedVideo extends ChannelVideo {
  type: "video" | "shorts"
}

/**
 * Classify a video as 'video' or 'shorts' using DB records + duration fallback.
 */
function classifyVideos(
  videos: ChannelVideo[],
  dbRecords: Array<{ video_id: string; type: string }>,
): ClassifiedVideo[] {
  const dbMap = new Map(dbRecords.map((r) => [r.video_id, r.type]))

  return videos.map((v) => {
    const dbType = dbMap.get(v.videoId)
    if (dbType === "video" || dbType === "shorts") {
      return { ...v, type: dbType }
    }
    // Fallback: duration < 60s → shorts
    const seconds = parseDuration(v.duration)
    return { ...v, type: seconds > 0 && seconds < 60 ? "shorts" : "video" }
  })
}

/**
 * Format classified videos into a prompt section for Claude analysis.
 */
function formatVideoData(
  videos: ClassifiedVideo[],
  topics: Array<{ reportDate: string; topics: TopicEntry[] }>,
): string {
  const longVideos = videos
    .filter((v) => v.type === "video")
    .sort((a, b) => b.viewCount - a.viewCount)

  const shorts = videos.filter((v) => v.type === "shorts").sort((a, b) => b.viewCount - a.viewCount)

  // Build topic lookup by date
  const topicsByDate = new Map<string, string[]>()
  for (const report of topics) {
    topicsByDate.set(
      report.reportDate,
      report.topics.map((t) => t.name),
    )
  }

  const longLines = longVideos.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    const dateTopics = topicsByDate.get(date)
    const topicsStr = dateTopics ? ` | Topics: ${dateTopics.join(", ")}` : ""
    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount}${topicsStr}`
  })

  const shortsLines = shorts.map((v) => {
    const date = v.publishedAt.slice(0, 10)
    return `- ${date} | Views: ${v.viewCount} | Likes: ${v.likeCount} | Comments: ${v.commentCount} | Title: "${v.title}"`
  })

  return `## 长视频表现 (按播放量排序, ${longLines.length} 条)

${longLines.length > 0 ? longLines.join("\n") : "暂无数据"}

## Shorts 表现 (按播放量排序, ${shortsLines.length} 条)

${shortsLines.length > 0 ? shortsLines.join("\n") : "暂无数据"}`
}

interface ReflectOutput {
  contentStrategy: string
  audienceInsights: string
  styleInsights: string
}

function buildReflectPrompt(videoData: string, currentSkill: string): string {
  const today = new Date().toISOString().slice(0, 10)

  return `你是一个内容策略分析师。根据以下 YouTube 数据分析内容表现，输出三份分析文档。

${videoData}

## 当前策略 (${currentSkill ? "已有策略如下" : "无历史策略，首次生成"})

${currentSkill || "无"}

## 输出要求

输出一个 JSON 对象，包含三个字段，每个字段的值是 markdown 字符串：

{
  "contentStrategy": "完整的内容策略 markdown（含 YAML frontmatter）",
  "audienceInsights": "受众画像分析 markdown",
  "styleInsights": "内容风格分析 markdown"
}

### contentStrategy 字段

YAML frontmatter 必须为:
\`\`\`
---
name: content-strategy
description: Auto-generated content strategy based on YouTube performance data
---
\`\`\`

正文结构必须包含:
1. 选题偏好 — 哪些话题类型表现好/差，附具体数据
2. Shorts 策略 — hook 模式、标题风格、时长偏好的效果对比
3. 播客风格建议 — 基于长视频的节奏建议
4. 注意事项 — 应避免的模式
5. 更新日期: ${today}

### audienceInsights 字段

以 "# 受众画像" 开头，包含:
1. 最近话题表现 — 哪些话题最受欢迎，附播放数据
2. 观众互动模式 — 点赞/评论比率分析
3. 更新时间: ${today}

### styleInsights 字段

以 "# 内容风格" 开头，包含:
1. 标题风格 — 哪种标题模式效果好
2. 内容结构 — 视频节奏和结构偏好
3. 更新时间: ${today}

规则:
- 保留被数据验证的旧规则
- 修正被数据否定的旧规则
- 新增发现的模式
- 每条结论必须引用具体数据支撑
- 如果数据量太少（少于5条），注明"数据量不足，结论为初步观察"
- 只输出 JSON，不要其他文字`
}

/**
 * Parse Claude output as JSON with 3 fields.
 * Strips markdown code fencing if present.
 * Falls back to treating entire output as contentStrategy for backward compat.
 */
function parseReflectOutput(raw: string): ReflectOutput {
  let cleaned = raw.trim()

  // Strip markdown code fencing (```json ... ``` or ``` ... ```)
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n")
    const lastFence = cleaned.lastIndexOf("```")
    if (firstNewline !== -1 && lastFence > firstNewline) {
      cleaned = cleaned.slice(firstNewline + 1, lastFence).trim()
    }
  }

  try {
    const parsed = JSON.parse(cleaned) as ReflectOutput
    if (parsed.contentStrategy && parsed.audienceInsights && parsed.styleInsights) {
      return parsed
    }
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Backward compat: treat entire output as content-strategy only
  return {
    contentStrategy: raw,
    audienceInsights: "",
    styleInsights: "",
  }
}

export const reflectStage: StageDefinition = {
  name: "reflect",
  label: "Reflect on Content Performance",
  shouldRun: (ctx: PipelineContext) =>
    ctx.prefs.youtubeEnabled && !!ctx.youtubeAccessToken && !!ctx.channel,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Analyzing content performance...")

    // 1. Fetch videos with duration
    const videos = await listChannelVideos(ctx.youtubeAccessToken!, 50)

    // 2. Classify using DB + duration fallback
    const dbRecords = queryAll<{ video_id: string; type: string }>(
      "SELECT video_id, type FROM video_uploads",
    )
    const classified = classifyVideos(videos, dbRecords)

    const videoCount = classified.filter((v) => v.type === "video").length
    const shortsCount = classified.filter((v) => v.type === "shorts").length
    callbacks.onStatus(`Found ${videoCount} videos, ${shortsCount} Shorts`)

    // 3. Pull recent topics for correlation
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400
    const topicRows = queryAll<{ topics_json: string; created_at: number }>(
      "SELECT topics_json, created_at FROM report_topics WHERE created_at > ? ORDER BY created_at DESC",
      [cutoff],
    )
    const topics = topicRows.map((r) => ({
      reportDate: new Date(r.created_at * 1000).toLocaleDateString("en-CA"),
      topics: JSON.parse(r.topics_json) as TopicEntry[],
    }))

    // 4. Read existing skill from channel skillsDir
    const channel = ctx.channel!
    const currentSkill = readSkill(channel, "content-strategy.md")

    // 5. Build prompt and run Claude
    const videoData = formatVideoData(classified, topics)
    const prompt = buildReflectPrompt(videoData, currentSkill)

    callbacks.onStatus("Generating updated content strategy...")
    const rawOutput = await runClaude(prompt)
    const output = parseReflectOutput(rawOutput)

    // 6. Write content-strategy.md to channel skills dir
    writeSkill(channel, "content-strategy.md", `${output.contentStrategy.trim()}\n`)
    console.info("[reflect] Content strategy updated in channel skillsDir")

    // 7. Write audience.md and style.md to channel context dir
    const contextDir = path.join(channel.promptDir, "..", "context")
    fs.mkdirSync(contextDir, { recursive: true })

    if (output.audienceInsights) {
      fs.writeFileSync(
        path.join(contextDir, "audience.md"),
        `${output.audienceInsights.trim()}\n`,
        "utf-8",
      )
      console.info("[reflect] Audience insights written to context/audience.md")
    }

    if (output.styleInsights) {
      fs.writeFileSync(
        path.join(contextDir, "style.md"),
        `${output.styleInsights.trim()}\n`,
        "utf-8",
      )
      console.info("[reflect] Style insights written to context/style.md")
    }

    callbacks.onStatus("Content strategy updated")

    return ctx
  },
}
