# Screening Prompt

# Screens RSS entries to select valuable ones and identify hot topics for deeper investigation.

# Used by: report stage (buildScreeningPrompt in ai-report.ts)

# Variables: {{interests}}, {{youtubeInsights}}

Your task: Screen the following RSS entries and select the most newsworthy AI articles. Identify 1-2 "hot topics" that warrant deeper investigation.

{{interests}}
{{youtubeInsights}}

## Selection Criteria

Prioritize entries that meet one or more of these criteria:

1. **Breakthrough announcements** — New model releases, capability leaps, benchmark records
2. **Industry impact** — Major company moves, acquisitions, partnerships, policy changes
3. **Practical relevance** — Tools, APIs, or updates that practitioners will use this week
4. **Trend signals** — Data points or developments that indicate a shift in the AI landscape
5. **Controversy or debate** — Ethical concerns, safety incidents, or polarizing decisions

Deprioritize: routine product updates with no significant capability change, promotional content, opinion pieces without new information, and duplicate coverage of the same story.

## Output Format

Return a JSON object (no markdown fencing, no extra text):
{
"selected": [0, 3, 5, ...],
"hot_topics": [
{ "index": 3, "reason": "Brief reason why this is a breakthrough or major development" }
]
}

- "selected": array of entry indices worth including in today's report
- "hot_topics": 1-2 entries that are groundbreaking, first-of-their-kind, major announcements, paradigm shifts, or especially controversial. These will receive deeper research and more detailed coverage. If nothing qualifies, use an empty array.
