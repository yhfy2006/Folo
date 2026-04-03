# YouTube Shorts Auto-Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically generate a 30-60 second vertical YouTube Shorts video from the daily report's most impactful news item, as part of the existing YOMOO pipeline.

**Architecture:** Add a Shorts generation stage (Stage 9) after the long video YouTube upload. AI selects the top news item and generates a punchy script, MiniMax TTS produces audio, a new Remotion vertical composition renders 1080x1920 video, and the result is uploaded to YouTube with #Shorts tag. The entire stage is non-fatal.

**Tech Stack:** Remotion (React video), MiniMax TTS API, YouTube Data API v3, Claude CLI, Vitest

---

### Task 1: Add `youtubeShortsEnabled` preference

**Files:**

- Modify: `apps/simple-reader/main/preferences.ts`

- [ ] **Step 1: Add the field to UserPreferences interface and defaults**

In `apps/simple-reader/main/preferences.ts`, add `youtubeShortsEnabled` to the interface:

```typescript
// Add after youtubeEnabled: boolean
youtubeShortsEnabled: boolean
```

And to `DEFAULT_PREFERENCES`:

```typescript
// Add after youtubeEnabled: false
youtubeShortsEnabled: true,
```

- [ ] **Step 2: Run existing tests to verify nothing broke**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/preferences.ts
git commit -m "feat(simple-reader): add youtubeShortsEnabled preference (default true)"
```

---

### Task 2: `generateShortsScript` — AI selects top news and writes Shorts script

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts`
- Create: `apps/simple-reader/main/__tests__/shorts-script.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/simple-reader/main/__tests__/shorts-script.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest"

import { parseShortsScriptResult } from "../ai-report"

// Mock database module
vi.mock("../database", () => ({
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(),
  execute: vi.fn(),
  saveDatabase: vi.fn(),
}))

// Mock skills module
vi.mock("../skills", () => ({
  loadAllSkills: vi.fn(() => []),
  formatSkillsPrompt: vi.fn(() => ""),
}))

// Mock workspace module
vi.mock("../workspace", () => ({
  getWorkspacePath: vi.fn(() => "/tmp"),
}))

describe("parseShortsScriptResult", () => {
  it("should parse valid JSON result from Claude", () => {
    const result = JSON.stringify({
      title: "AI接管你的电脑了！Claude直接操控Mac",
      headline: "AI接管电脑",
      script:
        "你知道吗，Claude现在可以直接操控你的Mac电脑了。不是开玩笑，它可以打开应用、写代码、甚至帮你发邮件。关注看更多每日AI快送。",
      newsUrl: "https://example.com/article",
      ogImageUrl: "https://example.com/og.jpg",
    })

    const parsed = parseShortsScriptResult(result)

    expect(parsed).toEqual({
      title: "AI接管你的电脑了！Claude直接操控Mac",
      headline: "AI接管电脑",
      script: expect.stringContaining("Claude"),
      newsUrl: "https://example.com/article",
      ogImageUrl: "https://example.com/og.jpg",
    })
  })

  it("should handle result with extra text around JSON", () => {
    const result = `Here is the result:
{
  "title": "Test Title",
  "headline": "测试标题",
  "script": "Test script content.",
  "newsUrl": "https://example.com"
}
Some trailing text.`

    const parsed = parseShortsScriptResult(result)
    expect(parsed.title).toBe("Test Title")
    expect(parsed.headline).toBe("测试标题")
    expect(parsed.script).toBe("Test script content.")
    expect(parsed.ogImageUrl).toBeUndefined()
  })

  it("should throw on invalid result", () => {
    expect(() => parseShortsScriptResult("not json at all")).toThrow()
  })

  it("should throw if required fields are missing", () => {
    const result = JSON.stringify({ title: "Only title" })
    expect(() => parseShortsScriptResult(result)).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/shorts-script.test.ts`
Expected: FAIL — `parseShortsScriptResult` is not exported

- [ ] **Step 3: Implement `parseShortsScriptResult` and `generateShortsScript`**

Add to `apps/simple-reader/main/ai-report.ts`:

