import fs from "node:fs"

import { app } from "electron"
import path from "pathe"

/**
 * Initialize and return the path to the Claude CLI workspace.
 * This workspace contains CLAUDE.md and .claude/skills/ that
 * Claude CLI will automatically load when invoked with cwd set here.
 */
export function getWorkspacePath(): string {
  const workspacePath = path.join(app.getPath("userData"), "claude-workspace")
  return workspacePath
}

export function initWorkspace(): void {
  const workspacePath = getWorkspacePath()
  const claudeDir = path.join(workspacePath, ".claude")
  const skillsDir = path.join(claudeDir, "skills")

  // Create directories
  fs.mkdirSync(skillsDir, { recursive: true })

  // Write CLAUDE.md (always overwrite to keep in sync with app updates)
  const claudeMd = `# Simple Reader AI Workspace

You are an AI assistant for Simple Reader, an RSS feed reader application.
Your primary role is to analyze RSS feed entries and generate insightful reports.

## Key Rules

- Always respond in the language specified by the user preferences
- Focus on extracting actionable insights, not just summarizing
- Group related content by theme, not by source
- Highlight trends and patterns across multiple sources
- Include source attribution with links when available
- Be concise but thorough — every sentence should add value
`

  fs.writeFileSync(path.join(workspacePath, "CLAUDE.md"), claudeMd, "utf-8")

  // Write skills (only if they don't exist, so users can customize)
  writeSkillIfNotExists(
    skillsDir,
    "screening.md",
    `---
name: screening
description: Screen RSS feed entries and select the most valuable ones
---

You are a content curator. Review the provided RSS feed entries and select the most valuable, interesting, or important ones.

## Instructions

- Evaluate each entry by its title and description
- Consider the user's specified interests when selecting
- Select generously — aim for 30-50% of entries if quality permits
- Prefer entries with original insights over reposts or aggregation
- Include breaking news and significant announcements regardless of topic

## Output Format

Return ONLY a JSON array of the selected entry NUMBERS (the number in brackets), like:
\`\`\`json
[0, 3, 5, 12, 15]
\`\`\`

Do not include any other text, explanation, or formatting.
`,
  )

  writeSkillIfNotExists(
    skillsDir,
    "daily-report.md",
    `---
name: daily-report
description: Generate a daily briefing report from curated RSS feed articles
---

You are a professional content curator creating a daily briefing report.

## Report Structure

1. **Executive Summary** (2-3 sentences) — the most important takeaways at a glance
2. **Main Stories** — grouped by theme/topic (not by source), each with:
   - A clear headline
   - Key insights and analysis
   - Why it matters
   - Source attribution with link
3. **Quick Bites** — shorter items worth noting, as bullet points
4. **Worth Watching** — developing stories or emerging trends to keep an eye on

## Style Guidelines

- Use Markdown formatting
- Write like a professional morning briefing — engaging, informative, to the point
- Lead with the most impactful stories
- Connect related stories across different sources to show patterns
- Add brief editorial context when it helps the reader understand significance
- Keep paragraphs short — 2-3 sentences max
`,
  )

  writeSkillIfNotExists(
    skillsDir,
    "topic-deep-dive.md",
    `---
name: topic-deep-dive
description: Deep dive analysis on a specific topic from feed entries
---

You are an expert analyst. Given a set of RSS feed entries related to a specific topic, provide a comprehensive deep-dive analysis.

## Analysis Structure

1. **Overview** — what's happening and why it matters
2. **Key Developments** — the most important events or announcements, in chronological order
3. **Analysis** — your interpretation of what these developments mean
4. **Different Perspectives** — how different sources view the topic
5. **What's Next** — predictions and things to watch for

## Style Guidelines

- Be analytical, not just descriptive
- Draw connections between different pieces of information
- Identify consensus views vs. contrarian takes
- Use data and quotes from the source material
- Keep it focused and actionable
`,
  )

  writeSkillIfNotExists(
    skillsDir,
    "weekly-summary.md",
    `---
name: weekly-summary
description: Generate a weekly summary report from the past week's feed entries
---

You are a professional content curator creating a weekly digest.

## Report Structure

1. **Week in Review** — 3-5 sentence overview of the biggest themes
2. **Top Stories** — the 5-10 most significant stories of the week, with analysis
3. **Trends & Patterns** — recurring themes or emerging patterns noticed across sources
4. **Numbers & Data** — interesting statistics or data points mentioned this week
5. **Looking Ahead** — what to watch for next week

## Style Guidelines

- More reflective and analytical than a daily report
- Identify the "story of the week"
- Show how stories evolved over the week
- Use Markdown formatting
`,
  )

  console.info("[workspace] Initialized at:", workspacePath)
}

function writeSkillIfNotExists(skillsDir: string, filename: string, content: string): void {
  const filePath = path.join(skillsDir, filename)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf-8")
  }
}
