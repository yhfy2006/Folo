# Signalist Channel — Design Spec

## Overview

**Signalist** is a new channel type for the YOMOO Studio pipeline that automatically discovers trending interview/speech videos on YouTube, extracts the most compelling moments using AI analysis, and produces cinematic vertical Shorts with text cards and epic background music.

**Core difference from existing channels:** Existing channels (zh-ai-daily, en-ai-daily) follow a text-to-content pipeline: RSS articles → AI report → podcast → TTS → video. Signalist follows a video-to-shorts pipeline: YouTube videos → transcription → AI highlight extraction → cinematic Shorts rendering.

### Key Decisions

| Decision             | Choice                                    | Rationale                                                       |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Brand name           | Signalist                                 | Unique, no YouTube conflicts, conveys "extracting signals"      |
| Source discovery     | RSS + AI screening, fully automatic       | Reuses existing feed architecture, zero human intervention      |
| Language             | English, English audience                 | First target market                                             |
| YouTube channel      | Independent, separate from YOMOO          | Different brand identity                                        |
| Transcription        | YouTube captions first, Whisper fallback  | Free, fast, high coverage                                       |
| Highlight extraction | Borrowed from AutoClip prompt engineering | Battle-tested prompts for outline/timeline/scoring              |
| Video rendering      | Remotion (React-based)                    | Cinematic text cards + BGM, consistent with existing tech stack |
| BGM                  | Fixed royalty-free epic music library     | Simple, zero cost, brand consistency                            |
| Shorts per source    | AI decides (0-N based on quality)         | Quality over quantity                                           |

---

## Pipeline Architecture

### Stage Flow

```
discover → screen → transcribe → extract → script → render → upload → publish
```

| #   | Stage          | Purpose                                                          | Reuse                                    | New Code                                          |
| --- | -------------- | ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| 1   | **discover**   | Pull new videos from RSS feeds                                   | Existing feed mechanism                  | Minimal — filter for video entries                |
| 2   | **screen**     | AI judges: is this an interview? Topic relevant? Worth clipping? | LLM call pattern from report stage       | New prompt + screening logic                      |
| 3   | **transcribe** | Get timestamped transcript (SRT)                                 | —                                        | New — yt-dlp subtitle download + Whisper fallback |
| 4   | **extract**    | AI analyzes transcript, identifies best moments with timestamps  | —                                        | New — adapted from AutoClip prompts               |
| 5   | **script**     | AI writes text card copy for each segment                        | LLM call pattern                         | New prompt                                        |
| 6   | **render**     | Remotion renders cinematic Shorts (text cards + clips + BGM)     | Remotion infrastructure from video stage | New Remotion composition                          |
| 7   | **upload**     | Upload to YouTube as Shorts                                      | Existing YouTube upload logic            | Minimal adaptation                                |
| 8   | **publish**    | Set video to public                                              | Existing publish logic                   | Minimal adaptation                                |

### Shorts Video Structure

Each Shorts video follows this pattern:

```
[Black screen + cinematic text card 1]     ~3s
    ↓ fade transition
[Interview clip segment 1]                 ~10-15s
    ↓ fade transition
[Black screen + text card 2]               ~2s
    ↓ fade transition
[Interview clip segment 2]                 ~10-15s
    ↓ fade transition
...repeat 2-4 times...
    ↓ fade transition
[Black screen + thought-provoking summary] ~3s
```

**Specifications:**

- Duration: ~60 seconds total
- Aspect ratio: 9:16 vertical (1080x1920)
- BGM: Epic/cinematic music from preset library, plays throughout at reduced volume under speech
- Text cards: White text on black background, cinematic font, fade-in animation
- Subtitles: English hard-burned subtitles during interview clips
- Transitions: Fade to/from black between text cards and clips

---

## Stage Details

### Stage 1: discover

**Purpose:** Pull new video entries from subscribed YouTube channel RSS feeds.

**Input:** Feed group bound to the Signalist channel (RSS feeds of target YouTube channels).

**Process:**

1. Reuse existing feed fetching mechanism — YouTube channels have native RSS at `https://www.youtube.com/feeds/videos.xml?channel_id=XXXXX`
2. Filter entries to only video content (ignore community posts, playlists)
3. Deduplicate against previously processed videos (track by YouTube video ID)

