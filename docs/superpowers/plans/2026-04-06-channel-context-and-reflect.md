# Channel Context System + Reflect Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-channel `context/` directory with audience, style, and guidelines files; enhance reflect to auto-update them; inject context into all content-generating stages.

**Architecture:** Channel directory gains a `context/` subdirectory (hardcoded path relative to channel root). `loadChannelContext()` reads all `.md` files and wraps them in XML tags. Reflect stage outputs JSON with 3 fields, writes to 3 files. Report/podcast/shorts stages prepend channel context to their prompts.

**Tech Stack:** Node.js, TypeScript, pathe, existing Channel/Pipeline infrastructure

---

### Task 1: Add `loadChannelContext()` to prompt-loader

**Files:**

- Modify: `apps/simple-reader/main/pipeline/prompt-loader.ts`

- [ ] **Step 1: Add the `loadChannelContext` function**

Add after the existing `writeSkill` function (line 103), before the `// ── Helpers` section:

```typescript
/**
 * Load all `.md` files from the channel's context/ directory.
 * Returns XML-tagged context blocks, or empty string if no context exists.
 */
export function loadChannelContext(channel: Channel): string {
  const contextDir = join(channel.promptDir, "..", "context")

  if (!existsSync(contextDir)) {
    return ""
  }

  const files = readdirSync(contextDir)
    .filter((f) => f.endsWith(".md"))
    .sort()

  if (files.length === 0) {
    return ""
  }

  return files
    .map((f) => {
      const name = f.replace(".md", "")
      const content = readFileSync(join(contextDir, f), "utf-8")
      return `<context name="${name}">\n${content}\n</context>`
    })
    .join("\n\n")
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to prompt-loader.ts

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/prompt-loader.ts
git commit -m "feat(pipeline): add loadChannelContext() to prompt-loader"
```

---

### Task 2: Add context templates to bundled channels

**Files:**

- Create: `apps/simple-reader/workspace/channels/zh-ai-daily/context/audience.md`
- Create: `apps/simple-reader/workspace/channels/zh-ai-daily/context/style.md`
- Create: `apps/simple-reader/workspace/channels/zh-ai-daily/context/guidelines.md`
- Create: `apps/simple-reader/workspace/channels/en-ai-daily/context/audience.md`
- Create: `apps/simple-reader/workspace/channels/en-ai-daily/context/style.md`
- Create: `apps/simple-reader/workspace/channels/en-ai-daily/context/guidelines.md`

- [ ] **Step 1: Create zh-ai-daily context files**

`context/audience.md`:

```markdown
# 受众画像

尚无数据，将在首次 reflect 运行后自动生成。
```

`context/style.md`:

```markdown
# 内容风格

尚无数据，将在首次 reflect 运行后自动生成。
```

`context/guidelines.md`:

```markdown
# 内容规范

## 禁忌

- 不做未经验证的预测或猜测
- 不使用过度营销语言

## 必须包含

- 每期必须包含具体的技术细节，不只是新闻标题
- 需要说明对开发者的实际影响

## 格式要求

- 中文为主，技术术语保留英文原文
- 口语化表达，避免书面语
```

- [ ] **Step 2: Create en-ai-daily context files**

`context/audience.md`:

```markdown
# Audience Profile

No data yet. Will be generated after first reflect run.
```

`context/style.md`:

```markdown
# Content Style

No data yet. Will be generated after first reflect run.
```

`context/guidelines.md`:

```markdown
# Content Guidelines

## Prohibited

- No unverified predictions or speculation
- No excessive marketing language

## Required Elements

- Each episode must include specific technical details, not just headlines
- Explain practical impact for developers

## Format Requirements

- Clear, conversational English
- Keep technical terms precise
```

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/workspace/channels/zh-ai-daily/context/ apps/simple-reader/workspace/channels/en-ai-daily/context/
git commit -m "feat(channel): add context template files for bundled channels"
```

---

### Task 3: Create context directory in `createChannel()`

**Files:**

- Modify: `apps/simple-reader/main/pipeline/channel-loader.ts`

- [ ] **Step 1: Add context directory creation in `createChannel()`**

In `createChannel()` (line 130), after `fs.mkdirSync(skillsDir, ...)` (line 141), add:

```typescript
const contextDir = path.join(channelDir, "context")
fs.mkdirSync(contextDir, { recursive: true })

