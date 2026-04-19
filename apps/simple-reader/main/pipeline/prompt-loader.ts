import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"

import { join } from "pathe"

import type { Channel } from "./channel-types"
import { substituteTemplate } from "./channel-types"

// ── Public API ─────────────────────────────────────────────────────

/**
 * Read a `.md` prompt file from the channel's promptDir,
 * run template variable substitution, and return the result.
 *
 * @throws if the prompt file does not exist
 */
export function loadPrompt(
  channel: Channel,
  promptName: string,
  extraVars?: Record<string, string>,
): string {
  const filePath = resolvePromptPath(channel, promptName)

  if (!existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`)
  }

  const raw = readFileSync(filePath, "utf-8")
  return substituteTemplate(raw, channel, extraVars)
}

/**
 * List all `.md` files in the channel's promptDir.
 * Returns name, absolute path, and last-modified ISO date string.
 */
export function listPromptFiles(
  channel: Channel,
): { name: string; path: string; modified: string }[] {
  const dir = channel.promptDir

  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const fullPath = join(dir, f)
      const stat = statSync(fullPath)
      return {
        name: f,
        path: fullPath,
        modified: stat.mtime.toISOString(),
      }
    })
}

/**
 * Read raw prompt content WITHOUT template substitution (for the editor UI).
 * Returns empty string if the file does not exist.
 */
export function readPromptRaw(channel: Channel, promptName: string): string {
  const filePath = resolvePromptPath(channel, promptName)

  if (!existsSync(filePath)) {
    return ""
  }

  return readFileSync(filePath, "utf-8")
}

/**
 * Write content to a prompt file in the channel's promptDir.
 * Creates the directory if it does not exist.
 */
export function savePrompt(channel: Channel, promptName: string, content: string): void {
  const filePath = resolvePromptPath(channel, promptName)
  ensureDir(channel.promptDir)
  writeFileSync(filePath, content, "utf-8")
}

/**
 * Read a file from the channel's skillsDir.
 * Returns empty string if the file does not exist.
 */
export function readSkill(channel: Channel, skillName: string): string {
  const filePath = join(channel.skillsDir, skillName)

  if (!existsSync(filePath)) {
    return ""
  }

  return readFileSync(filePath, "utf-8")
}

/**
 * Write a file to the channel's skillsDir.
 * Creates the directory if it does not exist.
 */
export function writeSkill(channel: Channel, skillName: string, content: string): void {
  const filePath = join(channel.skillsDir, skillName)
  ensureDir(channel.skillsDir)
  writeFileSync(filePath, content, "utf-8")
}

/**
 * Load all `.md` files from the channel's context/ directory.
 * Returns XML-tagged context blocks, or empty string if no context exists.
 */
export function loadChannelContext(channel: Channel): string {
  const contextDir = join(channel.promptDir, "..", "context")

  if (!existsSync(contextDir)) {
    return ""
  }

  const files = readdirSync(contextDir)
    .filter((f) => f.endsWith(".md"))
    .sort()

  if (files.length === 0) {
    return ""
  }

  return files
    .map((f) => {
      const name = f.replace(".md", "")
      const content = readFileSync(join(contextDir, f), "utf-8")
      return `<context name="${name}">\n${content}\n</context>`
    })
    .join("\n\n")
}

// ── Helpers ────────────────────────────────────────────────────────

function resolvePromptPath(channel: Channel, promptName: string): string {
  const fileName = promptName.endsWith(".md") ? promptName : `${promptName}.md`
  return join(channel.promptDir, fileName)
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
