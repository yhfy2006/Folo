#!/usr/bin/env python3
"""
Build the Remotion SignalistShorts props JSON from script + cuts.

Input: a script.json that names the segments (opening, clip 1 parts,
bridges, clip 2 parts, closing) with durations and video references.
Output: props JSON matching the SignalistShortsData TypeScript type.

This mostly centralizes the frame math (frames = round(seconds * fps))
and the videoStartFrom calculation so you don't make off-by-one
mistakes in the clip-continuity-preserving logic.

The input JSON shape:
{
  "fps": 30,
  "bgmPath": "signalist-bgm.mp3",
  "segments": [
    {"type": "text", "text": "...", "seconds": 5.0},
    {"type": "clip", "videoPath": "signalist-segment-1.mp4",
     "videoStartSec": 0.0, "seconds": 31.8,
     "topText": "...", "bottomText": "..."},
    ...
  ]
}

The output JSON shape:
{
  "fps": 30,
  "bgmPath": "signalist-bgm.mp3",
  "totalDurationSeconds": 173.0,
  "segments": [
    {"type": "text", "text": "...", "durationFrames": 150},
    {"type": "clip", "videoPath": "signalist-segment-1.mp4",
     "videoStartFrom": 0, "durationFrames": 954,
     "topText": "...", "bottomText": "..."},
    ...
  ]
}

Usage:
  python3 build_props.py --input script.json --output props.json
"""

import argparse
import json
import sys


def build_props(script):
    fps = script.get("fps", 30)
    bgm_path = script.get("bgmPath")
    segments_in = script["segments"]

    segments_out = []
    for s in segments_in:
        seconds = float(s["seconds"])
        duration_frames = int(round(seconds * fps))

        if s["type"] == "text":
            segments_out.append({
                "type": "text",
                "text": s["text"],
                "durationFrames": duration_frames,
            })
        elif s["type"] == "clip":
            entry = {
                "type": "clip",
                "videoPath": s["videoPath"],
                "videoStartFrom": int(round(float(s["videoStartSec"]) * fps)),
                "durationFrames": duration_frames,
            }
            if s.get("topText"):
                entry["topText"] = s["topText"]
            if s.get("bottomText"):
                entry["bottomText"] = s["bottomText"]
            if s.get("subtitleText"):
                entry["subtitleText"] = s["subtitleText"]
            segments_out.append(entry)
        else:
            print(f"ERROR: unknown segment type: {s['type']}", file=sys.stderr)
            sys.exit(1)

    total_frames = sum(seg["durationFrames"] for seg in segments_out)
    total_seconds = total_frames / fps

    if total_seconds > 180:
        print(f"WARNING: total duration {total_seconds:.1f}s exceeds YouTube Shorts "
              f"limit of 180s. Trim before rendering.", file=sys.stderr)

    return {
        "segments": segments_out,
        "totalDurationSeconds": round(total_seconds, 2),
        "fps": fps,
        "bgmPath": bgm_path,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True, help="script.json path")
    p.add_argument("--output", required=True, help="props.json output path")
    args = p.parse_args()

    with open(args.input, encoding="utf-8") as f:
        script = json.load(f)

    props = build_props(script)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(props, f, indent=2, ensure_ascii=False)

    total = props["totalDurationSeconds"]
    mins, secs = divmod(int(total), 60)
    print(f"Built props: {len(props['segments'])} segments, "
          f"total {total:.1f}s ({mins}:{secs:02d})")


if __name__ == "__main__":
    main()
