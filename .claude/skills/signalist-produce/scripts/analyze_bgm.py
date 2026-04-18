#!/usr/bin/env python3
"""
Analyze a BGM file with librosa to extract phrase-level downbeat timestamps.
These are used to optionally align text card entries to musical beats — BUT
only when doing so doesn't conflict with speech-boundary cuts (speech wins).

Usage:
  python3 analyze_bgm.py --bgm /path/to/bgm.mp3

Output: JSON on stdout
  {
    "bpm": 59.4,
    "duration": 157.6,
    "phraseInterval": 8.08,
    "syncPoints": [0.03, 8.16, 16.3, 24.44, ...]
  }

Each entry in syncPoints is a timestamp (seconds from BGM start) where a
musical phrase begins — these are the natural downbeats.
"""

import argparse
import json
import sys

try:
    import librosa
    import numpy as np
except ImportError:
    print("ERROR: librosa and numpy must be installed. Run: pip3 install librosa",
          file=sys.stderr)
    sys.exit(1)


def analyze(bgm_path: str, phrase_size: int = 8):
    y, sr = librosa.load(bgm_path, sr=44100)
    duration = librosa.get_duration(y=y, sr=sr)

    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    # librosa may return tempo as array or scalar
    bpm = float(np.mean(tempo)) if hasattr(tempo, "__len__") else float(tempo)

    # Phrase downbeats = first beat of every 8-beat group
    sync_points = []
    for i in range(0, len(beat_times), phrase_size):
        phrase = beat_times[i : i + phrase_size]
        if len(phrase) == 0:
            break
        sync_points.append(round(float(phrase[0]), 2))

    return {
        "bpm": round(bpm, 1),
        "duration": round(float(duration), 1),
        "phraseInterval": round(60 / bpm * phrase_size, 2) if bpm > 0 else 8.0,
        "syncPoints": sync_points,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bgm", required=True, help="path to BGM audio file (.mp3 / .wav)")
    p.add_argument("--phrase-size", type=int, default=8,
                   help="beats per musical phrase (default 8)")
    args = p.parse_args()

    result = analyze(args.bgm, args.phrase_size)
    json.dump(result, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