```typescript
export interface ShortsScript {
  title: string
  headline: string
  script: string
  newsUrl: string
  ogImageUrl?: string
}

export function parseShortsScriptResult(result: string): ShortsScript {
  const jsonMatch = result.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error("No JSON found in Shorts script result")
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  if (!parsed.title || !parsed.headline || !parsed.script || !parsed.newsUrl) {
    throw new Error("Shorts script missing required fields (title, headline, script, newsUrl)")
  }

  return {
    title: parsed.title as string,
    headline: parsed.headline as string,
    script: parsed.script as string,
    newsUrl: parsed.newsUrl as string,
    ogImageUrl: (parsed.ogImageUrl as string) || undefined,
  }
}

export async function generateShortsScript(
  reportContent: string,
  onStatus: (status: string) => void,
): Promise<ShortsScript> {
  onStatus("Generating Shorts script...")

  const prompt = `You are a viral short-video scriptwriter for "YOMOO 每日AI快送", a Chinese AI news channel.

From the following daily report, select the ONE news item that is most personally relevant to average people (not niche/specialist topics). News about AI directly affecting daily life gets the most views.

Write a 30-60 second spoken script in Chinese that:
- Starts with the most shocking or surprising fact (hook in 1 second, NO greeting, NO "大家好")
- Is punchy, direct, and conversational
- Ends with: "关注看更多每日AI快送"

Output strict JSON only, no markdown fencing:
{
  "title": "YouTube title, max 60 chars, provocative (e.g. 'AI接管你的电脑了！')",
  "headline": "Bold on-screen headline, max 15 Chinese chars (e.g. 'AI接管电脑')",
  "script": "The spoken script text, 30-60 seconds when read aloud",
  "newsUrl": "URL of the source article from the report",
  "ogImageUrl": "OG image URL if mentioned in the report, or null"
}

Daily report:
${reportContent.slice(0, 5000)}`

  const result = await runClaude(prompt)
  return parseShortsScriptResult(result)
}
```

