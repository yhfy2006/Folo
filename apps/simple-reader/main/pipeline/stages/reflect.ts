import fs from "node:fs"

import path from "pathe"

import { runClaude } from "../../ai-report"
import type { TopicEntry } from "../../database"
import { queryAll } from "../../database"
import { getWorkspacePath } from "../../workspace"
import type { ChannelVideo } from "../../youtube"
import { listChannelVideos, parseDuration } from "../../youtube"
import type { PipelineContext } from "../context"
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

function buildReflectPrompt(videoData: string, currentSkill: string): string {
  const today = new Date().toISOString().slice(0, 10)

  return `你是一个内容策略分析师。根据以下 YouTube 数据分析内容表现，更新内容策略。

${videoData}

## 当前策略 (${currentSkill ? "已有策略如下" : "无历史策略，首次生成"})

${currentSkill || "无"}

## 输出要求

输出完整的更新后策略文件（markdown格式，包含 YAML frontmatter）。

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

规则:
- 保留被数据验证的旧规则
- 修正被数据否定的旧规则
- 新增发现的模式
- 每条结论必须引用具体数据支撑
- 如果数据量太少（少于5条），注明"数据量不足，结论为初步观察"
- 只输出 markdown 文件内容，不要其他文字`
}

export const reflectStage: StageDefinition = {
  name: "reflect",
  label: "Reflect on Content Performance",
  shouldRun: (ctx: PipelineContext) => ctx.prefs.youtubeEnabled && !!ctx.youtubeAccessToken,
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

    // 4. Read existing skill
    const workspacePath = getWorkspacePath()
    const skillPath = path.join(workspacePath, ".claude", "skills", "content-strategy.md")
    let currentSkill = ""
    try {
      if (fs.existsSync(skillPath)) {
        currentSkill = fs.readFileSync(skillPath, "utf-8")
      }
    } catch {
      // First run, no existing skill
    }

    // 5. Build prompt and run Claude
    const videoData = formatVideoData(classified, topics)
    const prompt = buildReflectPrompt(videoData, currentSkill)

    callbacks.onStatus("Generating updated content strategy...")
    const updatedSkill = await runClaude(prompt)

    // 6. Write updated skill
    const skillDir = path.join(workspacePath, ".claude", "skills")
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(skillPath, `${updatedSkill.trim()}\n`, "utf-8")

    console.info("[reflect] Content strategy updated:", skillPath)
    callbacks.onStatus("Content strategy updated")

    return ctx
  },
}
