# Discover Stage (Topic Heat Detection) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `discover` pipeline stage that detects trending topics via multi-source overlap and recency signals, passing heat scores to the screening step.

**Architecture:** New `stages/discover.ts` queries today's RSS entries, computes Jaccard similarity on titles to cluster related entries, scores by cluster size and recency. Scores are stored in `PipelineContext.discoverySignals` and injected into the screening prompt by `ai-report.ts`.

**Tech Stack:** Node.js, TypeScript, existing Pipeline/Database infrastructure

---

### Task 1: Add types — StageName and DiscoverySignal

**Files:**

- Modify: `apps/simple-reader/main/pipeline/types.ts`
- Modify: `apps/simple-reader/main/pipeline/context.ts`

- [ ] **Step 1: Add 'discover' to StageName union**

In `types.ts`, add `"discover"` after `"reflect"` in the StageName type:

```typescript
export type StageName =
  | "verify"
  | "reflect"
  | "discover"
  | "report"
  | "podcast"
  | "audio"
  | "upload"
  | "publish"
  | "video"
  | "youtube"
  | "shorts"
```

- [ ] **Step 2: Add DiscoverySignal interface to types.ts**

Add at the end of `types.ts`:

```typescript
export interface DiscoverySignal {
  entryId: string
  title: string
  heatScore: number
  signals: {
    sourceOverlap: number
    recency: number
  }
  overlappingSources: string[]
}
```

- [ ] **Step 3: Add discoverySignals to PipelineContext**

In `context.ts`, add after the `youtubeInsights` field (line 20):

```typescript
  // Pre-stage: discovery signals
  discoverySignals?: DiscoverySignal[]
```

And add import at top of `context.ts`:

```typescript
import type { DiscoverySignal } from "./types"
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline/types.ts apps/simple-reader/main/pipeline/context.ts
git commit -m "feat(pipeline): add discover StageName and DiscoverySignal types"
```

---

### Task 2: Implement discover stage

**Files:**

- Create: `apps/simple-reader/main/pipeline/stages/discover.ts`

- [ ] **Step 1: Create the discover stage file**