Note: `runClaude` is already defined in `ai-report.ts` as a non-exported function. To use it from `generateShortsScript`, it's already accessible since both are in the same file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/simple-reader && npx vitest run main/__tests__/shorts-script.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts apps/simple-reader/main/__tests__/shorts-script.test.ts
git commit -m "feat(simple-reader): add Shorts script generation from daily report"
```

---

### Task 3: Add `shorts` dimension to theme and Shorts types

**Files:**

- Modify: `apps/simple-reader/video/src/styles/theme.ts`
- Modify: `apps/simple-reader/video/src/types.ts`

- [ ] **Step 1: Add shorts dimensions to theme**

In `apps/simple-reader/video/src/styles/theme.ts`, add after the `thumbnail` export:

```typescript
export const shorts = {
  width: 1080,
  height: 1920,
  fps: 30,
} as const
```

- [ ] **Step 2: Add ShortsData type**

In `apps/simple-reader/video/src/types.ts`, add at the end:

```typescript
export interface ShortsData {
  headline: string
  ogImagePath?: string
  audioDuration: number
  fps: number
  subtitles?: SubtitleLine[]
  youtubeTitle: string
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/video/src/styles/theme.ts apps/simple-reader/video/src/types.ts
git commit -m "feat(simple-reader): add Shorts types and theme dimensions"
```

---

### Task 4: Shorts Remotion composition and components

**Files:**

- Create: `apps/simple-reader/video/src/ShortsVideo.tsx`
- Modify: `apps/simple-reader/video/src/Root.tsx`

- [ ] **Step 1: Create `ShortsVideo.tsx`**

Create `apps/simple-reader/video/src/ShortsVideo.tsx`:

```tsx
import * as React from "react"
import {
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { Subtitles } from "./components/Subtitles"
import { colors, fonts } from "./styles/theme"
import type { ShortsData } from "./types"

export const ShortsVideo: React.FC<ShortsData> = ({ headline, ogImagePath, subtitles }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const audioFile = staticFile("shorts.mp3")

  // Ken Burns: slow zoom on OG image
  const imgScale = interpolate(frame, [0, fps * 30], [1, 1.1], {
    extrapolateRight: "clamp",
  })

  // Headline animation: scale up + fade in
  const headlineScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.8 },
  })

  const headlineOpacity = interpolate(frame, [3, 15], [0, 1], {
    extrapolateRight: "clamp",
  })

  // Logo fade in
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        backgroundColor: colors.background,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Audio src={audioFile} />

      {/* OG Image background — top 50% */}
      {ogImagePath && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "55%",
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile(ogImagePath)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `scale(${imgScale})`,
            }}
          />
          {/* Dark overlay for text readability */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(26,20,16,0.3) 0%, rgba(26,20,16,0.8) 100%)",
            }}
          />
        </div>
      )}

      {/* Background glow when no image */}
      {!ogImagePath && (
        <>
          <div
            style={{
              position: "absolute",
              width: 600,
              height: 600,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colors.primary}40, transparent)`,
              top: "10%",
              right: "-10%",
              filter: "blur(60px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 400,
              height: 400,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${colors.secondary}25, transparent)`,
              top: "30%",
              left: "-5%",
              filter: "blur(60px)",
            }}
          />
        </>
      )}

      {/* YOMOO logo — top left */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 48,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: logoOpacity,
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontFamily: fonts.brand,
              fontWeight: 700,
              color: colors.text,
            }}
          >
            Y
          </span>
        </div>
        <span
          style={{
            fontSize: 20,
            fontFamily: fonts.body,
            fontWeight: 600,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          YOMOO 每日AI快送
        </span>
      </div>

      {/* Bold headline — center */}
      <div
        style={{
          position: "absolute",
          top: "38%",
          left: 48,
          right: 48,
          zIndex: 10,
          opacity: headlineOpacity,
          transform: `scale(${headlineScale})`,
        }}
      >
        <div
          style={{
            fontSize: headline.length > 8 ? 80 : 96,
            fontFamily: fonts.body,
            fontWeight: 900,
            color: colors.text,
            lineHeight: 1.3,
            letterSpacing: 4,
            textShadow: "0 4px 24px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          {headline}
        </div>
        {/* Accent underline */}
        <div
          style={{
            width: 100,
            height: 5,
            borderRadius: 3,
            background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
            marginTop: 24,
          }}
        />
      </div>

      {/* Subtitles — bottom area */}
      {subtitles && subtitles.length > 0 && <Subtitles lines={subtitles} />}
    </div>
  )
}
```

- [ ] **Step 2: Register ShortsVideo composition in Root.tsx**

In `apps/simple-reader/video/src/Root.tsx`:

Add import at top:

```typescript
import { shorts } from "./styles/theme"
import { ShortsVideo } from "./ShortsVideo"
import type { ShortsData } from "./types"
```

Add default props after existing `defaultProps`:

```typescript
const defaultShortsProps: ShortsData = {
  headline: "AI接管电脑",
  audioDuration: 45,
  fps: 30,
  youtubeTitle: "AI接管你的电脑了！",
}
```

Add the Composition inside the fragment, after the Thumbnail Composition:

```tsx
<Composition
  id="ShortsVideo"
  component={ShortsVideo}
  durationInFrames={defaultShortsProps.audioDuration * defaultShortsProps.fps}
  fps={shorts.fps}
  width={shorts.width}
  height={shorts.height}
  defaultProps={defaultShortsProps}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/video/src/ShortsVideo.tsx apps/simple-reader/video/src/Root.tsx apps/simple-reader/video/src/styles/theme.ts apps/simple-reader/video/src/types.ts
git commit -m "feat(simple-reader): add ShortsVideo Remotion composition"
```

---

### Task 5: `renderShorts` in video-render.ts

**Files:**

- Modify: `apps/simple-reader/main/video-render.ts`

- [ ] **Step 1: Add `renderShorts` function**

Add to `apps/simple-reader/main/video-render.ts`, after the `renderThumbnail` function:

```typescript
/**
 * Render a Shorts vertical video using Remotion CLI.
 * Spawns `npx remotion render` with the ShortsVideo composition at 1080x1920.
 */
export function renderShorts(
  scenesJsonPath: string,
  audioPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<string> {
  const { onProgress, onStatus } = options

  return new Promise((resolve, reject) => {
    onStatus?.("Starting Shorts render...")

    // Copy audio to Remotion's public/ dir as shorts.mp3
    const videoProjectDir = getVideoProjectDir()
    const publicDir = path.resolve(videoProjectDir, "public")
    fs.mkdirSync(publicDir, { recursive: true })
    const publicAudioPath = path.resolve(publicDir, "shorts.mp3")
    fs.copyFileSync(audioPath, publicAudioPath)
    console.info("[video-render] Copied Shorts audio to", publicAudioPath)

    const args = [
      "remotion",
      "render",
      getVideoEntryPoint(),
      "ShortsVideo",
      "--output",
      outputPath,
      "--props",
      scenesJsonPath,
      "--codec",
      "h264",
      "--fps",
      "30",
    ]

    console.info("[video-render] Spawning Shorts render:", "npx", args.join(" "))

    const proc = spawn("npx", args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: videoProjectDir,
    })

    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      console.info("[video-render] shorts stdout:", data.toString().trim())
    })

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString()
      stderr += text
      const progressMatch = text.match(/(\d+)%/)
      if (progressMatch) {
        const pct = Number.parseInt(progressMatch[1]!, 10)
        onProgress?.(pct)
        onStatus?.(`Rendering Shorts: ${pct}%`)
      }
    })

    proc.on("close", (code) => {
      console.info("[video-render] Shorts render exited with code:", code)
      if (code === 0) {
        onStatus?.("Shorts render complete")
        resolve(outputPath)
      } else {
        reject(new Error(`Remotion Shorts render exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Remotion for Shorts: ${err.message}`))
    })
  })
}
```

- [ ] **Step 2: Run existing tests**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/video-render.ts
git commit -m "feat(simple-reader): add renderShorts for vertical video rendering"
```

