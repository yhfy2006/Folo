---
name: signalist-produce
description: Produce a Signalist commentary Shorts video from a YouTube interview URL. Takes a video URL, extracts the most compelling moments, writes commentary text cards, cuts at verified speech boundaries, renders a 9:16 Shorts with cinematic text cards and BGM. Use whenever the user asks to produce, create, render, or make a Signalist Shorts video, or gives a YouTube URL in the context of the Signalist channel. Also triggers on requests to "run the Signalist pipeline", "make a clip from this interview", or "turn this video into Shorts".
---

# Signalist Produce

Produce one complete Signalist commentary Shorts video from a YouTube interview URL.

Signalist is a commentary channel, not a clip channel. Every text card must add original analysis — fact-check, context, reframe, or counterpoint — that transforms the source material.

The final output is a 9:16 vertical Shorts video rendered by Remotion, with the interview footage letterboxed horizontally in the center, gold-outlined headlines above and below, and epic BGM synced to phrase beats.

## Duration modes — completion rate over comprehensiveness

**Default: ≤90s (target 80-88s).** Shorts completion rate falls off a cliff past 90s; 60-90s is the sweet spot where the algorithm still treats the video as a Short-native asset and retention averages 50-70% for good content. Ship one or two of the strongest clips with tight commentary. Source footage ratio 70-85% is expected at this length — the commentary rule relaxes because there isn't room for Wikipedia padding anyway.

**Long mode: 150-178s.** Only use when the material actually has 3 clips that each score 8+ AND the commentary arc (hook → second-hook → payoff) justifies the length. At 3 min, completion rate typically drops to 30-45%; don't take the hit unless the extra content earns it. In long mode, the second-hook card at ~60s is mandatory.

Default to ≤90s unless the user explicitly asks for long-form or the interview is too dense to compress. When picking between 90s and 180s, prefer 90s — completion rate compounds into reach far more than extra minutes of content do.

## Inputs

- **YouTube URL** (required) — the source interview
- **Channel directory** (default: `apps/simple-reader/workspace/channels/signalist`) — contains prompts, context, BGM assets
- **Output directory** (default: `/tmp/signalist-<videoId>`) — where intermediate files and final MP4 land

## Output

- `output-shorts.mp4` — final rendered Shorts video (1080x1920, H.264, ≤ 180s)
- `production-log.json` — full production metadata (clips chosen, cut points, text cards, timing)

## External Dependencies

These must be installed on the system:

- `yt-dlp` — YouTube download + subtitle extraction
- `ffmpeg` / `ffprobe` — video segment cutting, silence detection
- `python3` with `librosa`, `scipy` — BGM beat analysis
- `claude` CLI — AI stages (extract, script)
- `npx remotion` — video rendering (resolved from `apps/simple-reader/video/node_modules`)

If any dependency is missing, stop and report which one before starting.

## The Pipeline (7 stages)

```
1. fetch-srt        → yt-dlp downloads English captions as SRT
2. extract          → AI picks the 1-3 most viral highlight clips from the SRT
3. find-cut-points  → ffmpeg silence detection + SRT boundaries → verified safe cuts
4. script           → AI writes commentary text cards using ONLY verified cut points
5. analyze-bgm      → librosa detects phrase downbeats in the BGM
6. download-clips   → yt-dlp downloads the exact video segments
7. render           → Remotion renders SignalistShorts with letterbox + headlines
```

Each stage's output is saved to the work directory so you can resume or debug any step. Every stage must complete before the next; a failure here is not recoverable without fixing the upstream problem.

## Core Design Principles

Understanding these prevents the most common production failures:

**Speech continuity is sacred.** Text cards interrupt the source audio. If a cut happens mid-sentence, the viewer hears "and then the government—" → [text card] → "—just didn't respond" and it feels broken. This is the #1 quality issue. Always place cuts at points where BOTH the SRT shows a sentence ending AND ffmpeg detects ≥0.3s of actual silence. The script stage MUST only use cut points that pass both checks.

**Commentary is the product.** If you removed the text cards and the video still made its point, the commentary isn't doing its job. Every card must add something the viewer wouldn't know from just watching the clip — a verified statistic, timeline context, a historical parallel, a counterpoint. Atmospheric hooks ("Everything is about to change") fail this test.

**Headlines frame the story.** Gold-outlined top/bottom text stays visible during clip playback and tells the viewer WHY this segment matters before they process what's being said. Top text is the setup ("AI CEO's Secret Confession"); bottom text is the payoff hook ("Chernobyl is the BEST case"). These are different from the commentary cards between clips.

**Rough beat alignment is enough.** BGM downbeats repeat every ~8 seconds. Commentary cards should land near beats for rhythmic feel, but speech-boundary constraints ALWAYS override beat constraints. Don't force a mid-sentence cut just to hit a beat.