```typescript
import type { EntryWithFeed } from "../../database"
import { queryAll } from "../../database"
import type { PipelineContext } from "../context"
import type { DiscoverySignal, StageCallbacks, StageDefinition } from "../types"

/**
 * Tokenize a title into lowercase words, stripping punctuation.
 */
function tokenize(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
  return new Set(words)
}

/**
 * Jaccard similarity between two word sets.
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let intersection = 0
  for (const word of a) {
    if (b.has(word)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

interface EntryWithTokens {
  entry: EntryWithFeed
  tokens: Set<string>
  clusterId: number
}

/**
 * Cluster entries by title similarity using Jaccard >= 0.3.
 * Returns cluster assignments via union-find.
 */
function clusterEntries(entries: EntryWithFeed[]): Map<number, EntryWithTokens[]> {
  const items: EntryWithTokens[] = entries.map((entry, i) => ({
    entry,
    tokens: tokenize(entry.title || ""),
    clusterId: i,
  }))

  // Union-find: merge clusters when Jaccard >= 0.3
  const parent = items.map((_, i) => i)
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]
      x = parent[x]
    }
    return x
  }
  function union(a: number, b: number): void {
    parent[find(a)] = find(b)
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (jaccard(items[i].tokens, items[j].tokens) >= 0.3) {
        union(i, j)
      }
    }
  }

  // Group by root
  const clusters = new Map<number, EntryWithTokens[]>()
  for (let i = 0; i < items.length; i++) {
    const root = find(i)
    if (!clusters.has(root)) {
      clusters.set(root, [])
    }
    clusters.get(root)!.push(items[i])
  }

  return clusters
}

/**
 * Score source overlap: how many distinct sources in the cluster.
 */
function scoreSourceOverlap(clusterSize: number): number {
  if (clusterSize >= 4) return 10
  if (clusterSize >= 3) return 7
  if (clusterSize >= 2) return 4
  return 0
}

/**
 * Score recency: hours since publication.
 */
function scoreRecency(publishedAt: number, now: number): number {
  const hoursAgo = (now - publishedAt) / 3600
  if (hoursAgo < 6) return 10
  if (hoursAgo < 12) return 7
  if (hoursAgo < 24) return 4
  return 2
}

/**
 * Compute heat signals for today's entries.
 */
function computeHeatSignals(entries: EntryWithFeed[], now: number): DiscoverySignal[] {
  const clusters = clusterEntries(entries)
  const signals: DiscoverySignal[] = []

  for (const members of clusters.values()) {
    const clusterSize = members.length
    const sourceOverlap = scoreSourceOverlap(clusterSize)
    const sources = [...new Set(members.map((m) => m.entry.feed_title || "Unknown"))]

    for (const member of members) {
      const publishedAt = member.entry.published_at || member.entry.created_at || 0
      const recency = scoreRecency(publishedAt, now)
      const heatScore = sourceOverlap * 0.7 + recency * 0.3

      signals.push({
        entryId: member.entry.id,
        title: member.entry.title || "Untitled",
        heatScore: Math.round(heatScore * 10) / 10,
        signals: { sourceOverlap, recency },
        overlappingSources: sources,
      })
    }
  }

  return signals.sort((a, b) => b.heatScore - a.heatScore)
}

export const discoverStage: StageDefinition = {
  name: "discover",
  label: "Discover Trending Topics",
  shouldRun: (ctx: PipelineContext) => !!ctx.channel,
  run: async (ctx: PipelineContext, callbacks: StageCallbacks): Promise<PipelineContext> => {
    callbacks.onStatus("Scanning for trending topics...")

    // Query today's entries for this group
    const timeRange = ctx.prefs.timeRange || 24
    const cutoff = Math.floor(Date.now() / 1000) - timeRange * 3600
    const entries = queryAll<EntryWithFeed>(
      ctx.groupId
        ? `SELECT e.*, f.title as feed_title
           FROM entries e
           JOIN feeds f ON e.feed_id = f.id
           JOIN feed_group_feeds fgf ON f.id = fgf.feed_id
           WHERE fgf.group_id = ? AND e.created_at > ?
           ORDER BY e.created_at DESC`
        : `SELECT e.*, f.title as feed_title
           FROM entries e
           JOIN feeds f ON e.feed_id = f.id
           WHERE e.created_at > ?
           ORDER BY e.created_at DESC`,
      ctx.groupId ? [ctx.groupId, cutoff] : [cutoff],
    )

    if (entries.length === 0) {
      callbacks.onStatus("No entries to analyze")
      return ctx
    }

    const now = Math.floor(Date.now() / 1000)
    const signals = computeHeatSignals(entries, now)
    const hotCount = signals.filter((s) => s.heatScore >= 5).length

    callbacks.onStatus(`Found ${hotCount} trending topics from ${entries.length} entries`)

    return { ...ctx, discoverySignals: signals }
  },
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/simple-reader/main/pipeline/stages/discover.ts
git commit -m "feat(pipeline): implement discover stage with Jaccard-based topic clustering"
```

---

### Task 3: Register discover stage in orchestrator

**Files:**

- Modify: `apps/simple-reader/main/pipeline/orchestrator.ts`

- [ ] **Step 1: Import discover stage**

Add after the `reflectStage` import (line 12):

```typescript
import { discoverStage } from "./stages/discover"
```

- [ ] **Step 2: Add to ALL_STAGES array**

In the `ALL_STAGES` array (line 36-47), add `discoverStage` after `reflectStage`:

```typescript
const ALL_STAGES: StageDefinition[] = [
  verifyStage,
  reflectStage,
  discoverStage,
  reportStage,
  podcastStage,
  audioStage,
  uploadStage,
  publishStage,
  videoStage,
  youtubeStage,
  shortsStage,
]
```

