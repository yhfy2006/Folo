# Design: Discover Stage (Topic Heat Detection)

**Date:** 2026-04-06
**Status:** Approved
**Scope:** New pipeline stage between reflect and report for detecting trending topics

## Overview

Add a `discover` stage that analyzes RSS entries for heat signals (multi-source overlap and recency) and passes weighted scores to the screening step in the report stage. No extra LLM calls — heat signals are computed algorithmically and injected as context for the existing screening Claude call.

Inspired by Michele Torti's "Outlier Videos" approach — using a multiplier formula to detect content that overperforms its baseline.

## Stage Definition

**Position:** reflect → **discover** → report

**Properties:**

- Fatal: No (if discover fails, screening works as before without heat signals)
- Context input: `date`, `groupId`, `channel`
- Context output: `discoverySignals` (array of DiscoverySignal)

```typescript
export const discoverStage: StageDefinition = {
  name: "discover",
  label: "Discover Trending Topics",
  shouldRun: (ctx) => !!ctx.channel,
  run: async (ctx, callbacks) => {
    const entries = queryTodayEntries(ctx.groupId, ctx.date)
    const signals = computeHeatSignals(entries, ctx.date)
    return { ...ctx, discoverySignals: signals }
  },
}
```

## Data Structures

```typescript
interface DiscoverySignal {
  entryId: string
  title: string
  heatScore: number // 0-10 composite score
  signals: {
    sourceOverlap: number // 0-10: multi-source coverage
    recency: number // 0-10: freshness
  }
  overlappingSources: string[] // which sources covered same topic
}
```

## Heat Signal Computation

### 1. Source Overlap (weight: 70%)

Same topic reported by multiple RSS sources indicates a real trend.

**Algorithm:**

1. Tokenize each entry title into words (split on whitespace/punctuation, lowercase)
2. Pairwise Jaccard similarity on word sets; similarity ≥ 0.3 → same topic cluster
3. Cluster size → score: 1 source = 0, 2 sources = 4, 3 sources = 7, 4+ sources = 10

Simple word-level Jaccard, no stop words or NLP needed. Good enough for clustering — it's a ranking signal, not a classification.

### 2. Recency (weight: 30%)

Fresher content is more likely trending.

**Algorithm:**

- Delta = pipeline run time − entry publish time
- < 6 hours = 10, 6-12 hours = 7, 12-24 hours = 4, > 24 hours = 2

### Composite Score

```
heatScore = sourceOverlap * 0.7 + recency * 0.3
```

All entries in the same topic cluster share the same sourceOverlap score. `overlappingSources` lists all contributing sources.

## Integration with Screening

### Injection Format

Entries with heatScore ≥ 5 get a heat annotation in the screening prompt:

```
[3] Title: OpenAI Releases GPT-5
    Source: TechCrunch
    Summary: ...
    🔥 Heat: 8.5/10 (4 sources: TechCrunch, The Verge, Ars Technica, 36kr)

[4] Title: Rust 1.80 Released
    Source: Rust Blog
    Summary: ...
    (no significant heat signal)
```

### Screening Prompt Addition

```
## Topic Heat Reference
Some entries are annotated with heat scores (🔥), indicating the topic was
reported by multiple sources simultaneously.
Heat scores are reference signals only, not the sole criterion. Consider:
- Heat signal (multi-source verified topics are more likely real trends)
- Audience relevance (high heat but irrelevant topics should be deprioritized)
- Content diversity (avoid selecting only high-heat topics; keep some niche variety)
```

### Report Stage Changes

In `stages/report.ts`, when building `promptOverrides`:

```typescript
if (ctx.discoverySignals?.length) {
  promptOverrides.screeningExtra = formatDiscoverySignals(ctx.discoverySignals)
}
```

**`formatDiscoverySignals()`:**

- Sort signals by heatScore descending
- Only include entries with heatScore ≥ 5
- Output: map of entry index → heat description string

### Graceful Degradation

If `ctx.discoverySignals` is undefined or empty (discover stage failed or was skipped), screening works exactly as before — no heat annotations, no prompt additions.

## Pipeline Context Extension

Add to `PipelineContext` interface:

```typescript
interface PipelineContext {
  // ... existing fields ...
  discoverySignals?: DiscoverySignal[]
}
```

Add `'discover'` to `StageName` union type.

## Affected Files

| File                             | Change                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| `types.ts`                       | Add `'discover'` to StageName, add DiscoverySignal interface |
| `context.ts`                     | Add `discoverySignals` to PipelineContext                    |
| `stages/discover.ts`             | New file — discover stage implementation                     |
| `stages/report.ts`               | Inject discovery signals into screening prompt               |
| `orchestrator.ts`                | Register discover stage in stage list                        |
| `ai-report.ts`                   | Accept and format discovery signals in screening prompt      |
| Channel `channel.json` templates | Add `'discover'` to default stages array                     |
