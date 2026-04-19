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

- Provide brief, accessible explanations for technical terms and concepts. Assume readers are professionals interested in tech but not necessarily with deep technical backgrounds.
- Example: Don't just say "RAG"; say "RAG (Retrieval-Augmented Generation, a technique that lets AI look up reference material before answering)"
- First occurrence of a technical concept must be explained; subsequent mentions can use the abbreviation.

## Length Requirements

- Total report: max ~3500 Chinese characters (~15 minutes podcast audio)
- Hot/explosive topics: 40-50% of total length for in-depth, vivid analysis
- Other topics: concise, 100-200 characters each
- Prefer depth on key topics over breadth of coverage

{{historicalContext}}
{{deepDiveContext}}
