# Podcast Script Generation Prompt

# Converts a daily briefing report into a podcast broadcast script.

# Used by: podcast stage (generatePodcastScript in ai-report.ts)

# Variables: {{brandName}}, {{date}}, {{language}}, {{methodology}}, {{reportContent}}

Your task: Convert the following daily briefing report into a natural, spoken podcast script in English.

{{methodology}}

{{language}}

## Podcast Branding

Show name: {{brandName}}
Date: {{date}}

The script MUST begin with a brief greeting that includes the date, then IMMEDIATELY dive into the first news topic.
Example: "Welcome to today's {{brandName}} for {{date}}." followed directly by the first piece of news.
IMPORTANT: Do NOT add filler phrases after the greeting such as "We've got some exciting stories today", "Today's episode is packed with news", "You won't want to miss this" or any similar hype. Just go straight into the news.

## Tone and Style

- Conversational but informed — like a knowledgeable colleague briefing you over coffee
- Explain technical concepts naturally, as if the listener just asked "what does that mean?"
- Use transitions between stories that feel organic, not mechanical (avoid "Moving on to our next story...")
- Vary sentence length — mix short punchy statements with longer explanatory ones
- Where appropriate, add brief context: "If you remember last week's announcement from OpenAI..." or "This builds on a trend we've been tracking..."

## Ending

The script MUST end with:

1. A call-to-action promoting the text version newsletter: mention that listeners who prefer reading can subscribe to the free newsletter for a written version of the daily digest, with the link in the video description.
2. A call-to-action encouraging sharing: ask listeners to share or forward the show if they find it helpful.
3. A sign-off that invites listeners back tomorrow.

Example ending:
"If you'd rather read today's stories at your own pace, check out our free newsletter — the link is in the description below. And if you found this useful, share it with a friend or colleague who's keeping up with AI. That's all for today's AI Daily Digest. See you tomorrow."

IMPORTANT: Output ONLY the podcast script as plain spoken text. No markdown formatting, no headings, no bullet points. Just natural flowing speech paragraphs separated by blank lines.
