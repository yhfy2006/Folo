import { XMLParser } from "fast-xml-parser"

export interface OPMLFeed {
  title: string
  xmlUrl: string
  htmlUrl?: string
  category?: string
}

export function parseOPML(xmlContent: string): OPMLFeed[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  })

  const parsed = parser.parse(xmlContent)
  const feeds: OPMLFeed[] = []

  const body = parsed?.opml?.body
  if (!body) return feeds

  const outlines = Array.isArray(body.outline) ? body.outline : [body.outline]
  for (const outline of outlines) {
    if (outline) {
      extractFeeds(outline, undefined, feeds)
    }
  }

  return feeds
}

function extractFeeds(outline: any, category: string | undefined, feeds: OPMLFeed[]): void {
  if (outline["@_xmlUrl"]) {
    feeds.push({
      title: outline["@_title"] || outline["@_text"] || "Untitled",
      xmlUrl: outline["@_xmlUrl"],
      htmlUrl: outline["@_htmlUrl"],
      category: category || outline["@_category"],
    })
    return
  }

  // This is a category/folder node
  const folderName = outline["@_title"] || outline["@_text"] || category
  const children = outline.outline
  if (!children) return

  const childArray = Array.isArray(children) ? children : [children]
  for (const child of childArray) {
    if (child) {
      extractFeeds(child, folderName, feeds)
    }
  }
}
