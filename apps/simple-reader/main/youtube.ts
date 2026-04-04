import { readFileSync, statSync } from "node:fs"

const OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
const THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"
const CHANNELS_URL = "https://youtube.googleapis.com/youtube/v3/channels"
const PLAYLIST_ITEMS_URL = "https://youtube.googleapis.com/youtube/v3/playlistItems"
const VIDEOS_URL = "https://youtube.googleapis.com/youtube/v3/videos"

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
]

export interface UploadParams {
  accessToken: string
  videoPath: string
  title: string
  description: string
  tags: string[]
  categoryId: string
  privacyStatus: "public" | "unlisted" | "private"
  onProgress?: (pct: number) => void
}

// --- OAuth ---

export function getAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  })
  return `${OAUTH_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to exchange code: HTTP ${resp.status} — ${err}`)
  }

  const data = await resp.json()
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  })

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!resp.ok) {
    const err = await resp.text()
    if (resp.status === 400 && err.includes("invalid_grant")) {
      throw new Error("Token expired or revoked. Please re-authorize YouTube access.")
    }
    throw new Error(`Failed to refresh token: HTTP ${resp.status} — ${err}`)
  }

  const data = await resp.json()
  return data.access_token as string
}

// --- Video Upload ---

export async function uploadVideo(params: UploadParams): Promise<string> {
  const {
    accessToken,
    videoPath,
    title,
    description,
    tags,
    categoryId,
    privacyStatus,
    onProgress,
  } = params

  // Step 1: Initiate resumable upload — POST metadata
  const metadata = {
    snippet: {
      title,
      description,
      tags,
      categoryId,
      defaultLanguage: "zh-CN",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  }

  const fileSize = statSync(videoPath).size

  const initResp = await fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(fileSize),
      "X-Upload-Content-Type": "video/*",
    },
    body: JSON.stringify(metadata),
  })

  if (!initResp.ok) {
    const err = await initResp.text()
    if (initResp.status === 401) {
      throw new Error(`Access token expired or invalid: ${err}`)
    }
    if (initResp.status === 403) {
      throw new Error(`YouTube API quota exceeded or forbidden: ${err}`)
    }
    throw new Error(`Failed to initiate upload: HTTP ${initResp.status} — ${err}`)
  }

  const uploadUri = initResp.headers.get("location")
  if (!uploadUri) {
    throw new Error("No upload URI returned from YouTube API")
  }

  console.info("[youtube] Resumable upload URI obtained, uploading file...")

  // Step 2: Upload file content
  const fileBuffer = readFileSync(videoPath)

  if (onProgress) {
    onProgress(50) // mid-progress since we read the whole file
  }

  const uploadResp = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": String(fileSize),
      "Content-Type": "video/*",
    },
    body: fileBuffer,
  })

  if (!uploadResp.ok) {
    const err = await uploadResp.text()
    throw new Error(`Failed to upload video: HTTP ${uploadResp.status} — ${err}`)
  }

  if (onProgress) {
    onProgress(100)
  }

  const video = await uploadResp.json()
  const videoId = video.id as string
  console.info("[youtube] Video uploaded:", videoId)
  return videoId
}

// --- Thumbnail ---

export async function setThumbnail(
  videoId: string,
  thumbnailPath: string,
  accessToken: string,
): Promise<void> {
  const thumbData = readFileSync(thumbnailPath)

  const resp = await fetch(`${THUMBNAIL_URL}?videoId=${encodeURIComponent(videoId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/png",
      "Content-Length": String(thumbData.length),
    },
    body: thumbData,
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to set thumbnail: HTTP ${resp.status} — ${err}`)
  }

  console.info("[youtube] Thumbnail set for video:", videoId)
}

// --- Channel Analytics ---

export interface ChannelVideo {
  videoId: string
  title: string
  publishedAt: string
  description: string
  viewCount: number
  likeCount: number
  commentCount: number
  duration: string // ISO 8601 e.g. "PT5M30S"
}

export async function listChannelVideos(
  accessToken: string,
  maxResults = 30,
): Promise<ChannelVideo[]> {
  const channelsResp = await fetch(`${CHANNELS_URL}?part=contentDetails&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!channelsResp.ok) {
    const err = await channelsResp.text()
    throw new Error(`Failed to list channel: HTTP ${channelsResp.status} — ${err}`)
  }

  const channelsData = await channelsResp.json()
  if (!channelsData.items || channelsData.items.length === 0) {
    return []
  }

  const uploadsPlaylistId = channelsData.items[0].contentDetails.relatedPlaylists.uploads as string

  const playlistResp = await fetch(
    `${PLAYLIST_ITEMS_URL}?part=snippet&playlistId=${encodeURIComponent(uploadsPlaylistId)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!playlistResp.ok) {
    const err = await playlistResp.text()
    throw new Error(`Failed to list playlist items: HTTP ${playlistResp.status} — ${err}`)
  }

  const playlistData = await playlistResp.json()
  if (!playlistData.items || playlistData.items.length === 0) {
    return []
  }

  const videoIds = playlistData.items.map((item: any) => item.snippet.resourceId.videoId as string)

  const videosResp = await fetch(
    `${VIDEOS_URL}?part=snippet,statistics,contentDetails&id=${videoIds.join(",")}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
  if (!videosResp.ok) {
    const err = await videosResp.text()
    throw new Error(`Failed to get video details: HTTP ${videosResp.status} — ${err}`)
  }

  const videosData = await videosResp.json()

  return (videosData.items || []).map((item: any) => ({
    videoId: item.id as string,
    title: item.snippet.title as string,
    publishedAt: item.snippet.publishedAt as string,
    description: item.snippet.description as string,
    viewCount: Number(item.statistics.viewCount || 0),
    likeCount: Number(item.statistics.likeCount || 0),
    commentCount: Number(item.statistics.commentCount || 0),
    duration: (item.contentDetails?.duration as string) || "PT0S",
  }))
}

// --- Description Helper ---

export function buildVideoDescription(
  date: string,
  headlines: string[],
  episodeUrl: string,
  audioUrl?: string,
): string {
  const headlineList = headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")

  let desc = `YOMOO 每日AI快送 — ${date}\n\n`
  desc += `今日快送：${headlines.length}条重点新闻\n`
  desc += `${headlineList}\n\n`
  desc += `🔗 网页版: ${episodeUrl}\n`
  if (audioUrl) {
    desc += `🎧 播客音频: ${audioUrl}\n`
  }
  desc += `📧 订阅邮件: https://daily.yomoo.net/subscribe/index.html\n\n`
  desc += `#AI #每日AI快送 #YOMOO #科技新闻`

  return desc
}

/**
 * Parse ISO 8601 duration (e.g. "PT5M30S", "PT45S") to total seconds.
 */
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  const hours = Number(match[1] || 0)
  const minutes = Number(match[2] || 0)
  const seconds = Number(match[3] || 0)
  return hours * 3600 + minutes * 60 + seconds
}
