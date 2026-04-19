# Extract Prompt Construction

The extract stage takes the full SRT and asks Claude to identify the most compelling moments for Shorts. This is the hardest AI stage — a bad extract means the rest of the pipeline produces a bad video no matter how well the remaining stages execute.

## How to construct the prompt

Read the base prompt from `<channel>/prompts/extract.md`. It contains `{{viralScoreThreshold}}`, `{{maxClips}}`, `{{targetDuration}}` placeholders — substitute them from `channel.json`'s `signalist` config block. Then append the SRT.

For very long interviews (>2 hours), the SRT can exceed Claude's comfortable context window. In that case, send only the first 60-90 minutes — the strongest material is usually front-loaded since interviewers open with the biggest hooks.

## Calling Claude

```bash
/Users/yhfy2006/.local/bin/claude --print --model sonnet -p "$(cat extract-prompt.txt)"
```

Important: the `claude` binary path varies across machines. Prefer `~/.local/bin/claude` which points to the versioned install. The `$HOME/.superset/bin/claude` wrapper exists too but has sometimes returned empty output under automated invocation.

## Expected output

A JSON array, e.g.:

```json
[
  {
    "id": 1,
    "start_time": "00:04:20,160",
    "end_time": "00:05:24,840",
    "topic": "Chernobyl Best Case",
    "transcript": "He sees two possibilities...",
    "viral_score": 9,
    "reason": "Leading AI CEO privately told Russell that mass-casualty catastrophe is the *best* outcome..."
  }
]
```

## What to do with the output

1. Parse the JSON (use `re.search(r'\[[\s\S]*\]', response)` to extract even if Claude wraps it in markdown fences).
2. Filter `viral_score >= viralScoreThreshold`.
3. Truncate to `maxClips` entries.
4. Save as `<work_dir>/clips.json`.
5. If the filtered list is empty, stop the whole pipeline — the interview didn't meet the bar. Don't force lower-quality content.

## Sanity checking

Before moving on, verify each clip's duration is 30-70 seconds. Anything shorter won't have room for commentary cards; anything longer should be split into two clips by the AI (re-prompt if needed).

Also verify `start_time` < `end_time` and both are within the source video's duration.

## When to re-run

If the first extract returns nothing compelling, try widening the SRT window (include more of the interview) before giving up. Some interviews save the best content for the last 20 minutes.
