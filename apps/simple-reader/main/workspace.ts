import fs from "node:fs"

import path from "pathe"

import { getUserDataPath } from "./runtime/paths"

/**
 * Initialize and return the path to the Claude CLI workspace.
 * This workspace contains CLAUDE.md and .claude/skills/ that
 * Claude CLI will automatically load when invoked with cwd set here.
 */
export function getWorkspacePath(): string {
  const workspacePath = path.join(getUserDataPath(), "claude-workspace")
  return workspacePath
}

export function initWorkspace(): void {
  const workspacePath = getWorkspacePath()
  const claudeDir = path.join(workspacePath, ".claude")
  const skillsDir = path.join(claudeDir, "skills")
  const builtinDir = path.join(skillsDir, "builtin")

  // Create directories (including builtin subdirectory)
  fs.mkdirSync(builtinDir, { recursive: true })

  // Also ensure user global skills directory exists
  const userSkillsDir = path.join(getUserDataPath(), "skills")
  fs.mkdirSync(userSkillsDir, { recursive: true })

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

  // Write builtin skills (always overwrite to keep in sync with app updates)
  initBuiltinSkills(builtinDir)

  console.info("[workspace] Initialized at:", workspacePath)
}

/**
 * Write all builtin skill files to the builtin/ subdirectory.
 * These are always overwritten on launch to stay in sync with the app.
 * Users can override them by placing a same-named file in:
 *   - <userData>/skills/ (user global, survives app updates)
 *   - <workspace>/.claude/skills/ (workspace-level, highest priority)
 */
function initBuiltinSkills(builtinDir: string): void {
  fs.writeFileSync(
    path.join(builtinDir, "screening.md"),
    `---
name: screening
description: "Screen RSS feed entries and select the most valuable ones. Use when: evaluating a batch of entries to pick the best. NOT for: generating reports, scripts, or analysis."
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
    "utf-8",
  )

  fs.writeFileSync(
    path.join(builtinDir, "daily-report.md"),
    `---
name: daily-report
description: "Generate a structured daily briefing from curated articles. Use when: creating a report from selected entries. NOT for: screening entries or podcast conversion."
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
    "utf-8",
  )

  fs.writeFileSync(
    path.join(builtinDir, "topic-deep-dive.md"),
    `---
name: topic-deep-dive
description: "Deep-dive analysis on a specific topic from feed entries. Use when: user requests analysis of a particular theme or topic. NOT for: daily/weekly reports."
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
    "utf-8",
  )

  fs.writeFileSync(
    path.join(builtinDir, "weekly-summary.md"),
    `---
name: weekly-summary
description: "Generate a weekly digest from the past week's entries. Use when: creating a weekly review report. NOT for: daily reports or individual topics."
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
    "utf-8",
  )

  fs.writeFileSync(
    path.join(builtinDir, "podcast-script.md"),
    `---
name: podcast-script
description: "Convert a daily briefing report into a podcast broadcast script. Use when: turning a written report into spoken audio script. NOT for: generating reports or screening."
---

You are a professional podcast script writer. Convert the provided daily briefing report into an engaging broadcast script (口播文案) suitable for audio generation.

## Core Methodology

Follow the "小Lin说" style methodology:

### Opening Design (3 seconds to hook)
- Use contrast hooks: \`Extreme data/phenomenon A\` + \`but/yet\` + \`Completely opposite result B\`
- Or question chains to spark curiosity
- Or vivid scene-setting that puts the listener right there

### Narrative Structure
- Use timeline + causal chains to make complex topics clear
- Every event has clear cause-and-effect relationships forming logical loops
- Use comparison structures to enhance understanding

### Language Style — Like Chatting with a Friend
- Use conversational expressions: "I'll tell you", "look", "think about it", "you know what"
- Use metaphors and personification to make abstract concepts concrete
- Use moderate emotional vocabulary for impact: "absolutely", "astonishing", "incredible"

### Information Density: Data + Story + Opinion
- Every argument backed by specific data
- Use real cases to ground abstract concepts
- Weave in personal insights amid objective narration

### Rhythm Control: Highs and Lows
- Opening (high) → Background (steady) → Key conflict (high) → Analysis (steady) → Climax (highest) → Summary (steady close)
- Alternate long and short sentences
- Natural transitions between segments

### Ending Design
- Summarize with a memorable quote
- Leave open questions for thought
- Create emotional resonance

## Output Rules

**CRITICAL**: Output ONLY the script body as plain text.
- NO markdown headings (no #, ##, ### etc.)
- NO bullet points or numbered lists
- NO markdown formatting (no **, *, \`, etc.)
- NO section titles or labels
- Just flowing, natural spoken text, paragraph by paragraph
- Use blank lines between paragraphs for breathing pauses
- The output should read exactly like a person talking — ready for TTS/audio generation
`,
    "utf-8",
  )

  console.info("[workspace] Wrote builtin skills to:", builtinDir)
}