**Retention curve drives structure.** Every Shorts length has predictable drop-off cliffs. The script must defend them:

- **Opening card (0:00-0:03, all lengths)** is a reverse-intuition statement, a hard number, or a name-drop. Never a teaser ("you won't believe..."). Never atmospheric ("everything is about to change"). A good hook states the payoff upfront, e.g. "Chernobyl is the BEST case" or "AI safety is a mathematical impossibility." If a viewer could screenshot the first card and it still delivers a thesis, it's working.
- **Mid-hook window scales with total duration.** The window is ~45% of total runtime:
  - **≤60s videos**: no mid-hook needed — there's no fatigue cliff to defend; keep the pacing uninterrupted.
  - **60-90s videos**: a commentary card MUST land between 35s and 55s (this is the micro-cliff at the half-point).
  - **90-120s videos**: card must land between 45s and 65s.
  - **>120s (long mode)**: card must land between 55s and 75s to defend the 1:00 cliff.
    The mid-hook card restarts tension — a fresh number, a stakes reframe ("Translation: every junior dev's job is next"), or a name-drop.
- **Closing card = CTA, not conclusion.** Must prompt a comment or replay. "Comment P(Doom) if you think we're cooked" beats "The future is uncertain." A good close makes the viewer act, not nod.

**Editorial first-frame cover is the thumbnail.** The first frame of the rendered video is what YouTube Shorts feed, channel grid, and search results display as the thumbnail. The script stage must emit a `cover` object (headline + kicker + attribution + attributionRole + pullQuote) which `build_props.py` prepends as a 1-frame segment with `variant: "cover"`. Playback passes through it in 33ms; the opening text card still carries the plain-language thesis in-video. Cover copy is literary (FT Weekend / Wired sentence style); opening card copy is direct and declarative. They complement, not duplicate.

**Definitive commentary, not Wikipedia.** Commentary cards state a position, not a summary. "500 billion dollars said: no one needs permission" beats "Altman raised $500B for AI infrastructure in 2024." The first reframes with attitude; the second narrates. Every card should pass the "could this be a tweet?" test — if it reads like an encyclopedia entry, rewrite with a verb and an edge.

## Stage Details

### 1. fetch-srt

Run yt-dlp to download English subtitles (prefer manual, fall back to auto):

```bash
yt-dlp --write-sub --write-auto-sub --sub-lang en --sub-format srt \
       --skip-download -o "<videoId>.%(ext)s" <YOUTUBE_URL>
```

The resulting file is named something like `<videoId>.en.srt` or `<videoId>.en-orig.srt`. Find whichever actually got created. If no SRT file appears, the video has no English captions and you'd need a Whisper fallback — stop and report this, don't guess.

Save the video metadata too (title, channel, duration) via `yt-dlp --print`. You'll need the source title and channel for the description.

### 2. extract

Call Claude with the FULL SRT content and the extract prompt from `<channel>/prompts/extract.md`. The prompt template has `{{viralScoreThreshold}}`, `{{maxClips}}`, `{{targetDuration}}` variables — substitute them from `channel.json`'s `signalist` config block.

The AI returns a JSON array of clips. For each clip: `id`, `start_time` (SRT format `HH:MM:SS,mmm`), `end_time`, `topic`, `transcript`, `viral_score` (0-10), `reason`. Only clips with `viral_score >= threshold` count. Typically you get 1-3 usable clips from a 1-2 hour interview.

If the AI returns zero clips, the interview doesn't meet the quality bar. Stop — don't force a video.

See `references/extract-prompt-template.md` for how to construct the prompt.

### 3. find-cut-points

This is the single most important stage for quality. For each extracted clip, find cut points that are BOTH a sentence ending in the SRT AND an ffmpeg-detected silence. Only these pass.

First, download the audio for just that clip range using yt-dlp's `--download-sections` option (or use the already-downloaded segment from stage 6 if running sequentially). Then:

```bash
python3 scripts/find_cut_points.py \
  --video <segment.mp4> \
  --srt <full_srt_path> \
  --clip-start-sec <S> \
  --clip-end-sec <E>
```

The script outputs a JSON list of verified cut points, each with `time` (relative to clip start), `silence_duration`, and the last words before the cut. It uses `ffmpeg -af silencedetect=noise=-30dB:d=0.3` cross-referenced with SRT sentence endings (`.`, `?`, `!`) — only points where the two align within 2 seconds are returned.

You don't need every sentence to be a cut point. You need 1-2 strong ones per clip (look for silences > 1s; these are emotional pauses or topic shifts — the best places to interject commentary).

### 4. script

Pass the extracted clips AND the verified cut points to Claude via the script prompt from `<channel>/prompts/script.md`. The key constraint to pass in the prompt: the AI must ONLY choose cut times from the verified list — inventing new cut points will reintroduce the mid-sentence problem.

