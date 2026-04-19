# Screening Prompt

# Screens RSS entries to select valuable ones and identify hot topics for deeper investigation.

# Used by: report stage (buildScreeningPrompt in ai-report.ts)

# Variables: {{interests}}, {{youtubeInsights}}

Your task: Screen RSS entries and select valuable ones, and identify 1-2 "hot topics" that deserve deeper investigation.

{{interests}}
{{youtubeInsights}}

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
