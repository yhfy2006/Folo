import { spawn } from "node:child_process"
import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

// ── Project path helpers (mirrors video-render.ts) ───────────────────

function getVideoProjectDir(): string {
  return path.resolve(app.getAppPath(), "video")
}

function getVideoEntryPoint(): string {
  return path.resolve(getVideoProjectDir(), "src", "index.ts")
}

/** Resolve the remotion CLI binary by walking up from the video project */
function getRemotionBin(): string {
  let dir = getVideoProjectDir()
  while (dir !== path.dirname(dir)) {
    const bin = path.resolve(dir, "node_modules", ".bin", "remotion")
    if (fs.existsSync(bin)) return bin
    dir = path.dirname(dir)
  }
  // Fallback — let PATH resolve it
  return "remotion"
}

// ── Public dir helpers ───────────────────────────────────────────────

function getPublicDir(): string {
  return path.resolve(getVideoProjectDir(), "public")
}

/**
 * Copy a video segment file to Remotion's public/ directory.
 * Returns the filename (e.g. "signalist-segment-0.mp4") for staticFile() reference.
 */
export function copySegmentToPublic(sourcePath: string, name: string): string {
  const publicDir = getPublicDir()
  fs.mkdirSync(publicDir, { recursive: true })
  const dest = path.resolve(publicDir, name)
  fs.copyFileSync(sourcePath, dest)
  console.info("[signalist-render] Copied segment to", dest)
  return name
}

/**
 * Copy a BGM file to Remotion's public/ directory as "signalist-bgm.mp3".
 * Returns the filename for staticFile() reference.
 */
export function copyBgmToPublic(sourcePath: string): string {
  const publicDir = getPublicDir()
  fs.mkdirSync(publicDir, { recursive: true })
  const dest = path.resolve(publicDir, "signalist-bgm.mp3")
  fs.copyFileSync(sourcePath, dest)
  console.info("[signalist-render] Copied BGM to", dest)
  return "signalist-bgm.mp3"
}

// ── Render options ───────────────────────────────────────────────────

export interface SignalistRenderOptions {
  onProgress?: (pct: number) => void
  onStatus?: (status: string) => void
}

/**
 * Render the SignalistShorts Remotion composition.
 * Spawns: remotion render <entryPoint> SignalistShorts --output <outputPath> --props <propsJsonPath> --codec h264 --fps 30
 */
export function renderSignalistShorts(
  propsJsonPath: string,
  outputPath: string,
  options: SignalistRenderOptions = {},
): Promise<string> {
  const { onProgress, onStatus } = options

  return new Promise((resolve, reject) => {
    onStatus?.("Starting SignalistShorts render...")

    const videoProjectDir = getVideoProjectDir()
    const remotionBin = getRemotionBin()

    const args = [
      "render",
      getVideoEntryPoint(),
      "SignalistShorts",
      "--output",
      outputPath,
      "--props",
      propsJsonPath,
      "--codec",
      "h264",
      "--fps",
      "30",
    ]

    console.info("[signalist-render] Spawning:", remotionBin, args.join(" "), "in", videoProjectDir)

    const proc = spawn(remotionBin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: videoProjectDir,
    })

    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      console.info("[signalist-render] stdout:", data.toString().trim())
    })

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString()
      stderr += text

      // Parse progress from Remotion's stderr output
      const progressMatch = text.match(/(\d+)%/)
      if (progressMatch) {
        const pct = Number.parseInt(progressMatch[1]!, 10)
        onProgress?.(pct)
        onStatus?.(`Rendering SignalistShorts: ${pct}%`)
      }
    })

    proc.on("close", (code) => {
      console.info("[signalist-render] Render exited with code:", code)
      if (code === 0) {
        onStatus?.("SignalistShorts render complete")
        resolve(outputPath)
      } else {
        reject(new Error(`Remotion SignalistShorts render exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Remotion for SignalistShorts: ${err.message}`))
    })
  })
}