The AI returns a script with:

- `openingCard` — 5s, hook + context
- `segments[]` — list of `{textCard, clipStart, clipEnd, topText, bottomText}` where `clipStart`/`clipEnd` are relative to the extracted clip
- `closingCard` — 5s, thought-provoking takeaway
- `suggestedTitle`, `suggestedTags`
- `topText` / `bottomText` — gold headline text shown during the clip segment before the text card fires

Enforce total duration ≤ 178s (leaves 2s margin under YouTube's 180s limit). If the AI produces something longer, either trim the middle clip or drop the least-impactful one; don't exceed 180s.

See `references/script-prompt-template.md` for the full prompt structure.

### 5. analyze-bgm

Pick a random BGM file from `<channel>/assets/bgm/*.mp3`. Run:

```bash
python3 scripts/analyze_bgm.py --bgm <bgm_path>
```

Returns JSON with `bpm`, `duration`, `phraseInterval`, `syncPoints` (phrase downbeat timestamps). Used to optionally nudge text card start times toward nearby beats — but only if that nudge doesn't push the cut into mid-sentence territory. When in doubt, prioritize speech boundaries over beats.

### 6. download-clips

For each clip in the extracted list, download just that segment:

```bash
yt-dlp --download-sections "*<startSec>-<endSec>" --force-keyframes-at-cuts \
       -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
       --merge-output-format mp4 \
       -o "segment-<id>.mp4" <YOUTUBE_URL>
```

`--force-keyframes-at-cuts` is critical — without it, yt-dlp can include a few extra seconds of the preceding scene to find a keyframe, which breaks your timing calculations.

Copy each segment into Remotion's public directory:

```
apps/simple-reader/video/public/signalist-segment-<id>.mp4
```

Also copy the chosen BGM:

```
apps/simple-reader/video/public/signalist-bgm.mp3
```

Remotion's `staticFile()` only reads from `public/`, so this step is mandatory.

### 7. render

Build the Remotion props JSON by walking the script and cut points together. The props schema is defined in `apps/simple-reader/video/src/types.ts` as `SignalistShortsData`. Each segment is either:

- **text card** — black screen with fade-in text (`type: "text"`, `text`, `durationFrames`)
- **clip segment** — letterboxed 16:9 video with optional top/bottom gold headlines (`type: "clip"`, `videoPath`, `videoStartFrom` in frames, `durationFrames`, `topText?`, `bottomText?`)

The assembly pattern:

```
[opening text card]
  → [clip A part 1] with topText/bottomText
  → [transition card between sub-segments of clip A]
  → [clip A part 2] with topText/bottomText
  → [bridge card between clips]
  → [clip B part 1] ...
  → [closing text card]
```

CRITICAL: for clip segments, `videoStartFrom` must be set correctly. Without it, Remotion plays the video based on composition timeline, which drifts every time a text card is inserted and causes each clip to start with the tail of the previous spoken word. Always set `videoStartFrom = (desired_second_in_source * 30)` in frames.

Save props JSON, then render:

```bash
cd apps/simple-reader/video && \
npx remotion render src/index.ts SignalistShorts \
  --output <work_dir>/output-shorts.mp4 \
  --props <work_dir>/signalist-props.json \
  --codec h264 --fps 30
```

See `references/render-props-schema.md` for detailed props construction rules including how headlines, timing, and BGM ducking interact.

## Quality Gates

After rendering, verify:

- **Duration**: `ffprobe -show_format output-shorts.mp4` → duration ≤ 90s by default (hard fail if over in default mode); ≤ 180s in explicit long mode.
- **Dimensions**: 1080x1920, 30fps. If off, Remotion config is wrong.
- **Spot-check playback**: Open the file and listen to the first 2 cuts. If either has residual speech from the previous sentence, the find-cut-points stage was too loose — rerun with `--min-silence 0.5` or have Claude pick different cut points.
- **Total source footage**: ≤ 70% of total duration for long mode (>120s); ≤ 85% for ≤90s mode (short videos are naturally source-heavy because there's no room for padding commentary). If over the threshold for your length class, the commentary isn't pulling its weight — cut a clip sub-part, not a commentary card.
- **Hook audit**: Screenshot frame at 00:01. If the visible text is a teaser ("you won't believe...", "this will shock you") or atmospheric ("the future is here"), the hook fails. The first card must be a thesis, a number, or a named claim — something the viewer can quote without watching further.
- **Mid-hook placement** (scales by total duration):
  - ≤60s: no mid-hook required.
  - 60-90s: commentary card must land between 35s and 55s.
  - 90-120s: commentary card must land between 45s and 65s.
  - \>120s: commentary card must land between 55s and 75s.
    If the script skipped the relevant window, insert one using the verified cut nearest the midpoint.
- **Closing is CTA, not conclusion**: The last card must invite a comment or a replay. If it reads like a summary ("The future is uncertain"), rewrite it as a question or a provocative claim that asks the viewer to take a side.

If any gate fails, say what failed and what stage to fix — don't silently deliver a broken video.

### Post-publish checks (24h)

After the video is live, pull YouTube Studio's retention curve and check three cliffs:

- **0:00-0:30 < 60% retention** → hook failed. The opening card was a teaser instead of a thesis. Next video: state the payoff upfront.
- **1:00-1:30 shows a drop-off cliff** → middle section lacked a second hook. Next video: plant a fresh number or stakes reframe on the cut nearest 60s.
- **Last 5s retention spikes up** → replay hook worked. Keep doing that.

These readings feed directly back into the next run's script stage — they're not post-mortem, they're the next script's brief.

## Common Failure Modes

**Mid-sentence cuts**: The script stage picked a cut point that wasn't in the verified list, or the verified list was generated with a too-short silence threshold. Rerun find-cut-points with `-d 0.5` (500ms minimum silence) and re-prompt the script stage.

**Clips play from wrong offset**: `videoStartFrom` was not set or was set in seconds instead of frames. Remotion needs frames: `Math.round(seconds * fps)`.

**Text cards go by too fast**: `durationFrames` was set too short. Minimum is 3s (90 frames); default 4s for transitions, 5s for opening/closing. Don't go below 3s unless the card is a single word.

**Render fails with staticFile error**: The segment or BGM file wasn't copied into `apps/simple-reader/video/public/`. Remotion only reads from public/.

**Over 180s**: YouTube Shorts cap. Trim the longest clip at its next verified cut point — don't just truncate at an arbitrary time, that reintroduces mid-sentence problems.

**Over 90s in default mode**: Default target is 80-88s for completion rate. If the extract stage returned 3 clips totalling >80s of speech, the script stage must pick the 2 strongest and drop the third — don't force all three in. Kindergarten + Volkswagen + Singularity in one video defeats the whole point of ≤90s mode. One crisp narrative beats three half-told ones.

## Quick Workflow Reference

```bash
# 1. Setup
WORK_DIR=/tmp/signalist-$(date +%s)
mkdir -p $WORK_DIR
VIDEO_URL="<USER_PROVIDED_URL>"
CHANNEL=/path/to/workspace/channels/signalist

# 2. SRT + metadata
yt-dlp --write-sub --write-auto-sub --sub-lang en --sub-format srt \
       --skip-download -o "$WORK_DIR/%(id)s.%(ext)s" "$VIDEO_URL"
yt-dlp --print "%(id)s|%(title)s|%(channel)s|%(duration)s" "$VIDEO_URL" \
       > "$WORK_DIR/meta.txt"

# 3. Extract via Claude (see references/extract-prompt-template.md)
# → produces $WORK_DIR/clips.json

# 4. For each clip: find cut points
python3 scripts/find_cut_points.py ...  # → $WORK_DIR/cuts-<id>.json

# 5. Script via Claude using verified cuts
# → produces $WORK_DIR/script.json

# 6. Analyze BGM
python3 scripts/analyze_bgm.py --bgm $CHANNEL/assets/bgm/epic-01.mp3 \
                               > $WORK_DIR/bgm.json

# 7. Download each clip
yt-dlp --download-sections "*<S>-<E>" ... -o "$WORK_DIR/segment-<id>.mp4" ...

# 8. Copy to Remotion public/
cp $WORK_DIR/segment-*.mp4 apps/simple-reader/video/public/signalist-segment-<id>.mp4
cp $CHANNEL/assets/bgm/epic-01.mp3 apps/simple-reader/video/public/signalist-bgm.mp3

# 9. Build props JSON (see references/render-props-schema.md)
# → $WORK_DIR/signalist-props.json

# 10. Render
cd apps/simple-reader/video && \
  npx remotion render src/index.ts SignalistShorts \
  --output $WORK_DIR/output-shorts.mp4 \
  --props $WORK_DIR/signalist-props.json \
  --codec h264 --fps 30

# 11. Quality check (duration, dimensions, playback)
ffprobe -v quiet -print_format json -show_format $WORK_DIR/output-shorts.mp4
```

## Reference Files

Load these only when you reach that stage — they're not needed until then:

- `references/extract-prompt-template.md` — Full extract prompt construction
- `references/script-prompt-template.md` — Script prompt with cut-point constraint
- `references/render-props-schema.md` — Remotion props field-by-field with examples
- `scripts/find_cut_points.py` — Silence detection + SRT cross-reference
- `scripts/analyze_bgm.py` — BGM beat analysis
- `scripts/build_props.py` — Props JSON builder from script.json + cuts