**Output:** List of candidate video entries with title, description, URL, publish date.

**Reuse:** This is essentially the existing `discover` stage behavior — the feed group already handles RSS polling. The only new logic is dedup tracking.

### Stage 2: screen

**Purpose:** AI determines whether each candidate video is worth processing.

**Screening criteria (configured in `prompts/screening.md`):**

- Is this an interview, conversation, speech, or panel discussion? (not a tutorial, music video, vlog, etc.)
- Is the topic relevant? (tech, AI, politics, science, culture — configurable per channel)
- Is the video long enough to contain extractable highlights? (minimum ~10 minutes)
- Is it from a credible source?

**Input:** Video title, description, channel name, duration (from RSS metadata + YouTube oEmbed).

**Output:** Boolean pass/fail per video + brief reasoning. Only passing videos proceed.

**Prompt template** (`prompts/screening.md`):

```markdown
You are a content curator for Signalist, a YouTube Shorts channel that extracts
the most compelling moments from interviews and speeches.

Evaluate whether this video is worth processing:

Title: {{videoTitle}}
Channel: {{channelName}}
Description: {{videoDescription}}
Duration: {{videoDuration}}

Criteria:

- Must be an interview, conversation, speech, panel, or debate
- Topic must relate to: {{topics}}
- Minimum duration: 10 minutes
- Source should be credible

Respond with JSON:
{
"pass": true/false,
"reason": "one sentence explanation"
}
```

### Stage 3: transcribe

**Purpose:** Obtain a timestamped SRT transcript of the source video.

**Process (two-tier):**

1. **Primary — YouTube captions:**

   ```bash
   yt-dlp --write-sub --write-auto-sub --sub-lang en --sub-format srt \
          --skip-download -o "%(id)s" <video_url>
   ```

   - Prefer manual captions (`en`) over auto-generated (`en-auto`)
   - yt-dlp handles this priority automatically

2. **Fallback — Whisper transcription:**

   ```bash
   # Download audio only
   yt-dlp -x --audio-format wav -o "%(id)s.%(ext)s" <video_url>
   # Transcribe with Whisper
   whisper audio.wav --model medium --language en --output_format srt
   ```

   - Use `medium` model for balance of speed and accuracy
   - Only triggered when YouTube captions unavailable

**Output:** SRT file with timestamped segments, stored in pipeline working directory.

**Dependencies:** `yt-dlp` (npm package or system binary), `whisper` (Python, optional fallback).

### Stage 4: extract

**Purpose:** AI analyzes the full transcript and identifies the most compelling moments with precise timestamps.

**This is the core intelligence stage**, heavily inspired by AutoClip's battle-tested prompt engineering.

