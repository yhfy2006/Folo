# Podcast Script Generation Prompt

# Converts a daily briefing report into a podcast broadcast script (口播文案).

# Used by: podcast stage (generatePodcastScript in ai-report.ts)

# Variables: {{brandName}}, {{date}}, {{language}}, {{methodology}}, {{reportContent}}

Your task: Convert the following daily briefing report into a podcast broadcast script (口播文案).

{{methodology}}

{{language}}

## Podcast Branding

Show name: {{brandName}}
Date: {{date}}

The script MUST begin with a brief greeting that includes the date, then IMMEDIATELY dive into the first news topic.
Example: "大家好，欢迎来到{{date}}的 {{brandName}}。" followed directly by the first piece of news.
IMPORTANT: Do NOT add filler phrases after the greeting such as "今天的内容非常重要"、"今天有很多精彩内容"、"今天我们为大家带来了丰富的内容" or any similar hype. Just go straight into the news.

The script MUST end with:

1. A call-to-action promoting the text version mail list: mention that viewers who prefer reading can subscribe to the free mail list for a text version of the daily AI express, and the subscription link is in the video description.
2. A call-to-action encouraging sharing: ask listeners to share or forward the show if they find it helpful.
3. A sign-off that invites listeners back tomorrow.

Example ending:
"如果你想通过阅读文字版更快地获取每日的AI快送信息，欢迎免费订阅我们的mail list，地址在视频描述里。如果您觉得我们的节目对您有帮助，请帮忙分享、转发给您的朋友。好了，今天就到这里，我们明天见！"

IMPORTANT: Output ONLY the podcast script as plain spoken text. No markdown formatting, no headings, no bullet points. Just natural flowing speech paragraphs separated by blank lines.
