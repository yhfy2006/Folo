import { spawn } from "node:child_process"
import fs from "node:fs"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"

import path from "pathe"

import type { ScenesJson } from "./scene-generator"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Resolve the Remotion project entry point relative to this file
const VIDEO_ENTRY_POINT = path.resolve(__dirname, "..", "video", "src", "index.ts")

interface RenderOptions {
  onProgress?: (pct: number) => void
  onStatus?: (status: string) => void
}

/**
 * Download OG images for scenes to Remotion's public/images/ directory.
 * Updates scene.ogImage from URL to local relative path for staticFile().
 * Rewrites scenes.json with updated paths.
 */
export async function downloadOGImages(
  scenes: ScenesJson,
  scenesJsonPath: string,
  onStatus?: (status: string) => void,
): Promise<void> {
  const videoProjectDir = path.resolve(__dirname, "..", "video")
  const imagesDir = path.resolve(videoProjectDir, "public", "images")
  fs.mkdirSync(imagesDir, { recursive: true })

  const newsScenes = scenes.scenes.filter((s) => s.type === "news" && s.ogImage)
  if (newsScenes.length === 0) {
    onStatus?.("No OG images to download")
    return
  }

  onStatus?.(`Downloading ${newsScenes.length} OG images...`)

  await Promise.allSettled(
    newsScenes.map(async (scene) => {
      const imageUrl = scene.ogImage!
      const localName = `news-${scene.index}.jpg`
      const localPath = path.resolve(imagesDir, localName)

      try {
        const response = await fetch(imageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          redirect: "follow",
        })

        if (!response.ok || !response.body) {
          console.info(`[video-render] Failed to download image: ${response.status} ${imageUrl}`)
          scene.ogImage = undefined
          return
        }

        const fileStream = fs.createWriteStream(localPath)
        // @ts-expect-error -- Node ReadableStream from fetch body
        await pipeline(response.body, fileStream)

        // Update to relative path for Remotion staticFile()
        scene.ogImage = `images/${localName}`
        console.info(`[video-render] Downloaded OG image: ${localName}`)
      } catch (err) {
        console.info(`[video-render] Failed to download ${imageUrl}: ${err}`)
        scene.ogImage = undefined
      }
    }),
  )

  // Rewrite scenes.json with updated local paths
  fs.writeFileSync(scenesJsonPath, JSON.stringify(scenes, null, 2), "utf-8")
  const downloaded = newsScenes.filter((s) => s.ogImage).length
  onStatus?.(`Downloaded ${downloaded}/${newsScenes.length} OG images`)
}

/**
 * Render a video using Remotion CLI.
 * Spawns `npx remotion render` with the given scenes.json and audio.
 */
export function renderVideo(
  scenesJsonPath: string,
  audioPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<string> {
  const { onProgress, onStatus } = options

  return new Promise((resolve, reject) => {
    onStatus?.("Starting video render...")

    // Copy audio to Remotion's public/ dir so staticFile() can find it
    const videoProjectDir = path.resolve(__dirname, "..", "video")
    const publicDir = path.resolve(videoProjectDir, "public")
    fs.mkdirSync(publicDir, { recursive: true })
    const publicAudioPath = path.resolve(publicDir, "podcast.mp3")
    fs.copyFileSync(audioPath, publicAudioPath)
    console.info("[video-render] Copied audio to", publicAudioPath)

    const args = [
      "remotion",
      "render",
      VIDEO_ENTRY_POINT,
      "DailyReport",
      "--output",
      outputPath,
      "--props",
      scenesJsonPath,
      "--codec",
      "h264",
      "--fps",
      "30",
    ]

    console.info("[video-render] Spawning:", "npx", args.join(" "))

    const proc = spawn("npx", args, {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString()
      console.info("[video-render] stdout:", text.trim())
    })

    proc.stderr.on("data", (data: Buffer) => {
      const text = data.toString()
      stderr += text

      // Parse progress from Remotion's stderr output
      // Remotion outputs lines like "Rendering: 25% done" or "(25%)"
      const progressMatch = text.match(/(\d+)%/)
      if (progressMatch) {
        const pct = Number.parseInt(progressMatch[1]!, 10)
        onProgress?.(pct)
        onStatus?.(`Rendering video: ${pct}%`)
      }
    })

    proc.on("close", (code) => {
      console.info("[video-render] Render exited with code:", code)
      if (code === 0) {
        onStatus?.("Video render complete")
        resolve(outputPath)
      } else {
        reject(new Error(`Remotion render exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Remotion: ${err.message}`))
    })
  })
}

/**
 * Render a thumbnail still image using Remotion CLI.
 * Spawns `npx remotion still` for the Thumbnail composition.
 */
export function renderThumbnail(
  scenesJsonPath: string,
  outputPath: string,
  options: RenderOptions = {},
): Promise<string> {
  const { onStatus } = options

  return new Promise((resolve, reject) => {
    onStatus?.("Rendering thumbnail...")

    const args = [
      "remotion",
      "still",
      VIDEO_ENTRY_POINT,
      "Thumbnail",
      "--output",
      outputPath,
      "--props",
      scenesJsonPath,
      "--width",
      "1280",
      "--height",
      "720",
    ]

    console.info("[video-render] Spawning thumbnail:", "npx", args.join(" "))

    const proc = spawn("npx", args, {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stderr = ""

    proc.stdout.on("data", (data: Buffer) => {
      console.info("[video-render] stdout:", data.toString().trim())
    })

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      console.info("[video-render] Thumbnail exited with code:", code)
      if (code === 0) {
        onStatus?.("Thumbnail render complete")
        resolve(outputPath)
      } else {
        reject(new Error(`Remotion still exited with code ${code}: ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Remotion: ${err.message}`))
    })
  })
}
