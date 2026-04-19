import { execFile } from "node:child_process"

export interface BeatSyncPoint {
  time: number // seconds
  energy: number // 0-1 normalized
  phrase: number // phrase number (1-based)
}

export interface BgmAnalysis {
  bpm: number
  duration: number
  phraseInterval: number // seconds per 8-beat phrase
  syncPoints: BeatSyncPoint[]
}

/**
 * Analyze a BGM file using librosa (Python) to find phrase-level downbeats.
 * Returns sync points where text cards should appear.
 * Falls back to fixed intervals if Python/librosa is unavailable.
 */
export async function analyzeBgm(bgmPath: string): Promise<BgmAnalysis> {
  try {
    return await analyzeBgmWithLibrosa(bgmPath)
  } catch (err) {
    console.warn("[bgm-analyzer] librosa analysis failed, using fixed intervals:", err)
    return fallbackAnalysis(bgmPath)
  }
}

async function analyzeBgmWithLibrosa(bgmPath: string): Promise<BgmAnalysis> {
  const script = `
import librosa
import numpy as np
import json
from scipy.ndimage import uniform_filter1d

y, sr = librosa.load(${JSON.stringify(bgmPath)}, sr=44100)
duration = librosa.get_duration(y=y, sr=sr)

tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units='frames')
beat_times = librosa.frames_to_time(beat_frames, sr=sr)
tempo_val = float(np.mean(tempo)) if hasattr(tempo, '__len__') else float(tempo)

rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
rms_times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=512)
rms_smooth = uniform_filter1d(rms, size=30)
rms_max = float(rms_smooth.max()) if rms_smooth.max() > 0 else 1.0

phrase_size = 8
sync_points = []
for i in range(0, len(beat_times), phrase_size):
    phrase_beats = beat_times[i:i+phrase_size]
    if len(phrase_beats) == 0:
        break
    t = float(phrase_beats[0])
    idx = np.argmin(np.abs(rms_times - t))
    energy = float(rms_smooth[idx] / rms_max)
    sync_points.append({"time": round(t, 3), "energy": round(energy, 2), "phrase": len(sync_points) + 1})

result = {
    "bpm": round(tempo_val, 1),
    "duration": round(duration, 1),
    "phraseInterval": round(60 / tempo_val * phrase_size, 2),
    "syncPoints": sync_points
}
print(json.dumps(result))
`

  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      ["-c", script],
      { maxBuffer: 5 * 1024 * 1024, timeout: 30_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Python analysis failed: ${stderr || err.message}`))
          return
        }
        try {
          resolve(JSON.parse(stdout.trim()) as BgmAnalysis)
        } catch (parseErr) {
          reject(new Error(`Failed to parse analysis output: ${parseErr}`))
        }
      },
    )
  })
}

/**
 * Fallback: estimate timing from file duration without librosa.
 * Assumes ~60 BPM and 8-beat phrases (~8s intervals).
 */
function fallbackAnalysis(_bgmPath: string): BgmAnalysis {
  const phraseInterval = 8
  const estimatedDuration = 160
  const syncPoints: BeatSyncPoint[] = []

  for (let t = 0; t < estimatedDuration; t += phraseInterval) {
    syncPoints.push({
      time: Math.round(t * 1000) / 1000,
      energy: 0.5,
      phrase: syncPoints.length + 1,
    })
  }

  return {
    bpm: 60,
    duration: estimatedDuration,
    phraseInterval,
    syncPoints,
  }
}
