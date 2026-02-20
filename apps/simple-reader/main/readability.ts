/**
 * Fetch a URL and extract the main article text content.
 * Uses a simple HTML-to-text approach without heavy dependencies.
 */
export async function fetchArticleContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SimpleReader/1.0 (RSS Reader)",
        Accept: "text/html,application/xhtml+xml",
      },
    })
    clearTimeout(timeout)

    if (!response.ok) return null

    const html = await response.text()
    return extractMainContent(html)
  } catch {
    return null
  }
}

/**
 * Simple content extraction from HTML.
 * Removes scripts, styles, nav, headers, footers, and extracts text from
 * article/main content areas.
 */
function extractMainContent(html: string): string {
  // Remove scripts, styles, and other non-content elements
  const cleaned = html
    .replaceAll(/<script[\s\S]*?<\/script>/gi, "")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, "")
    .replaceAll(/<nav[\s\S]*?<\/nav>/gi, "")
    .replaceAll(/<header[\s\S]*?<\/header>/gi, "")
    .replaceAll(/<footer[\s\S]*?<\/footer>/gi, "")
    .replaceAll(/<aside[\s\S]*?<\/aside>/gi, "")
    .replaceAll(/<!--[\s\S]*?-->/g, "")

  // Try to find article or main content
  const articleMatch = cleaned.match(/<article[\s\S]*?<\/article>/i)
  const mainMatch = cleaned.match(/<main[\s\S]*?<\/main>/i)
  const contentMatch = cleaned.match(
    /<div[^>]*class="[^"]*(?:content|article|post|entry)[^"]*"[\s\S]*?<\/div>/i,
  )

  const contentHtml = articleMatch?.[0] || mainMatch?.[0] || contentMatch?.[0] || cleaned

  // Convert HTML to plain text
  const text = contentHtml
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/p>/gi, "\n\n")
    .replaceAll(/<\/div>/gi, "\n")
    .replaceAll(/<\/li>/gi, "\n")
    .replaceAll(/<li[^>]*>/gi, "- ")
    .replaceAll(/<\/h[1-6]>/gi, "\n\n")
    .replaceAll(/<h[1-6][^>]*>/gi, "## ")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim()

  // Return up to ~10000 chars (plenty for AI analysis)
  return text.slice(0, 10000)
}