// Write default context files
fs.writeFileSync(
  path.join(contextDir, "audience.md"),
  "# Audience Profile\n\nNo data yet. Will be generated after first reflect run.\n",
  "utf-8",
)
fs.writeFileSync(
  path.join(contextDir, "style.md"),
  "# Content Style\n\nNo data yet. Will be generated after first reflect run.\n",
  "utf-8",
)
fs.writeFileSync(
  path.join(contextDir, "guidelines.md"),
  "# Content Guidelines\n\n## Prohibited\n- (list content types or terms to avoid)\n\n## Required Elements\n- (list elements every episode must include)\n\n## Format Requirements\n- (list hard format constraints)\n",
  "utf-8",
)
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/channel-loader.ts
git commit -m "feat(channel): create context/ directory on new channel creation"
```

---

### Task 4: Inject channel context into report stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/report.ts`

- [ ] **Step 1: Import `loadChannelContext` and inject into prompt overrides**

Add import at top (after existing imports):

```typescript
import { loadChannelContext, loadPrompt } from "../prompt-loader"
```

(Replace the existing `import { loadPrompt } from "../prompt-loader"`)

Then modify the prompt override section (lines 14-24). Replace the full `if (ctx.channel)` block:

```typescript
let promptOverrides: { screeningPrompt?: string; reportPrompt?: string } | undefined
if (ctx.channel) {
  try {
    const channelContext = loadChannelContext(ctx.channel)
    const contextPrefix = channelContext ? `${channelContext}\n\n` : ""
    const screeningPrompt =
      contextPrefix + loadPrompt(ctx.channel, "screening.md", { date: ctx.date })
    const reportPrompt = contextPrefix + loadPrompt(ctx.channel, "report.md", { date: ctx.date })
    promptOverrides = { screeningPrompt, reportPrompt }
    console.info("[report] Using channel prompt overrides (with context)")
  } catch (err) {
    console.info("[report] Channel prompt not found, using defaults:", err)
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages/report.ts
git commit -m "feat(pipeline): inject channel context into report stage prompts"
```

---

### Task 5: Inject channel context into podcast stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/podcast.ts`

- [ ] **Step 1: Import `loadChannelContext` and inject into prompt override**

Add import at top (after existing imports):

```typescript
import { loadChannelContext, loadPrompt } from "../prompt-loader"
```

(Replace the existing `import { loadPrompt } from "../prompt-loader"`)

Replace the `if (ctx.channel)` block (lines 13-25):

```typescript
let promptOverride: string | undefined
if (ctx.channel) {
  try {
    const channelContext = loadChannelContext(ctx.channel)
    const contextPrefix = channelContext ? `${channelContext}\n\n` : ""
    promptOverride =
      contextPrefix +
      loadPrompt(ctx.channel, "podcast.md", {
        date: ctx.date,
        reportContent: ctx.reportContent!,
      })
    console.info("[podcast] Using channel prompt override (with context)")
  } catch (err) {
    console.info("[podcast] Channel prompt not found, using defaults:", err)
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages/podcast.ts
git commit -m "feat(pipeline): inject channel context into podcast stage prompt"
```

---

### Task 6: Inject channel context into shorts stage

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/shorts.ts`

- [ ] **Step 1: Find the shorts prompt construction**

In `shorts.ts`, find where the shorts prompt is built (the Claude call that generates shorts scripts). Look for where `loadPrompt(ctx.channel, "shorts.md", ...)` is called. Add context injection at that point, following the same pattern as Tasks 4 and 5:

```typescript
import { loadChannelContext, loadPrompt } from "../prompt-loader"
```

And prepend `loadChannelContext(ctx.channel)` to the shorts prompt wherever it's constructed.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages/shorts.ts
git commit -m "feat(pipeline): inject channel context into shorts stage prompt"
```

---

### Task 7: Enhance reflect to output audience and style files

**Files:**

- Modify: `apps/simple-reader/main/pipeline/stages/reflect.ts`

- [ ] **Step 1: Update the reflect prompt to request 3 outputs**

Replace `buildReflectPrompt` function (lines 82-118):

```typescript
function buildReflectPrompt(videoData: string, currentSkill: string): string {
  const today = new Date().toISOString().slice(0, 10)

  return `你是一个内容策略分析师。根据以下 YouTube 数据分析内容表现，生成三个输出。

${videoData}