- [ ] **Step 3: Add 'discover' to nonFatal list**

In `executePipeline()` (line 114), add `"discover"` to the non-fatal stages:

```typescript
const nonFatal: StageName[] = ["reflect", "discover", "video", "youtube", "shorts"]
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/simple-reader/main/pipeline/orchestrator.ts
git commit -m "feat(pipeline): register discover stage in orchestrator"
```

---

### Task 4: Inject discovery signals into screening prompt

**Files:**

- Modify: `apps/simple-reader/main/ai-report.ts`
- Modify: `apps/simple-reader/main/pipeline/stages/report.ts`

- [ ] **Step 1: Add `formatDiscoverySignals` function to ai-report.ts**

Add after the `buildScreeningPrompt` function (after line 285):

```typescript
/**
 * Format discovery signals as heat annotations for the screening prompt.
 * Only includes entries with heatScore >= 5.
 */
export function formatDiscoverySignals(
  signals: DiscoverySignal[],
  entries: EntryWithFeed[],
): string {
  // Build entryId → signal lookup
  const signalMap = new Map(signals.filter((s) => s.heatScore >= 5).map((s) => [s.entryId, s]))

  if (signalMap.size === 0) return ""

  // Build index → annotation mapping
  const annotations: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const signal = signalMap.get(entries[i].id)
    if (signal) {
      const sources = signal.overlappingSources.join(", ")
      annotations.push(
        `[${i}] 🔥 Heat: ${signal.heatScore}/10 (${signal.overlappingSources.length} sources: ${sources})`,
      )
    }
  }

  if (annotations.length === 0) return ""

  return `\n## Topic Heat Reference
Some entries are annotated with heat scores (🔥), indicating the topic was
reported by multiple sources simultaneously.
Heat scores are reference signals only, not the sole criterion. Consider:
- Heat signal (multi-source verified topics are more likely real trends)
- Audience relevance (high heat but irrelevant topics should be deprioritized)
- Content diversity (avoid selecting only high-heat topics; keep some niche variety)

${annotations.join("\n")}\n`
}
```

Add the import at top of `ai-report.ts`:

```typescript
import type { DiscoverySignal } from "./pipeline/types"
```

- [ ] **Step 2: Expand `promptOverrides` type to include `screeningExtra`**

In `generateReport()` (line 44), change the `promptOverrides` parameter type:

```typescript
  promptOverrides?: { screeningPrompt?: string; reportPrompt?: string; screeningExtra?: string },
```

Do the same for `generateReportToString()` (line 920):

```typescript
  promptOverrides?: { screeningPrompt?: string; reportPrompt?: string; screeningExtra?: string },
```

- [ ] **Step 3: Inject screeningExtra into the screening prompt**

In `generateReport()`, after the screening prompt is resolved (line 116-117), append the extra:

```typescript
const baseScreeningPrompt =
  promptOverrides?.screeningPrompt ||
  buildScreeningPrompt(entriesToScreen, effectivePrefs, youtubeInsights)
const screeningPrompt = promptOverrides?.screeningExtra
  ? baseScreeningPrompt + promptOverrides.screeningExtra
  : baseScreeningPrompt
```

Replace the existing lines 115-117 with this.

- [ ] **Step 4: Pass discovery signals from report stage**

In `stages/report.ts`, add import:

```typescript
import {
  formatDiscoverySignals,
  generateReportToString,
  generateSeoDescription,
} from "../../ai-report"
import type { DiscoverySignal } from "../types"
```

(Replace the existing ai-report import)

In the prompt overrides section, after building `promptOverrides`, add the discovery signal injection. Replace the full `if (ctx.channel)` block with:

