import { readFileSync, statSync } from "node:fs"

const OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
const THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set"

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
