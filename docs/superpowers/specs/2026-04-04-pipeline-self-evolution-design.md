# Pipeline Self-Evolution: Reflect Stage Design

**Date**: 2026-04-04
**Status**: Draft
**Scope**: `apps/simple-reader`

## Problem

The content pipeline (report, podcast, video, shorts) generates daily output but has no feedback loop. Content quality decisions (topic selection, script style, Shorts hook patterns) are static — they don't improve based on actual YouTube performance data.

## Solution

Add a `reflect` stage to the pipeline that:

1. Pulls YouTube performance data (views, likes, comments) for both long-form videos and Shorts
2. Correlates performance with topic/content choices via `report_topics` history
3. Uses Claude to analyze what worked and what didn't
4. Writes an updated `content-strategy.md` skill file
5. The skill is automatically loaded by all downstream content generation stages via the existing `loadAllSkills()` mechanism

## Architecture

### Pipeline Order (after change)

```
verify → reflect → report → podcast → audio → upload → publish → video → youtube → shorts
```

### Data Flow

```
┌─────────────────────────────────────────────────┐
│ reflect stage                                   │
│                                                 │
│  1. listChannelVideos(accessToken)              │
│     + contentDetails for duration               │
│  2. video_uploads table (DB record of type)     │
│     + duration < 60s fallback for history       │
│  3. report_topics (last 30 days)                │
│  4. Read current content-strategy.md (if any)   │
│  5. Claude analyzes → outputs updated skill     │
│  6. Write content-strategy.md to workspace      │
│                                                 │
└──────────────────┬──────────────────────────────┘
                   │ skill file on disk
                   ▼
┌─────────────────────────────────────────────────┐
│ loadAllSkills() → formatSkillsPrompt()          │
│                                                 │
│ Injected into:                                  │
│  - buildScreeningPrompt()     → topic selection │
│  - buildReportPrompt()        → report writing  │
│  - generatePodcastScript()    → podcast style   │
│  - generateShortsScript()     → shorts strategy │
│    (NEW: add loadAllSkills() call)              │
└─────────────────────────────────────────────────┘
```

## Detailed Design

### 1. New DB Table: `video_uploads`

```sql
CREATE TABLE IF NOT EXISTS video_uploads (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'video' | 'shorts'
  title TEXT,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  group_id TEXT,
  created_at INTEGER NOT NULL
);
```

- Written by `youtube` stage and `shorts` stage after successful upload
- Only recorded when actually uploaded (`skipUpload = true` → no record)
- Used by `reflect` stage to distinguish Shorts from long-form videos

### 2. YouTube Data Enhancement: `listChannelVideos`

Add `contentDetails` to the `part` parameter in the videos API call. Return a new `duration` field (ISO 8601 string, e.g. `PT5M30S`) on `ChannelVideo`.

Shorts identification logic:

1. Look up `video_uploads` table by videoId → use DB `type` if found
2. Fallback: parse `duration`, if total seconds < 60 → classify as Shorts

### 3. New Stage: `pipeline/stages/reflect.ts`

```typescript
export const reflectStage: StageDefinition = {
  name: "reflect",
  label: "Reflect on Content Performance",
  shouldRun: (ctx) => ctx.prefs.youtubeEnabled && !!ctx.youtubeInsights,
  run: async (ctx, callbacks) => {
    // 1. Fetch video list with duration info
    // 2. Classify each video as 'video' or 'shorts'
    // 3. Pull report_topics for correlation
    // 4. Read existing content-strategy.md skill
    // 5. Build analysis prompt with all data
    // 6. Run Claude to generate updated skill
    // 7. Write updated skill to workspace
    return ctx // reflect does not mutate pipeline context
  },
}
```

**shouldRun condition**: YouTube is enabled AND `youtubeAccessToken` is available on context.

Note: the verify stage currently sets `youtubeInsights` (formatted string) but does NOT persist the accessToken on context. We need to either:

- Save `youtubeAccessToken` on context during verify (preferred — avoids a redundant token refresh), or
- Have reflect refresh its own token.

**Decision**: Save `youtubeAccessToken` on context during verify. This also benefits the youtube/shorts stages which currently refresh separately.

**Prompt structure for Claude**:

