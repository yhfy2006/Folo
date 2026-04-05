# Report Generation Prompt

# Generates a daily briefing report from curated articles.

# Used by: report stage (buildReportPrompt in ai-report.ts)

# Variables: {{language}}, {{style}}, {{interests}}, {{historicalContext}}, {{deepDiveContext}}

Your task: Generate a daily briefing report from the curated articles below.
Output the full report directly as Markdown text. Do NOT write to any files. Do NOT reference file paths. Just output the report content.

{{language}}
{{style}}
{{interests}}

## Writing Requirements

- Write in clear, professional English accessible to a broad audience.
- Provide brief, accessible explanations for technical terms and concepts. Assume readers are professionals interested in tech but not necessarily with deep technical backgrounds.
- Example: Don't just say "RAG"; say "RAG (Retrieval-Augmented Generation, a technique that lets AI look up reference material before answering)"
- First occurrence of a technical concept must be explained; subsequent mentions can use the abbreviation.
- Use active voice and concrete language. Avoid hedging phrases like "it remains to be seen" or "only time will tell."
- Include specific details: numbers, names, dates, and comparisons where available.

## Structure

1. **Opening hook** — 1-2 engaging sentences that frame the day's most significant development
2. **Top stories** — 3-5 stories with concise analysis of why each matters
3. **Trend observation** — A brief takeaway connecting the day's news to a larger pattern
4. **Closing CTA** — End with the channel's call-to-action

## Length Requirements

- Total report: 800-1500 words (~15 minutes podcast audio when converted to script)
- Hot/explosive topics: 40-50% of total length for in-depth, vivid analysis
- Other topics: concise, 50-100 words each
- Prefer depth on key topics over breadth of coverage

{{historicalContext}}
{{deepDiveContext}}
