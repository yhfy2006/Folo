import { XMLParser } from "fast-xml-parser"

export interface FetchedEntry {
  guid: string
  title: string
  url: string
  content: string
  description: string
  author: string
  publishedAt: Date | null
}

export interface FetchResult {
  entries: FetchedEntry[]
  feedTitle?: string
  feedDescription?: string
  feedImage?: string
  siteUrl?: string
  etag?: string | null
  lastModified?: string | null
}

export async function fetchFeed(
  feedUrl: string,
  etag?: string | null,
  lastModified?: string | null,
): Promise<FetchResult | null> {
  const headers: Record<string, string> = {
    "User-Agent": "SimpleReader/0.1 (RSS Reader)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  }
  if (etag) headers["If-None-Match"] = etag
  if (lastModified) headers["If-Modified-Since"] = lastModified

  const response = await fetch(feedUrl, {
    headers,
    signal: AbortSignal.timeout(30000),
  })

  if (response.status === 304) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)

  const xml = await response.text()
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
  })

  const parsed = parser.parse(xml)

  const newEtag = response.headers.get("etag")
  const newLastModified = response.headers.get("last-modified")

  // Detect RSS 2.0 vs Atom
  if (parsed.rss) {
    return parseRSS(parsed.rss, newEtag, newLastModified)
  } else if (parsed.feed) {
    return parseAtom(parsed.feed, newEtag, newLastModified)
  } else if (parsed["rdf:RDF"]) {
    return parseRDF(parsed["rdf:RDF"], newEtag, newLastModified)
  }

  throw new Error("Unknown feed format")
}

function parseRSS(rss: any, etag: string | null, lastModified: string | null): FetchResult {
  const { channel } = rss
  const items = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : []

  return {
    feedTitle: channel?.title,
    feedDescription: channel?.description,
    feedImage: channel?.image?.url,
    siteUrl: channel?.link,
    etag,
    lastModified,
    entries: items.map((item: any) => ({
      guid: item.guid?.["#text"] || item.guid || item.link || "",
      title: item.title || "",
      url: item.link || "",
      content: item["content:encoded"] || item.description || "",
      description: item.description || "",
      author: item.author || item["dc:creator"] || "",
      publishedAt: parseDate(item.pubDate || item["dc:date"]),
    })),
  }
}

function parseAtom(feed: any, etag: string | null, lastModified: string | null): FetchResult {
  const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : []

  const feedLink = Array.isArray(feed.link)
    ? feed.link.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"])
    : feed.link

  return {
    feedTitle: feed.title?.["#text"] || feed.title,
    feedDescription: feed.subtitle?.["#text"] || feed.subtitle,
    feedImage: feed.icon || feed.logo,
    siteUrl: feedLink?.["@_href"] || feedLink,
    etag,
    lastModified,
    entries: entries.map((entry: any) => {
      const entryLink = Array.isArray(entry.link)
        ? entry.link.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"])
        : entry.link

      return {
        guid: entry.id || entryLink?.["@_href"] || "",
        title: entry.title?.["#text"] || entry.title || "",
        url: entryLink?.["@_href"] || entryLink || "",
        content:
          entry.content?.["#text"] ||
          entry.content ||
          entry.summary?.["#text"] ||
          entry.summary ||
          "",
        description: entry.summary?.["#text"] || entry.summary || "",
        author: entry.author?.name || "",
        publishedAt: parseDate(entry.published || entry.updated),
      }
    }),
  }
}

function parseRDF(rdf: any, etag: string | null, lastModified: string | null): FetchResult {
  const { channel } = rdf
  const items = rdf.item ? (Array.isArray(rdf.item) ? rdf.item : [rdf.item]) : []

  return {
    feedTitle: channel?.title,
    feedDescription: channel?.description,
    siteUrl: channel?.link,
    etag,
    lastModified,
    entries: items.map((item: any) => ({
      guid: item.link || "",
      title: item.title || "",
      url: item.link || "",
      content: item["content:encoded"] || item.description || "",
      description: item.description || "",
      author: item["dc:creator"] || "",
      publishedAt: parseDate(item["dc:date"] || item.pubDate),
    })),
  }
}

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? null : d
}
