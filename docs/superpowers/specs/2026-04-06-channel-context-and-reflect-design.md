# Design: Channel Context System + Reflect Enhancement

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Channel context/references directories, prompt loader extension, reflect stage enhancement

## Overview

Extend the channel system with `context/` and `references/` directories that provide per-channel audience profile, content style, guidelines, and reference samples. Enhance the reflect stage to auto-update context files based on YouTube performance data, forming a closed feedback loop.

Inspired by Michele Torti's "Foundation Files" approach — persistent context files that give every pipeline stage consistent knowledge about audience, style, and brand.

## Directory Structure

Each channel gains two new directories:

```
channels/zh-ai-daily/
  channel.json          # existing
  prompts/              # existing
  context/              # NEW — channel-level context
    audience.md         # audience profile (reflect auto-updates)
    style.md            # content style guide (reflect auto-updates)
    guidelines.md       # content rules (manual only)
  references/           # NEW — reference samples
    report-samples/     # high-quality report examples
    podcast-samples/    # podcast script examples
    shorts-samples/     # shorts copy examples
```

### File Ownership

| File                    | Writer                     | Reader                         |
| ----------------------- | -------------------------- | ------------------------------ |
| `context/audience.md`   | reflect auto + user manual | report, podcast, shorts stages |
| `context/style.md`      | reflect auto + user manual | report, podcast, shorts stages |
| `context/guidelines.md` | user manual only           | all content generation stages  |
| `references/*-samples/` | user manual only           | corresponding stage            |

### Auto-Update Marker

Files updated by reflect use `<!-- reflect-auto -->` as a boundary marker:

- Content above the marker: manual, reflect never touches it
- Content below the marker: auto-generated, reflect overwrites each run

```markdown
# Audience Profile

## Core Audience

(user-written content here)

<!-- reflect-auto -->

## Recent Performance Insights

(reflect writes here)
```

## Prompt Loader Extension

### New Functions in `prompt-loader.ts`

**`loadChannelContext(channel: Channel): string`**

1. Scan `channel.contextDir` for all `.md` files
2. Read each file, wrap in `<context name="filename">...</context>` tags
3. Return empty string if directory missing/empty
4. Per-file read limit: 2000 characters

**`loadReferences(channel: Channel, stageName: string): string`**

1. Map stage to directory: `report` → `references/report-samples/`, etc.
2. Read up to 3 `.md` files (sorted by filename)
3. Wrap each in `<reference name="sample-N">...</reference>` tags
4. Return empty string if directory missing/empty
5. Per-file read limit: 3000 characters

### Injection Order

All content-generating stages inject context in this order:

```
channelContext → references → stage prompt → skills
```

Rationale: context (who you are) → references (what good looks like) → prompt (task instructions) → skills (strategy advice)

### Token Budget

- Context files: ~6K chars max (3 files x 2000)
- References: ~9K chars max (3 files x 3000)
- Total injection: ~15K chars, well within prompt window

## Reflect Stage Enhancement

### Current Behavior

- Fetch YouTube videos (last 50) → analyze performance → write `content-strategy.md`

### Enhanced Behavior

- Fetch YouTube videos (last 50) → analyze performance → write 3 files:
  1. `skills/content-strategy.md` (existing, unchanged)
  2. `channel/context/audience.md` (auto section only)
  3. `channel/context/style.md` (auto section only)

### Input to Reflect

- YouTube video data (views, likes, comments count)
- `report_topics` from last 30 days
- Current `audience.md` manual section (above marker)
- Current `style.md` manual section (above marker)

### Claude Output Format

Single LLM call, JSON output with 3 fields:

```json
{
  "contentStrategy": "...markdown...",
  "audienceInsights": "...markdown...",
  "styleInsights": "...markdown..."
}
```

### File Update Mechanism — `updateAutoSection()`

```typescript
function updateAutoSection(filePath: string, autoContent: string): void {
  const MARKER = "<!-- reflect-auto -->"
  const existing = readFileSync(filePath, "utf-8")
  const markerIndex = existing.indexOf(MARKER)

  if (markerIndex >= 0) {
    const manualPart = existing.substring(0, markerIndex + MARKER.length)
    writeFileSync(filePath, manualPart + "\n" + autoContent)
  } else {
    writeFileSync(filePath, existing + "\n\n" + MARKER + "\n" + autoContent)
  }
}
```

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

### `channel.json` Schema Extension

New fields:

```json
{
  "contextDir": "./context",
  "referencesDir": "./references"
}
```

Resolved to absolute paths by `channel-loader.ts`, same as `promptDir`.

### Template Files

`channel-init.ts` copies these templates when creating a new channel:

**`context/audience.md`:**

```markdown
# Audience Profile

## Core Audience

(describe your target audience)

## Language Preferences

(describe audience language style preferences)

<!-- reflect-auto -->

## Recent Performance Insights

No data yet. Will auto-update after first reflect run.
```

**`context/style.md`:**

```markdown
# Content Style

## Report Style

(describe report tone and structure preferences)

## Podcast Style

(describe podcast voice and pacing preferences)

<!-- reflect-auto -->

## Style Insights

No data yet. Will auto-update after first reflect run.
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

**`references/`:** Three empty directories with `.gitkeep`: `report-samples/`, `podcast-samples/`, `shorts-samples/`.

## Affected Files

| File                    | Change                                                                 |
| ----------------------- | ---------------------------------------------------------------------- |
| `prompt-loader.ts`      | Add `loadChannelContext()`, `loadReferences()`                         |
| `stages/reflect.ts`     | Enhanced output (3 files), `updateAutoSection()`                       |
| `stages/report.ts`      | Inject context + references into prompt building                       |
| `stages/podcast.ts`     | Inject context + references                                            |
| `stages/shorts.ts`      | Inject context + references                                            |
| `channel-loader.ts`     | Resolve `contextDir`, `referencesDir`                                  |
| `channel-init.ts`       | Copy context/references templates                                      |
| `context.ts`            | No change (context files loaded at prompt level, not pipeline context) |
| `workspace/channels/*/` | Add template files                                                     |
