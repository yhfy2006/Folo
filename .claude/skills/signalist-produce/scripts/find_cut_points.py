#!/usr/bin/env python3
"""
Find safe cut points in a clip: places where ffmpeg detects silence AND
the SRT shows a sentence ending. Only points where both align within 2s
are returned — these are the positions where inserting a text card will
NOT interrupt continuous speech.

Usage:
  python3 find_cut_points.py \
    --video /tmp/signalist-test/segment-3.mp4 \
    --srt /tmp/signalist-test/P7Y-fynYsgE.en.srt \
    --clip-start-sec 1522 \
    --clip-end-sec 1580

Output: JSON list on stdout, e.g.
  [
    {"time": 19.7, "silence_duration": 1.3, "text": "...to human existence."},
    {"time": 39.8, "silence_duration": 2.9, "text": "...everyone will die. Oops."}
  ]

Times are RELATIVE to clip start (0 = first frame of the segment file).
"""

import argparse
import json
import re
import subprocess
import sys


def detect_silences(video_path: str, min_duration: float, noise_db: int):
    """Use ffmpeg silencedetect filter to find audio pauses."""
    result = subprocess.run(
        ["ffmpeg", "-i", video_path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_duration}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    silences = []
    for line in result.stderr.split("\n"):
        start_match = re.search(r"silence_start:\s*([\d.]+)", line)
        end_match = re.search(
            r"silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)", line
        )
        if start_match:
            silences.append({"start": float(start_match.group(1))})
        elif end_match and silences:
            silences[-1]["end"] = float(end_match.group(1))
            silences[-1]["duration"] = float(end_match.group(2))
    return silences


def parse_srt_boundaries(srt_path: str, clip_start: float, clip_end: float):
    """Extract sentence-ending timestamps from SRT entries overlapping the clip range."""
    with open(srt_path, encoding="utf-8") as f:
        srt = f.read()

    def to_sec(t):
        h, m, rest = t.split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    boundaries = []
    for block in re.split(r"\n\n+", srt.strip()):
        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue
        tm = re.match(r"(\d+:\d+:\d+,\d+)\s*-->\s*(\d+:\d+:\d+,\d+)", lines[1])
        if not tm:
            continue
        start, end = to_sec(tm.group(1)), to_sec(tm.group(2))
        if end <= clip_start or start >= clip_end:
            continue
        text = " ".join(lines[2:]).strip()
        if text.rstrip().endswith((".", "?", "!")):
            boundaries.append({
                "time": round(end - clip_start, 1),
                "text": text,
            })
    return boundaries


def find_safe_cuts(silences, boundaries, alignment_window: float):
    """Return silence points that are within `alignment_window` seconds of a sentence end."""
    safe_cuts = []
    for s in silences:
        s_mid = s["start"] + s.get("duration", 0.3) / 2
        for b in boundaries:
            if abs(s_mid - b["time"]) < alignment_window:
                safe_cuts.append({
                    "time": round(s["start"], 1),
                    "silence_duration": round(s.get("duration", 0), 1),
                    "text": b["text"],
                })
                break
    # Deduplicate within 1 second — keep the one with longest silence
    safe_cuts.sort(key=lambda c: c["time"])
    deduped = []
    for c in safe_cuts:
        if deduped and c["time"] - deduped[-1]["time"] < 1.0:
            if c["silence_duration"] > deduped[-1]["silence_duration"]:
                deduped[-1] = c
        else:
            deduped.append(c)
    return deduped


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True, help="path to the clip video file")
    p.add_argument("--srt", required=True, help="path to the full source SRT")
    p.add_argument("--clip-start-sec", type=float, required=True,
                   help="clip start time in the original source video (seconds)")
    p.add_argument("--clip-end-sec", type=float, required=True,
                   help="clip end time in the original source video (seconds)")
    p.add_argument("--min-silence", type=float, default=0.3,
                   help="minimum silence duration in seconds (default 0.3)")
    p.add_argument("--noise-db", type=int, default=-30,
                   help="silence threshold in dB (default -30)")
    p.add_argument("--alignment-window", type=float, default=2.0,
                   help="how close silence and sentence end must be (seconds)")
    args = p.parse_args()

    silences = detect_silences(args.video, args.min_silence, args.noise_db)
    boundaries = parse_srt_boundaries(args.srt, args.clip_start_sec, args.clip_end_sec)
    safe_cuts = find_safe_cuts(silences, boundaries, args.alignment_window)

    json.dump(safe_cuts, sys.stdout, indent=2, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