## 当前策略 (${currentSkill ? "已有策略如下" : "无历史策略，首次生成"})

${currentSkill || "无"}

## 输出要求

输出一个 JSON 对象（不要 markdown 代码块包裹，不要其他文字），包含三个字段：

{
  "contentStrategy": "完整的策略文件内容（markdown格式，包含 YAML frontmatter）",
  "audienceInsights": "受众画像分析（markdown格式）",
  "styleInsights": "内容风格分析（markdown格式）"
}

### contentStrategy 必须包含:
YAML frontmatter:
\`\`\`
---
name: content-strategy
description: Auto-generated content strategy based on YouTube performance data
---
\`\`\`
正文: 选题偏好、Shorts 策略、播客风格建议、注意事项、更新日期(${today})

### audienceInsights 必须包含:
- 标题: # 受众画像
- 最近话题表现（受欢迎 vs 不受欢迎的话题，附数据）
- 观众互动高频主题（基于评论数和点赞数推断）
- 内容时长偏好（长视频 vs Shorts 的表现对比）
- 更新时间: ${today}

### styleInsights 必须包含:
- 标题: # 内容风格
- 表现最好的标题风格模式（附具体例子）
- 表现最好的内容结构（纯新闻 vs 深度分析 vs 教程）
- 语气建议（基于高互动视频的共性）
- 更新时间: ${today}

规则:
- 保留被数据验证的旧规则
- 修正被数据否定的旧规则
- 新增发现的模式
- 每条结论必须引用具体数据支撑
- 如果数据量太少（少于5条），注明"数据量不足，结论为初步观察"
- 只输出 JSON 对象，不要其他文字`
}
```

- [ ] **Step 2: Update the reflect stage run function to parse JSON and write 3 files**

Add `writeFileSync` import at top of file (already imported from "node:fs").

Add a `join` import from `pathe` (already imported).

Replace the section after `const updatedSkill = await runClaude(prompt)` (lines 174-188):

````typescript
callbacks.onStatus("Parsing reflect output...")

// Parse JSON output — expect { contentStrategy, audienceInsights, styleInsights }
let parsed: { contentStrategy: string; audienceInsights: string; styleInsights: string }
try {
  // Strip markdown code fencing if present
  const cleaned = updatedSkill
    .trim()
    .replace(/^```json?\n?/, "")
    .replace(/\n?```$/, "")
  parsed = JSON.parse(cleaned)
} catch {
  // Fallback: treat entire output as content strategy (backward compat with old prompt)
  console.warn("[reflect] Failed to parse JSON output, using as plain strategy")
  writeSkill(ctx.channel!, "content-strategy.md", `${updatedSkill.trim()}\n`)
  callbacks.onStatus("Content strategy updated (legacy format)")
  return ctx
}

// Write content strategy to channel skills dir
writeSkill(ctx.channel!, "content-strategy.md", `${parsed.contentStrategy.trim()}\n`)
console.info("[reflect] Content strategy updated in channel skillsDir")

// Write audience and style to channel context dir
const contextDir = path.join(ctx.channel!.promptDir, "..", "context")
fs.mkdirSync(contextDir, { recursive: true })

fs.writeFileSync(
  path.join(contextDir, "audience.md"),
  `${parsed.audienceInsights.trim()}\n`,
  "utf-8",
)
console.info("[reflect] Audience insights updated")

fs.writeFileSync(path.join(contextDir, "style.md"), `${parsed.styleInsights.trim()}\n`, "utf-8")
console.info("[reflect] Style insights updated")

callbacks.onStatus("Content strategy, audience & style updated")
````

Also remove the `else` branch that writes to workspace (the old no-channel fallback), since we require channel.

- [ ] **Step 3: Update `shouldRun` to require channel**

Replace line 124:

```typescript
  shouldRun: (ctx: PipelineContext) => ctx.prefs.youtubeEnabled && !!ctx.youtubeAccessToken && !!ctx.channel,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages/reflect.ts
git commit -m "feat(pipeline): enhance reflect to output audience and style context files"
```

---

### Task 8: Smoke test

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck 2>&1 | tail -20`
Expected: No errors in simple-reader files

- [ ] **Step 2: Run lint**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run lint:fix 2>&1 | tail -20`
Expected: No lint errors in modified files

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -u
git commit -m "fix: resolve typecheck/lint issues from channel context feature"
```