```
你是一个内容策略分析师。根据以下 YouTube 数据分析内容表现，更新内容策略。

## 长视频表现 (按播放量排序)
- 2026-04-01 | Views: 1200 | Likes: 45 | Comments: 8 | Topics: OpenAI, GPT-5
- 2026-03-31 | Views: 300  | Likes: 10 | Comments: 2 | Topics: 学术论文, RAG
...

## Shorts 表现 (按播放量排序)
- 2026-04-01 | Views: 5000 | Likes: 200 | Title: "3个你必须知道的AI更新"
- 2026-03-30 | Views: 800  | Likes: 30  | Title: "AI刚刚学会了最可怕的技能"
...

## 当前策略 (上次更新: YYYY-MM-DD)
[current content-strategy.md content, or "无历史策略，首次生成"]

## 输出要求
输出完整的更新后策略文件（markdown格式，包含 YAML frontmatter）。
结构必须包含:
1. 选题偏好 — 哪些话题类型表现好/差，附具体数据
2. Shorts 策略 — hook 模式、标题风格、时长偏好的效果对比
3. 播客风格建议 — 基于长视频留存的节奏建议
4. 注意事项 — 应避免的模式
5. 更新日期

规则:
- 保留被数据验证的旧规则
- 修正被数据否定的旧规则
- 新增发现的模式
- 每条结论必须引用具体数据支撑
```

**Skill file output location**: `{getWorkspacePath()}/.claude/skills/content-strategy.md`

This is a workspace-level skill, so it takes precedence over builtin skills in `loadAllSkills()`.

### 4. Record Uploads: `youtube.ts` and `shorts.ts` Stage Changes

**`stages/youtube.ts`** — after successful upload (before return):

```typescript
execute(
  "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  [
    generateId(),
    videoId,
    "video",
    scenes.youtubeTitle || title,
    ctx.date,
    ctx.groupId || null,
    now,
  ],
)
```

**`stages/shorts.ts`** — inside `generateOneShorts`, after successful upload (not when `skipUpload`):

```typescript
execute(
  "INSERT INTO video_uploads (id, video_id, type, title, date, group_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  [generateId(), videoId, "shorts", shortsScript.title, ctx.date, ctx.groupId || null, now],
)
```

### 5. Fix Gap: `generateShortsScript` Skills Injection

In `ai-report.ts`, add `formatSkillsPrompt(loadAllSkills())` to the `generateShortsScript` prompt, same pattern as `buildScreeningPrompt` and `buildReportPrompt`.

### 6. Orchestrator Change

In `pipeline/orchestrator.ts`:

- Import `reflectStage`
- Add to `ALL_STAGES` array after `verifyStage`, before `reportStage`

In `pipeline/types.ts`:

- Add `"reflect"` to `StageName` union

## Files Changed

| File                              | Change                                                         |
| --------------------------------- | -------------------------------------------------------------- |
| `main/pipeline/stages/verify.ts`  | Save `youtubeAccessToken` on context                           |
| `main/database.ts`                | Add `video_uploads` table to schema init                       |
| `main/youtube.ts`                 | Add `contentDetails` part, return `duration` on `ChannelVideo` |
| `main/pipeline/types.ts`          | Add `"reflect"` to `StageName`                                 |
| `main/pipeline/stages/reflect.ts` | **New file** — core reflect logic                              |
| `main/pipeline/stages/youtube.ts` | INSERT into `video_uploads` after upload                       |
| `main/pipeline/stages/shorts.ts`  | INSERT into `video_uploads` after upload                       |
| `main/pipeline/orchestrator.ts`   | Add `reflectStage` to `ALL_STAGES`                             |
| `main/ai-report.ts`               | Add `loadAllSkills()` to `generateShortsScript`                |

## Files NOT Changed

- `skills.ts` — no changes needed, auto-discovers new skill files
- `workspace.ts` — no changes needed, skill written dynamically
- `preferences.ts` — no new preferences
- `pipeline-scheduler.ts` — no changes
- All other stages — unchanged

## Error Handling

- `reflect` stage failure is **non-fatal**: if Claude analysis fails or skill write fails, log and continue. The pipeline should never break because of a failed reflection.
- Add `"reflect"` to the `nonFatal` list in `executePipeline`.

## Testing

- Unit test: `video_uploads` INSERT/query
- Unit test: Shorts vs video classification (DB lookup + duration fallback)
- Unit test: reflect stage with mock YouTube data → verify skill file written
- Integration: run pipeline, verify `content-strategy.md` exists and is loaded by subsequent stages
