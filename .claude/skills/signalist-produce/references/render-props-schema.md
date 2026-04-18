# Render Props Schema

The Remotion composition `SignalistShorts` expects props shaped as `SignalistShortsData` from `apps/simple-reader/video/src/types.ts`. Use `scripts/build_props.py` to generate the JSON — but understand the fields so you can debug when things look wrong.

## Top-level shape

```json
{
  "segments": [...],
  "totalDurationSeconds": 173.0,
  "fps": 30,
  "bgmPath": "signalist-bgm.mp3"
}
```

- `segments` — ordered array of text cards and video clips (see below)
- `totalDurationSeconds` — sum of all `durationFrames / fps`. Must be ≤ 180.
- `fps` — always 30 for Signalist
- `bgmPath` — filename (NOT absolute path) of the BGM inside `apps/simple-reader/video/public/`. Remotion's `staticFile()` resolves it relative to that dir.

## Text card segment

```json
{
  "type": "text",
  "text": "A Chernobyl-scale disaster is the only way to force regulation...",
  "durationFrames": 150
}
```

- `durationFrames = seconds * 30` — e.g. 3 seconds = 90 frames, 5 seconds = 150 frames
- Minimum 90 frames (3s) — below that the fade-in swallows most of the card
- Opening and closing cards: 150 frames (5s)
- Transition cards: 120 frames (4s) default, can go to 150 for longer commentary

## Clip segment

```json
{
  "type": "clip",
  "videoPath": "signalist-segment-1.mp4",
  "videoStartFrom": 0,
  "durationFrames": 954,
  "topText": "AI CEO's Secret Confession",
  "bottomText": "\"Chernobyl is the BEST case\""
}
```

- `videoPath` — filename in `video/public/`, e.g. `signalist-segment-1.mp4`
- `videoStartFrom` — **frames** into the source video where this clip segment starts. If you want to play from 31.8s of the source, set this to `round(31.8 * 30) = 954`. Getting this wrong is the #1 cause of "the clip has the wrong content" bugs.
- `durationFrames` — how long this clip segment plays, in frames
- `topText` (optional) — gold-outlined headline above the video. Keep under 5 words for readability.
- `bottomText` (optional) — gold-outlined headline below the video. Often a quote from the clip or the hook/payoff.
- `subtitleText` (optional, legacy) — smaller subtitle; only used if `bottomText` isn't set

## Why videoStartFrom matters

Without `videoStartFrom`, Remotion plays the video based on the composition's current frame. If the video is inserted at composition frame 300 (because a 10s text card came first), Remotion seeks the video to 300/30 = 10.0s — NOT to the beginning of your clip. This is why v3 had the "each clip starts with the tail of the previous spoken word" bug.

With `videoStartFrom` set correctly, the `<Sequence from={startFrame}>` wrapper resets the local timeline so `startFrom` means "start this video at N frames into the source file". That's what you want.

## Composition structure in practice

A typical 3-minute Signalist Shorts has ~11 segments:

```
1.  text (opening, 5s)
2.  clip part 1a (with topText/bottomText)
3.  text (commentary after clip 1 part 1, 5s)
4.  clip part 1b (different topText/bottomText)
5.  text (bridge to clip 2, 4s)
6.  clip part 2a
7.  text (commentary after clip 2, 4s)
8.  clip part 2b (if time allows)
9.  text (bridge to clip 3, 4s)
10. clip part 3a
11. text (closing, 5s)
```

## BGM ducking

The composition automatically ducks BGM volume based on whether the current frame is inside a clip segment:

- Text card frames → BGM at 40% volume (viewers can read comfortably)
- Clip frames → BGM at 15% (doesn't fight the speaker's voice)
- First 1s fade in, last 2s fade out

You don't control this from props — it's baked into `SignalistShorts.tsx`. Just pass `bgmPath` and it handles the rest.

## Validating before rendering

Before spawning Remotion (which takes 5-10 minutes for a 3-min video), sanity-check:

```python
import json
props = json.load(open('signalist-props.json'))
total_frames = sum(s['durationFrames'] for s in props['segments'])
assert abs(total_frames / 30 - props['totalDurationSeconds']) < 0.1, \
    "totalDurationSeconds doesn't match sum of segment frames"
assert props['totalDurationSeconds'] <= 180, "exceeds YouTube Shorts limit"
for s in props['segments']:
    if s['type'] == 'clip':
        assert s['videoStartFrom'] is not None, \
            f"clip segment missing videoStartFrom"
        assert s['videoStartFrom'] % 1 == 0, \
            f"videoStartFrom must be int frames not seconds"
```

These three checks catch the bulk of render-time surprises.
