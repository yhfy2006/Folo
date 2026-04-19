# Design: Channel Context System + Reflect Enhancement

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Channel context directory, prompt loader extension, reflect stage enhancement

## Overview

Extend the channel system with a `context/` directory that provides per-channel audience profile, content style, and guidelines. Enhance the reflect stage to auto-update context files based on YouTube performance data, forming a closed feedback loop.

Inspired by Michele Torti's "Foundation Files" approach — persistent context files that give every pipeline stage consistent knowledge about audience, style, and brand.

## Directory Structure

Each channel gains one new directory:

```
channels/zh-ai-daily/
  channel.json          # existing
  prompts/              # existing
  context/              # NEW — channel-level context
    audience.md         # audience profile (reflect owns this file)
    style.md            # content style (reflect owns this file)
    guidelines.md       # content rules (user owns this file, reflect never touches)
```

### File Ownership

| File                    | Writer       | Reader                         |
| ----------------------- | ------------ | ------------------------------ |
| `context/audience.md`   | reflect only | report, podcast, shorts stages |
| `context/style.md`      | reflect only | report, podcast, shorts stages |
| `context/guidelines.md` | user only    | all content generation stages  |

Clean separation: reflect owns `audience.md` and `style.md` (full overwrite each run). User owns `guidelines.md` (reflect never reads or writes it). No marker mechanism needed.

## Prompt Loader Extension

### New Function in `prompt-loader.ts`

**`loadChannelContext(channel: Channel): string`**

1. Resolve `context/` directory relative to the channel directory (hardcoded path, no config field)
2. Read all `.md` files in the directory
3. Wrap each in `<context name="filename">...</context>` tags
4. Return empty string if directory missing/empty

### Injection Order

All content-generating stages inject context in this order:

```
channelContext → stage prompt → skills
```

Rationale: context (who you are) → prompt (task instructions) → skills (strategy advice)

### Injection Points

```
screening prompt = channelContext + loadPrompt(channel, "screening") + skills
report prompt    = channelContext + loadPrompt(channel, "report") + skills
podcast prompt   = channelContext + loadPrompt(channel, "podcast") + skills
shorts prompt    = channelContext + loadPrompt(channel, "shorts") + skills
```

## Reflect Stage Enhancement

### Current Behavior

- Fetch YouTube videos (last 50) → analyze performance → write `content-strategy.md`

### Enhanced Behavior

- Fetch YouTube videos (last 50) → analyze performance → write 3 files:
  1. `skills/content-strategy.md` (existing, unchanged)
  2. `channel/context/audience.md` (full overwrite)
  3. `channel/context/style.md` (full overwrite)

### Input to Reflect

- YouTube video data (views, likes, comments count)
- `report_topics` from last 30 days

### Claude Output Format

Single LLM call, JSON output with 3 fields:

```json
{
  "contentStrategy": "...markdown...",
  "audienceInsights": "...markdown...",
  "styleInsights": "...markdown..."
}
```

Reflect writes `contentStrategy` to skills dir, `audienceInsights` to `context/audience.md`, `styleInsights` to `context/style.md`. Simple `writeFileSync`, no parsing.

### Reflect Prompt Additions

Two new output requirements added to reflect prompt:

**Audience insights (→ audience.md):**

- Recent topic performance (popular vs unpopular)
- Audience comment high-frequency themes
- Content duration preferences (from completion data)
- Update timestamp

**Style insights (→ style.md):**

- Best-performing title patterns
- Best-performing content structures (news vs deep-dive vs tutorial)
- Tone suggestions based on high-engagement videos
- Update timestamp

### Channel Requirement

Reflect requires `ctx.channel` to exist. No backward compatibility — pipeline must bind a channel.

## Channel Initialization

### Template Files

`channel-init.ts` copies these templates when creating a new channel:

**`context/audience.md`:**

```markdown
# Audience Profile

No data yet. Will be generated after first reflect run.
```

**`context/style.md`:**

```markdown
# Content Style

No data yet. Will be generated after first reflect run.
```

**`context/guidelines.md`:**

```markdown
# Content Guidelines

## Prohibited

- (list content types or terms to avoid)

## Required Elements

- (list elements every episode must include)

## Format Requirements

- (list hard format constraints)
```

## Affected Files

| File                    | Change                                        |
| ----------------------- | --------------------------------------------- |
| `prompt-loader.ts`      | Add `loadChannelContext()`                    |
| `stages/reflect.ts`     | Enhanced output (3 files), simple file writes |
| `stages/report.ts`      | Inject context into prompt building           |
| `stages/podcast.ts`     | Inject context                                |
| `stages/shorts.ts`      | Inject context                                |
| `channel-init.ts`       | Copy context templates                        |
| `workspace/channels/*/` | Add template files                            |
