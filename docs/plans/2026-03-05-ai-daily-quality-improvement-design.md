# AI快送 Quality Improvement Design

Date: 2026-03-05
Status: Approved

## Goals

1. **Cross-report topic continuity** - Link current topics to previously discussed ones across reports ("we mentioned X last time, now Y has new developments")
2. **Audience-friendly explanations** - Provide accessible explanations for technical concepts so non-technical listeners can follow
3. **Hot topic deep dive** - Claude identifies 1-2 "explosive" topics per report and does deeper research for richer, more vivid coverage
4. **Length control** - Total report length capped at ~3500 Chinese characters (~15 minutes of podcast audio)
5. **Smart history window** - Dynamically decide how far back to look based on topic relevance

## Phased Approach

- **Phase 1 (this implementation)**: Topic Digest + keyword matching for cross-report continuity
- **Phase 2 (future)**: Upgrade to embedding-based semantic search for more precise topic matching

## Data Model

### New `report_topics` table

```sql
CREATE TABLE IF NOT EXISTS report_topics (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id),
  group_id TEXT,
  topics_json TEXT NOT NULL,  -- JSON array of topic objects
  digest TEXT NOT NULL,       -- ~200 char overall summary
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_report_topics_group ON report_topics(group_id);
CREATE INDEX IF NOT EXISTS idx_report_topics_created ON report_topics(created_at);
```

**`topics_json` structure:**

```json
[
  {
    "name": "OpenAI o3 reasoning model",
    "keywords": ["openai", "o3", "reasoning"],
    "summary": "OpenAI released the o3 reasoning model with strong math and coding benchmarks"
  }
]
```

Phase 2 extension: add `embedding BLOB` field per topic for semantic search.

## Report Generation Flow (Revised)

```
Stage 1: Screening (enhanced)
  Input:  Recent entries (titles + descriptions, max 500)
  Output: Selected entry indices + 1-2 hot_topics with reasons
  Change: Screening JSON format now includes hot_topics field

Stage 2: Deep Read (existing)
  Input:  Selected entries
  Output: Enriched entries with full article content

Stage 2.5: Historical Topic Retrieval (new)
  Input:  Current entries + report_topics table
  Output: Relevant historical topics for context injection
  Logic:  Keyword matching with smart lookback (7 recent, up to 30 for matched topics)

Stage 2.7: Hot Topic Deep Dive (new)
  Input:  1-2 hot topic entries identified in Stage 1
  Output: Extended research content for hot topics
  Method: Claude with multi-turn (--max-turns 5) for web search / extended analysis

Stage 3: Report Generation (enhanced)
  Input:  Enriched entries + historical context + deep dive results
  Output: Markdown report (max ~3500 chars)
  Changes:
    - Historical context section in prompt
    - Audience-friendly writing instructions
    - Length constraint (~3500 chars / 15 min audio)
    - Hot topics get 40-50% of total length

Stage 3.5: Topic Extraction (new, async)
  Input:  Generated report content
  Output: Topic digest saved to report_topics table
  Method: Single Claude call, non-blocking
```

## Screening Enhancement

### Updated screening response format

```json
{
  "selected": [0, 3, 5, 8, 12, 15, ...],
  "hot_topics": [
    { "index": 3, "reason": "First industry release of..." }
  ]
}
```

The screening prompt will be updated to:

- Ask Claude to identify 1-2 "explosive" or groundbreaking topics
- Provide clear criteria: first-of-its-kind, major company announcements, paradigm shifts, controversial decisions

## Historical Topic Retrieval Logic

```typescript
function findRelevantTopics(currentEntries: EnrichedEntry[], groupId?: string): HistoricalTopic[] {
  // 1. Extract keywords from current article titles
  const currentKeywords = extractKeywords(currentEntries)

  // 2. Query last 7 reports' topic digests (default window)
  const recentTopics = queryRecentTopics(7, groupId)

  // 3. Keyword overlap matching
  const matched = recentTopics.filter((topic) => hasKeywordOverlap(topic.keywords, currentKeywords))

  // 4. For high-match topics, look back further (up to 30 reports)
  if (matched.length > 0) {
    const deepTopics = queryDeepTopics(matched, 30, groupId)
    return dedup([...matched, ...deepTopics])
  }

  return matched
}
```

## Prompt Enhancements

### Historical context injection (in buildReportPrompt)

```
## Historical Topic Context

The following topics were discussed in previous reports. If current articles
continue or relate to these topics, naturally reference the connection
(e.g., "Previously we reported...", "This is the latest development in...").
Only reference when genuinely relevant; do not force connections.

- [Mar 1] OpenAI o3: OpenAI released the o3 reasoning model...
- [Feb 25] EU AI Act: The EU AI Act entered enforcement phase...
```

### Audience-friendly writing instructions

```
## Writing Requirements

- Provide brief, accessible explanations for technical terms and concepts.
  Assume readers are professionals interested in tech but not necessarily
  with deep technical backgrounds.
- Example: Don't just say "RAG"; say "RAG (Retrieval-Augmented Generation,
  a technique that lets AI look up reference material before answering)"
- First occurrence of a technical concept must be explained;
  subsequent mentions can use the abbreviation.
```

### Length constraint

```
## Length Requirements

- Total report: max ~3500 Chinese characters (~15 minutes podcast audio)
- Hot/explosive topics: 40-50% of total length for in-depth, vivid analysis
- Other topics: concise, 100-200 characters each
- Prefer depth on key topics over breadth of coverage
```

## Hot Topic Deep Dive

For entries marked as `hot_topics` by screening:

1. Build a focused research prompt with the article content
2. Run Claude with `--max-turns 5` (allowing multi-turn research)
3. Collect the deep dive analysis
4. Inject as supplementary material in the report generation prompt

```
## Deep Dive Research Results

The following in-depth research was conducted on today's key topics.
Use this material to provide richer, more vivid coverage in the report.

### [Topic Name]
[Deep dive content from Claude multi-turn research]
```

## Topic Extraction (Post-generation)

After report is saved, async Claude call:

```
Extract the main topics from the following report. For each topic:
- name: short name (max 10 chars)
- keywords: related keywords array (lowercase, 3-8 items)
- summary: one-sentence summary (30-50 chars)

Also generate an overall digest (100-200 chars) summarizing this report.

Output strict JSON:
{
  "topics": [...],
  "digest": "..."
}
```

- Truncate report to first 5000 chars (sufficient for topic coverage)
- Async execution, does not block report display
- Graceful failure: if extraction fails, report is still valid

## Files to Modify

| File                                   | Change                                             |
| -------------------------------------- | -------------------------------------------------- |
| `apps/simple-reader/main/database.ts`  | Add `report_topics` table                          |
| `apps/simple-reader/main/ai-report.ts` | Add stages 2.5, 2.7, 3.5; enhance prompts          |
| `.claude/skills/` (workspace)          | Update screening/daily-report skills if they exist |

## Phase 2 Upgrade Path (Embedding Search)

Not implemented in Phase 1, but design accommodates:

1. Add `embedding BLOB` column to `report_topics`
2. Generate embeddings per topic summary (via Claude embedding API or local model)
3. Replace keyword matching with cosine similarity search
4. Consider sqlite-vec extension or in-memory vector computation
5. Keyword matching covers ~80% of cases; semantic search adds precision for edge cases
