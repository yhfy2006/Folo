import type { EntryWithFeed } from "../../database"
import { queryAll } from "../../database"
import type { PipelineContext } from "../context"
import type { DiscoverySignal, StageCallbacks, StageDefinition } from "../types"

const STOPWORDS = new Set([
  "the",
  "is",
  "at",
  "in",
  "on",
  "of",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "by",
  "with",
  "from",
  "as",
  "its",
  "it",
  "be",
  "was",
  "are",
  "has",
  "have",
  "had",
  "not",
  "but",
  "that",
  "this",
  "will",
  "can",
  "now",
  "new",
  "how",
  "all",
  "into",
  "also",
  "than",
  "more",
  "about",
  "over",
  "just",
  "after",
  "up",
  "out",
  "so",
  "no",
  "do",
  "if",
  "get",
  "got",
  "been",
  "being",
  "available",
  "released",
  "releases",
  "launches",
  "announces",
  "gets",
])

function tokenize(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replaceAll(/[^\w\s\u4e00-\u9fff-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replaceAll(/^-+|-+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
  return new Set(words)
}

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
}

function clusterEntries(entries: EntryWithFeed[]): Map<number, EntryWithTokens[]> {
  const items: EntryWithTokens[] = entries.map((entry) => ({
    entry,
    tokens: tokenize(entry.title || ""),
  }))

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

  const clusters = new Map<number, EntryWithTokens[]>()
  for (const [i, item] of items.entries()) {
    const root = find(i)
    if (!clusters.has(root)) {
      clusters.set(root, [])
    }
    clusters.get(root)!.push(item)
  }

  return clusters
}

function scoreSourceOverlap(clusterSize: number): number {
  if (clusterSize >= 4) return 10
  if (clusterSize >= 3) return 7
  if (clusterSize >= 2) return 4
  return 0
}

function scoreRecency(publishedAt: number, now: number): number {
  const hoursAgo = (now - publishedAt) / 3600
  if (hoursAgo < 6) return 10
  if (hoursAgo < 12) return 7
  if (hoursAgo < 24) return 4
  return 2
}

function computeHeatSignals(entries: EntryWithFeed[], now: number): DiscoverySignal[] {
  const clusters = clusterEntries(entries)
  const signals: DiscoverySignal[] = []

  for (const members of clusters.values()) {
    const clusterSize = members.length
    const sourceOverlap = scoreSourceOverlap(clusterSize)
    const sources = [...new Set(members.map((m) => m.entry.feed_title || "Unknown"))]

    for (const member of members) {
      const publishedAt =
        (member.entry as any).published_at || (member.entry as any).created_at || 0
      const recency = scoreRecency(publishedAt, now)
      const heatScore = Math.round((sourceOverlap * 0.7 + recency * 0.3) * 10) / 10

      signals.push({
        entryId: member.entry.id,
        title: member.entry.title || "Untitled",
        heatScore,
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

    const timeRange = ctx.prefs.timeRange || 24
    const cutoff = Math.floor(Date.now() / 1000) - timeRange * 3600
    const entries = queryAll<EntryWithFeed>(
      ctx.groupId
        ? `SELECT e.*, f.title as feed_title FROM entries e JOIN feeds f ON e.feed_id = f.id JOIN feed_group_feeds fgf ON f.id = fgf.feed_id WHERE fgf.group_id = ? AND e.created_at > ? ORDER BY e.created_at DESC`
        : `SELECT e.*, f.title as feed_title FROM entries e JOIN feeds f ON e.feed_id = f.id WHERE e.created_at > ? ORDER BY e.created_at DESC`,
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
