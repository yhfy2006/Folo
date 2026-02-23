import type { ScenesJson } from "./scene-generator"

/**
 * Fetch OG images for news scenes that have a sourceUrl.
 * Sets scene.ogImage to the og:image URL for later download.
 * Failures are silently ignored — scenes without OG images will render text-only.
 */
export async function fetchOGImages(
  scenes: ScenesJson,
  onStatus?: (status: string) => void,
): Promise<void> {
  const newsScenes = scenes.scenes.filter((s) => s.type === "news" && s.sourceUrl)

  if (newsScenes.length === 0) {
    onStatus?.("No source URLs found, skipping OG image fetch")
    return
  }

  onStatus?.(`Fetching OG images for ${newsScenes.length} news items...`)

  await Promise.allSettled(
    newsScenes.map(async (scene) => {
      try {
        const ogImageUrl = await fetchOGImageUrl(scene.sourceUrl!)
        if (ogImageUrl) {
          scene.ogImage = ogImageUrl
          console.info(`[og-image] Found OG image for "${scene.title?.slice(0, 30)}..."`)
        } else {
          console.info(`[og-image] No OG image found for "${scene.title?.slice(0, 30)}..."`)
        }
      } catch (err) {
        console.info(`[og-image] Failed to fetch OG image for ${scene.sourceUrl}: ${err}`)
      }
    }),
  )

  const found = newsScenes.filter((s) => s.ogImage).length
  onStatus?.(`Found ${found}/${newsScenes.length} OG images`)
}

/**
 * Fetch a URL and extract the og:image meta tag value.
 * Times out after 5 seconds.
 */
async function fetchOGImageUrl(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    })

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    return extractOGImage(html)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract og:image URL from HTML using regex.
 * Handles both property="og:image" and name="og:image" variants.
 */
function extractOGImage(html: string): string | null {
  // Match <meta property="og:image" content="..."> or <meta name="og:image" content="...">
  // Also handle content before property/name attribute
  const patterns = [
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+name=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']og:image["']/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const url = match[1].trim()
      // Basic URL validation
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//")) {
        return url.startsWith("//") ? `https:${url}` : url
      }
    }
  }

  return null
}