---

### Task 6: `downloadShortsOGImage` helper

**Files:**

- Modify: `apps/simple-reader/main/video-render.ts`

- [ ] **Step 1: Add `downloadShortsOGImage` function**

Add to `apps/simple-reader/main/video-render.ts`, after the `downloadOGImages` function:

```typescript
/**
 * Download a single OG image for Shorts to Remotion's public/images/ directory.
 * Returns the local relative path for staticFile(), or undefined if download fails.
 */
export async function downloadShortsOGImage(
  imageUrl: string,
  onStatus?: (status: string) => void,
): Promise<string | undefined> {
  const imagesDir = path.resolve(getVideoProjectDir(), "public", "images")
  fs.mkdirSync(imagesDir, { recursive: true })

  const localName = "shorts-og.jpg"
  const localPath = path.resolve(imagesDir, localName)

  try {
    onStatus?.("Downloading Shorts OG image...")
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      redirect: "follow",
    })

    if (!response.ok || !response.body) {
      console.info(`[video-render] Shorts OG image download failed: ${response.status}`)
      return undefined
    }

    const fileStream = fs.createWriteStream(localPath)
    // @ts-expect-error -- Node ReadableStream from fetch body
    await pipeline(response.body, fileStream)
    console.info("[video-render] Shorts OG image downloaded:", localName)
    return `images/${localName}`
  } catch (err) {
    console.info(`[video-render] Shorts OG image download failed: ${err}`)
    return undefined
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/simple-reader/main/video-render.ts
git commit -m "feat(simple-reader): add downloadShortsOGImage helper"
```

---

### Task 7: Wire Shorts into pipeline.ts (Stage 9)

**Files:**

- Modify: `apps/simple-reader/main/pipeline.ts`

- [ ] **Step 1: Add imports**

In `apps/simple-reader/main/pipeline.ts`, update imports:

Add to the `./ai-report` import:

```typescript
import {
  formatYouTubeInsights,
  generatePodcastScriptToString,
  generateReportToString,
  generateSeoDescription,
  generateShortsScript,
} from "./ai-report"
```

Add to the `./video-render` import:

```typescript
import {
  downloadOGImages,
  downloadShortsOGImage,
  renderShorts,
  renderThumbnail,
  renderVideo,
} from "./video-render"
```

- [ ] **Step 2: Update pipeline step count and add Stage 9**

In the `runPipeline` function, find the section that calculates `total` steps:

```typescript
let total = 6
if (videoEnabled) total += 1
if (youtubeEnabled) total += 1
```

Change to:

```typescript
const shortsEnabled = youtubeEnabled && prefs.youtubeShortsEnabled
let total = 6
if (videoEnabled) total += 1
if (youtubeEnabled) total += 1
if (shortsEnabled) total += 1
```