```typescript
let promptOverrides:
  | { screeningPrompt?: string; reportPrompt?: string; screeningExtra?: string }
  | undefined
if (ctx.channel) {
  try {
    const channelContext = loadChannelContext(ctx.channel)
    const contextPrefix = channelContext ? `${channelContext}\n\n` : ""
    const screeningPrompt =
      contextPrefix + loadPrompt(ctx.channel, "screening.md", { date: ctx.date })
    const reportPrompt = contextPrefix + loadPrompt(ctx.channel, "report.md", { date: ctx.date })
    promptOverrides = { screeningPrompt, reportPrompt }
    console.info("[report] Using channel prompt overrides (with context)")
  } catch (err) {
    console.info("[report] Channel prompt not found, using defaults:", err)
  }
}

// Inject discovery signals into screening prompt
if (ctx.discoverySignals?.length && promptOverrides) {
  // We need the entries list to map signals to indices — formatDiscoverySignals handles this
  // The signals are appended as extra context to the screening prompt
  const hotSignals = ctx.discoverySignals.filter((s) => s.heatScore >= 5)
  if (hotSignals.length > 0) {
    const annotations = hotSignals
      .map(
        (s) =>
          `- "${s.title}" 🔥 ${s.heatScore}/10 (${s.overlappingSources.length} sources: ${s.overlappingSources.join(", ")})`,
      )
      .join("\n")
    promptOverrides.screeningExtra = `\n## Topic Heat Reference
Some topics below were reported by multiple sources simultaneously, indicating trending status.
Heat scores are reference signals only. Prioritize audience relevance over heat.

${annotations}\n`
  }
}
```

Note: This simplifies the injection — instead of mapping by entryId (which requires access to the entries list inside `generateReport`), we provide the signal as a summary section. The screening Claude call can cross-reference topic titles.

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/simple-reader && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/simple-reader/main/ai-report.ts apps/simple-reader/main/pipeline/stages/report.ts
git commit -m "feat(pipeline): inject discovery heat signals into screening prompt"
```

---

### Task 5: Add 'discover' to default channel stages

**Files:**

- Modify: `apps/simple-reader/main/pipeline/channel-loader.ts`
- Modify: `apps/simple-reader/workspace/channels/zh-ai-daily/channel.json`
- Modify: `apps/simple-reader/workspace/channels/en-ai-daily/channel.json`

- [ ] **Step 1: Update ALL_STAGES in channel-loader.ts**

In `channel-loader.ts` (line 11), add `"discover"` after `"reflect"`:

```typescript
const ALL_STAGES: StageName[] = [
  "verify",
  "reflect",
  "discover",
  "report",
  "podcast",
  "audio",
  "upload",
  "publish",
  "video",
  "youtube",
  "shorts",
]
```

- [ ] **Step 2: Update zh-ai-daily channel.json**

Add `"discover"` after `"reflect"` in the `stages` array:

```json
"stages": ["verify", "reflect", "discover", "report", "podcast", "audio", "upload", "publish", "video", "youtube", "shorts"]
```

- [ ] **Step 3: Update en-ai-daily channel.json**

Same change — add `"discover"` after `"reflect"` in the `stages` array.

- [ ] **Step 4: Commit**

```bash
git add apps/simple-reader/main/pipeline/channel-loader.ts apps/simple-reader/workspace/channels/zh-ai-daily/channel.json apps/simple-reader/workspace/channels/en-ai-daily/channel.json
git commit -m "feat(channel): add discover to default stage list"
```

---

### Task 6: Smoke test

- [ ] **Step 1: Run full typecheck**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run typecheck 2>&1 | tail -20`
Expected: No errors in simple-reader files

- [ ] **Step 2: Run lint**

Run: `cd /Users/yhfy2006/.superset/worktrees/Folo/cherry-coin && pnpm run lint:fix 2>&1 | tail -20`
Expected: No lint errors in modified files

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -u
git commit -m "fix: resolve typecheck/lint issues from discover stage feature"
```