**Process (3 sub-steps, mirroring AutoClip's pipeline):**

#### 4a. Outline extraction

Feed the transcript to LLM, extract topic outline with subtopics.

Key principles (from AutoClip's `大纲.txt`):

- Cover 95%+ of valuable content
- Each topic should correspond to 3-12 minutes of video
- Merge related short topics, split overly long ones
- Check coverage at start, middle, and end of video

#### 4b. Timeline positioning

For each topic in the outline, locate precise start/end timestamps in the SRT.

Key principles (from AutoClip's `时间点.txt`):

- Align to sentence boundaries in SRT (no mid-sentence cuts)
- Prefer natural semantic boundaries (topic intro phrases, summary phrases)
- Add 0.5-1s buffer before/after
- Minimum segment duration: 10 seconds (for Shorts, shorter than AutoClip's 90s)

#### 4c. Scoring and selection

Score each segment for "viral potential" and select the best ones.

Scoring criteria:

- **Controversy/surprise factor** — counterintuitive claims, bold predictions
- **Quotability** — concise, memorable phrasing
- **Emotional intensity** — passion, humor, anger, awe
- **Standalone clarity** — understandable without full interview context
- **Visual engagement** — speaker's energy, gestures (inferred from speech patterns)

**Output per selected segment:**

```typescript
interface ExtractedClip {
  id: number
  startTime: string // "HH:MM:SS,mmm" SRT format
  endTime: string
  durationSeconds: number
  topic: string // brief topic label
  transcript: string // full text of segment
  viralScore: number // 0-10
  reason: string // why this is compelling
}
```

**AI decides how many clips to produce** — could be 0 (nothing compelling) to 5+ from a single source video. Quality threshold: viralScore >= 7.

### Stage 5: script

**Purpose:** For each extracted clip, generate the cinematic text card copy.

**Input:** ExtractedClip[] from extract stage.

**Output per clip:**

```typescript
interface ShortsScript {
  clipId: number
  openingCard: string // 1-2 sentences, sets up the clip
  segments: Array<{
    textCard: string // transition text between sub-segments
    clipStart: string // timestamp within the extracted clip
    clipEnd: string
  }>
  closingCard: string // thought-provoking summary/question
  suggestedTitle: string // YouTube Shorts title
  suggestedTags: string[] // hashtags
}
```

**Text card style guidelines (in `prompts/script.md`):**

- Opening card: bold, attention-grabbing, like a movie tagline
- Transition cards: short, punchy, contextualizes the next segment
- Closing card: thought-provoking question or powerful summary
- All in English, conversational but cinematic tone
- Maximum 15 words per text card

### Stage 6: render

**Purpose:** Produce the final Shorts video using Remotion.

**Input:** Source video file (downloaded segments via yt-dlp) + ShortsScript + BGM file.

**Process:**

1. **Download source video segments:**

   ```bash
   yt-dlp --download-sections "*{start}-{end}" -o segment.mp4 <url>
   ```

   Download only the needed segments, not the full video.

2. **Remotion composition:**
   A new Remotion composition `SignalistShorts` that renders:
   - Text card sequences (white text, black background, fade-in/out animation)
   - Video clip segments (cropped/scaled to 9:16, with hard-burned subtitles)
   - BGM audio track (epic/cinematic, ducked under speech)
   - Fade transitions between all elements

3. **Render to MP4:**
   ```bash
   npx remotion render SignalistShorts out.mp4 --props=<script.json>
   ```

**Remotion composition structure:**

```
<SignalistShorts>
  <Audio src={bgm} volume={0.15} />         // Epic BGM, low volume
  <Series>
    <TextCard text={openingCard} />           // Fade in from black
    <VideoSegment src={clip1} subs={srt1} />  // 9:16 cropped + subtitles
    <TextCard text={transitionCard1} />
    <VideoSegment src={clip2} subs={srt2} />
    ...
    <TextCard text={closingCard} />           // Thought-provoking ending
  </Series>
</SignalistShorts>
```

**BGM handling:**

- Store 3-5 royalty-free epic/cinematic tracks in `workspace/channels/signalist/assets/bgm/`
- Randomly select one per Shorts
- Audio ducking: reduce BGM to ~15% volume when speech is playing, ~40% during text cards

**9:16 video cropping:**

- Source interviews are typically 16:9
- Center-crop to 9:16 (focus on speaker's face)
- Could use face detection in future, but center-crop is good enough for v1

### Stage 7: upload

**Purpose:** Upload rendered Shorts to YouTube.

**Reuse:** Existing YouTube upload logic from `main/youtube.ts`, adapted for:

- Shorts metadata (title, description, tags from ShortsScript)
- Shorts-specific settings (vertical video, < 60s)
- Different YouTube channel credentials (Signalist channel, not YOMOO)

### Stage 8: publish

**Purpose:** Set uploaded video to public.

**Reuse:** Existing publish logic. Simple YouTube API call to update video status.

---

## Channel Configuration

### Directory Structure

```
workspace/channels/signalist/
  channel.json
  prompts/
    screening.md          # Video screening criteria
    extract.md            # Highlight extraction prompt (adapted from AutoClip)
    script.md             # Text card copy generation prompt
  assets/
    bgm/
      epic-01.mp3         # Royalty-free cinematic tracks
      epic-02.mp3
      epic-03.mp3
  context/
    audience.md           # Target audience profile
    style.md              # Visual/editorial style guide
    guidelines.md         # Content guidelines (topics, boundaries)
  skills/
```

### channel.json

```json
{
  "name": "Signalist",
  "language": "en",
  "groupId": "",
  "pipelineType": "signalist",
  "tts": {
    "provider": "minimax",
    "voiceId": "",
    "model": ""
  },
  "youtube": {
    "tags": ["shorts", "interview", "highlights", "AI", "tech"],
    "titleTemplate": "{{suggestedTitle}} | Signalist",
    "descriptionTemplate": "Extracted from: {{sourceTitle}} by {{sourceChannel}}\n\n#shorts #signalist"
  },
  "stages": [
    "discover",
    "screen",
    "transcribe",
    "extract",
    "script",
    "render",
    "upload",
    "publish"
  ],
  "promptDir": "prompts",
  "skillsDir": "skills",
  "signalist": {
    "topics": ["AI", "technology", "politics", "science", "culture", "economics"],
    "minVideoDuration": 600,
    "viralScoreThreshold": 7,
    "maxShortsPerVideo": 5,
    "shortsTargetDuration": 58,
    "bgmDir": "assets/bgm"
  }
}
```

### New Field: pipelineType

To distinguish Signalist from standard YOMOO channels, add a `pipelineType` field to the Channel interface:

```typescript
export interface Channel {
  // ... existing fields ...
  pipelineType?: "standard" | "signalist" // default: "standard"
}
```

The orchestrator uses this to load the correct stage definitions. Standard channels use the existing 11-stage pipeline; Signalist channels use the 8-stage Signalist pipeline.

---

## New StageName Types

Extend the existing `StageName` union to include Signalist-specific stages:

```typescript
export type StageName =
  // Standard pipeline stages
  | "verify"
  | "reflect"
  | "discover"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"
  // Signalist pipeline stages (some shared: discover, upload, publish)
  | "screen"
  | "transcribe"
  | "extract"
  | "script"
  | "render"
```

Shared stages between pipelines: `discover`, `upload`, `publish`.

---

## Pipeline Context Extension

Add Signalist-specific fields to `PipelineContext`:

```typescript
export interface PipelineContext {
  // ... existing fields ...

  // Signalist stages
  candidateVideos?: CandidateVideo[] // discover output
  screenedVideos?: ScreenedVideo[] // screen output
  transcript?: TranscriptData // transcribe output
  extractedClips?: ExtractedClip[] // extract output
  shortsScripts?: ShortsScript[] // script output
  renderedVideos?: RenderedVideo[] // render output
}

interface CandidateVideo {
  videoId: string
  title: string
  channelName: string
  description: string
  duration: number // seconds
  url: string
  publishDate: string
}

interface ScreenedVideo {
  video: CandidateVideo
  pass: boolean
  reason: string
}

interface TranscriptData {
  videoId: string
  srtPath: string // path to SRT file
  source: "youtube" | "whisper"
  language: string
}

interface ExtractedClip {
  id: number
  startTime: string
  endTime: string
  durationSeconds: number
  topic: string
  transcript: string
  viralScore: number
  reason: string
}

interface ShortsScript {
  clipId: number
  openingCard: string
  segments: Array<{
    textCard: string
    clipStart: string
    clipEnd: string
  }>
  closingCard: string
  suggestedTitle: string
  suggestedTags: string[]
}

interface RenderedVideo {
  clipId: number
  filePath: string
  title: string
  description: string
  tags: string[]
}
```

---

## Orchestrator Changes

The orchestrator currently loads stages from a single `ALL_STAGES` array. To support multiple pipeline types:

```typescript
// In orchestrator.ts
import { STANDARD_STAGES } from "./stages"
import { SIGNALIST_STAGES } from "./stages-signalist"

function getStagesForChannel(channel?: Channel): StageDefinition[] {
  if (channel?.pipelineType === "signalist") {
    return SIGNALIST_STAGES
  }
  return STANDARD_STAGES
}
```

The `executePipeline()` function remains largely unchanged — it still iterates through stages sequentially, passing context. The only change is which stage array it uses.

---

## Processing Flow: One Source → Multiple Shorts

A key difference from the standard pipeline: Signalist processes one source video but may produce multiple Shorts. The pipeline handles this as follows:

1. `discover` returns N candidate videos
2. `screen` filters to M passed videos
3. For each passed video:
   - `transcribe` produces one SRT
   - `extract` produces K clips (AI decides K, could be 0)
   - `script` produces K scripts
   - `render` produces K videos
   - `upload` uploads K videos
   - `publish` publishes K videos

**Implementation:** The pipeline iterates through passed videos. For each video, it runs transcribe → extract → script → render as a batch. Then uploads all rendered videos at the end.

This is a loop within the pipeline execution, not multiple pipeline runs. The context accumulates results:

```
ctx.candidateVideos = [v1, v2, v3]         // discover
ctx.screenedVideos = [v1(pass), v3(pass)]  // screen
// For v1:
ctx.transcript = {srt for v1}              // transcribe
ctx.extractedClips = [c1, c2]              // extract
ctx.shortsScripts = [s1, s2]              // script
ctx.renderedVideos = [r1, r2]             // render
// For v3: repeat, accumulate into renderedVideos
ctx.renderedVideos = [r1, r2, r3]         // total from all sources
// Then bulk upload
```

---

## Dedup & State Tracking

To avoid processing the same video twice, track processed video IDs:

- Store in a simple JSON file: `workspace/channels/signalist/processed-videos.json`
- Structure: `{ "videoId": "2026-04-17" }` (video ID → date processed)
- `discover` stage filters out already-processed videos
- Clean up entries older than 90 days to prevent file bloat

---

## External Dependencies

| Dependency | Purpose                                        | Install                                 |
| ---------- | ---------------------------------------------- | --------------------------------------- |
| yt-dlp     | YouTube video/subtitle download                | `pip install yt-dlp` or brew            |
| whisper    | Fallback transcription                         | `pip install openai-whisper` (optional) |
| ffmpeg     | Video processing (used by yt-dlp and Remotion) | `brew install ffmpeg`                   |
| Remotion   | Video rendering                                | Already in project                      |

**yt-dlp** is the most critical new dependency. It must be available as a system binary. The pipeline should check for its presence in the `verify` equivalent and report a clear error if missing.

---

## UI Integration

Signalist uses the same Channel Detail UI as standard channels, with minor adaptations:

### Pipeline Tab

- Same GitHub Actions-style stage sidebar
- Stage names reflect Signalist pipeline: discover, screen, transcribe, extract, script, render, upload, publish
- Log console shows processing of each source video

### Overview Tab

- Shows recent Shorts produced (thumbnail + title + YouTube link)
- Shows source videos processed today
- Stats: total Shorts produced, average viral score

### Settings Tab

- **General**: Channel name, language, topics list
- **YouTube**: Channel credentials, default tags, title template
- **Signalist**: Viral score threshold, max shorts per video, target duration
- **Stages**: Same stage toggle UI
- **Prompts**: Same CodeMirror editor for screening.md, extract.md, script.md

### Feeds Tab

- Shows subscribed YouTube channels (RSS feeds)
- Add new YouTube channel by URL → auto-converts to RSS feed

---

## Implementation Phases

### Phase 1: Core Pipeline (MVP)

1. Add new StageName types and pipelineType to Channel interface
2. Implement `screen` stage (AI video screening)
3. Implement `transcribe` stage (yt-dlp + Whisper fallback)
4. Implement `extract` stage (adapted AutoClip prompts)
5. Implement `script` stage (text card generation)
6. Implement `render` stage (new Remotion SignalistShorts composition)
7. Wire up orchestrator to support multiple pipeline types
8. Create bundled `signalist` channel template

### Phase 2: Upload & Polish

9. Adapt `upload`/`publish` stages for Signalist metadata
10. Add dedup tracking (processed-videos.json)
11. Add BGM ducking logic in Remotion composition
12. UI adaptations for Signalist pipeline stages

### Phase 3: Optimization

13. Face detection for smart 9:16 cropping (optional)
14. A/B testing different text card styles
15. Analytics integration (track which Shorts perform best)

---

## AutoClip Prompt Adaptation Notes

AutoClip's prompts are designed for Chinese content and 3-12 minute clips. For Signalist (English, ~60s Shorts), adapt:

| AutoClip Setting                      | Signalist Adaptation                           |
| ------------------------------------- | ---------------------------------------------- |
| Minimum clip: 90 seconds              | Minimum clip: 10 seconds (individual segments) |
| Target: 3-12 minutes                  | Target: 10-15 seconds per segment, ~60s total  |
| Language: Chinese semantic boundaries | English sentence boundaries                    |
| Output: raw video cuts                | Output: structured segments for Remotion       |
| Scoring: content value                | Scoring: viral potential + standalone clarity  |
| 通义千问 (Qwen)                       | Claude API (consistent with existing pipeline) |

The prompt structure (outline → timeline → scoring) is excellent and should be preserved. The specific criteria and thresholds need adjustment for short-form viral content.
