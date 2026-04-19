import fs from "node:fs"

import path from "pathe"

import { getUserDataPath } from "./runtime/paths"
import { getWorkspacePath } from "./workspace"

export interface SkillEntry {
  name: string
  description: string
  filePath: string
  layer: "builtin" | "user" | "workspace"
}

/**
 * Scan a directory for .md files with YAML frontmatter containing name and description.
 * Returns an array of SkillEntry objects.
 */
function scanSkillDir(dir: string, layer: SkillEntry["layer"]): SkillEntry[] {
  if (!fs.existsSync(dir)) {
    return []
  }

  const entries: SkillEntry[] = []

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue

    const filePath = path.join(dir, file)
    // Skip directories (e.g. the builtin/ subdirectory)
    if (fs.statSync(filePath).isDirectory()) continue

    try {
      const content = fs.readFileSync(filePath, "utf-8")
      const frontmatter = parseFrontmatter(content)
      if (frontmatter.name && frontmatter.description) {
        entries.push({
          name: frontmatter.name,
          description: frontmatter.description,
          filePath,
          layer,
        })
      }
    } catch {
      console.warn(`[skills] Could not read skill file: ${filePath}`)
    }
  }

  return entries
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns an object with name and description fields.
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const yaml = match[1]!
  const result: { name?: string; description?: string } = {}

  for (const line of yaml.split("\n")) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch) result.name = nameMatch[1]!.trim()

    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch) result.description = descMatch[1]!.trim()
  }

  return result
}

/**
 * Load skills from all three layers and merge them.
 * Higher priority layers override lower ones with the same name.
 * Priority: builtin (lowest) < user global < workspace (highest)
 */
export function loadAllSkills(): SkillEntry[] {
  const workspacePath = getWorkspacePath()

  // Layer 1: Builtin skills (lowest priority)
  const builtinDir = path.join(workspacePath, ".claude", "skills", "builtin")
  const builtinSkills = scanSkillDir(builtinDir, "builtin")

  // Layer 2: User global skills (middle priority)
  const userSkillsDir = path.join(getUserDataPath(), "skills")
  const userSkills = scanSkillDir(userSkillsDir, "user")

  // Layer 3: Workspace skills (highest priority, excludes builtin/ subdirectory)
  const workspaceSkillsDir = path.join(workspacePath, ".claude", "skills")
  const workspaceSkills = scanSkillDir(workspaceSkillsDir, "workspace")

  // Merge: higher priority overrides same name
  const skillMap = new Map<string, SkillEntry>()

  for (const skill of builtinSkills) {
    skillMap.set(skill.name, skill)
  }
  for (const skill of userSkills) {
    skillMap.set(skill.name, skill)
  }
  for (const skill of workspaceSkills) {
    skillMap.set(skill.name, skill)
  }

  const merged = [...skillMap.values()]
  console.info(
    `[skills] Loaded ${merged.length} skills (${builtinSkills.length} builtin, ${userSkills.length} user, ${workspaceSkills.length} workspace)`,
  )

  return merged
}

/**
 * Generate the skills prompt block for injection into Claude prompts.
 * Embeds the full skill content directly in the prompt so Claude doesn't
 * need to use tools (Read/Write) which would cause multi-turn behavior
 * and potentially write output to files instead of stdout.
 */
export function formatSkillsPrompt(skills: SkillEntry[]): string {
  if (skills.length === 0) {
    return ""
  }

  const skillBlocks = skills
    .map((s) => {
      try {
        const content = fs.readFileSync(s.filePath, "utf-8")
        // Strip YAML frontmatter
        const body = content.replace(/^---[\s\S]*?---\n*/, "").trim()
        return `### Skill: ${s.name}\n\n${body}`
      } catch {
        return `### Skill: ${s.name}\n\n${s.description}`
      }
    })
    .join("\n\n")

  return `## Available Skills\n\nFollow the applicable skill guidelines below.\n\n${skillBlocks}`
}