Then find the end of the YouTube upload stage (after `youtubeUrl = ...` assignment, before the final `catch` of the video block). Add Stage 9 inside the video try block, after the YouTube upload section:

```typescript
// Stage 9: Shorts Generation + Upload (if enabled)
if (shortsEnabled) {
  step++
  callbacks.onStage("shorts")
  callbacks.onProgress(step, total)

  try {
    // 9a: Generate Shorts script
    callbacks.onStatus("Generating Shorts script...")
    const shortsScript = await generateShortsScript(reportContent, (s) => callbacks.onStatus(s))
    console.info("[pipeline] Shorts script generated:", shortsScript.title)

    // 9b: Generate Shorts audio
    callbacks.onStatus("Generating Shorts audio...")
    const shortsAudioResult = await generateAudioToFile(shortsScript.script, (s) =>
      callbacks.onStatus(s),
    )
    const shortsAudioPath = shortsAudioResult.filePath
    const shortsSubtitles = shortsAudioResult.subtitles

    // 9c: Build Shorts scenes JSON
    const shortsScenesData = {
      headline: shortsScript.headline,
      ogImagePath: undefined as string | undefined,
      audioDuration: shortsSubtitles?.at(-1)?.end || 45,
      fps: 30,
      subtitles: shortsSubtitles?.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
      youtubeTitle: shortsScript.title,
    }

    // 9d: Download OG image
    if (shortsScript.ogImageUrl) {
      const ogPath = await downloadShortsOGImage(shortsScript.ogImageUrl, (s) =>
        callbacks.onStatus(s),
      )
      if (ogPath) {
        shortsScenesData.ogImagePath = ogPath
      }
    }

    // Write Shorts scenes JSON
    const shortsScenesPath = path.join(tmpDir, "shorts-scenes.json")
    fs.writeFileSync(shortsScenesPath, JSON.stringify(shortsScenesData, null, 2), "utf-8")

    // 9e: Render Shorts video
    const shortsOutputPath = path.join(tmpDir, "shorts.mp4")
    await renderShorts(shortsScenesPath, shortsAudioPath, shortsOutputPath, {
      onProgress: (pct) => callbacks.onStatus(`Rendering Shorts: ${pct}%`),
      onStatus: (status) => callbacks.onStatus(status),
    })

    // 9f: Upload Shorts to YouTube
    callbacks.onStatus("Uploading Shorts to YouTube...")
    const shortsVideoId = await uploadVideo({
      accessToken,
      videoPath: shortsOutputPath,
      title: shortsScript.title,
      description: `${shortsScript.headline}\n\n完整版: ${pageUrl}\n\n#Shorts #AI #每日AI快送 #YOMOO`,
      tags: ["Shorts", "AI", "每日AI快送", "YOMOO", "科技新闻"],
      categoryId: "28",
      privacyStatus: "public",
      onProgress: (pct) => callbacks.onStatus(`Uploading Shorts: ${pct}%`),
    })

    const shortsUrl = `https://www.youtube.com/shorts/${shortsVideoId}`
    console.info("[pipeline] Shorts uploaded:", shortsUrl)
    callbacks.onStatus(`Shorts uploaded: ${shortsUrl}`)
  } catch (shortsErr) {
    console.info("[pipeline] Shorts generation failed (non-fatal):", shortsErr)
    callbacks.onStatus(`Shorts generation skipped: ${shortsErr}`)
  }
}
```

Note: `accessToken` is already available from the YouTube upload stage above. `tmpDir` is already declared. `pageUrl` is already available. `generateAudioToFile` is already imported.

- [ ] **Step 3: Run all tests**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/simple-reader/main/pipeline.ts
git commit -m "feat(simple-reader): add Shorts generation as Stage 9 in pipeline"
```

---

### Task 8: Final integration verification

**Files:**

- All modified files

- [ ] **Step 1: Run full test suite**

Run: `cd apps/simple-reader && npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/yhfy2006/Documents/github/Folo && pnpm run typecheck`
Expected: No errors in simple-reader files

- [ ] **Step 3: Run lint**

Run: `cd /Users/yhfy2006/Documents/github/Folo && pnpm run lint:fix`
Expected: No errors

- [ ] **Step 4: Final commit if lint made changes**

```bash
git add -A
git commit -m "chore(simple-reader): lint fixes for Shorts feature"
```
