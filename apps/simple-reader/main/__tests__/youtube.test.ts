import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  buildVideoDescription,
  exchangeCode,
  getAuthUrl,
  listChannelVideos,
  refreshAccessToken,
  setThumbnail,
  uploadVideo,
} from "../youtube"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock fs for file operations
vi.mock("node:fs", () => ({
  statSync: vi.fn(() => ({ size: 1024 * 1024 })), // 1MB file
  createReadStream: vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      yield Buffer.alloc(512 * 1024) // first chunk
      yield Buffer.alloc(512 * 1024) // second chunk
    },
  })),
  readFileSync: vi.fn(() => Buffer.from("fake-thumbnail-data")),
}))

describe("youtube", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("getAuthUrl", () => {
    it("should build correct OAuth consent URL with scopes", () => {
      const url = getAuthUrl("my-client-id", "http://localhost:3000/callback")
      const parsed = new URL(url)

      expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
      expect(parsed.searchParams.get("client_id")).toBe("my-client-id")
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback")
      expect(parsed.searchParams.get("response_type")).toBe("code")
      expect(parsed.searchParams.get("access_type")).toBe("offline")

      const scope = parsed.searchParams.get("scope")!
      expect(scope).toContain("https://www.googleapis.com/auth/youtube.upload")
      expect(scope).toContain("https://www.googleapis.com/auth/youtube")
    })

    it("should include prompt=consent for fresh refresh tokens", () => {
      const url = getAuthUrl("cid", "http://localhost/cb")
      const parsed = new URL(url)
      expect(parsed.searchParams.get("prompt")).toBe("consent")
    })
  })

  describe("exchangeCode", () => {
    it("should exchange authorization code for tokens", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "at-123",
          refresh_token: "rt-456",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      })

      const result = await exchangeCode("auth-code", "cid", "csecret", "http://localhost/cb")

      expect(result.accessToken).toBe("at-123")
      expect(result.refreshToken).toBe("rt-456")

      // Verify POST body
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe("https://oauth2.googleapis.com/token")
      expect(options.method).toBe("POST")
      const body = new URLSearchParams(options.body)
      expect(body.get("code")).toBe("auth-code")
      expect(body.get("client_id")).toBe("cid")
      expect(body.get("client_secret")).toBe("csecret")
      expect(body.get("redirect_uri")).toBe("http://localhost/cb")
      expect(body.get("grant_type")).toBe("authorization_code")
    })

    it("should throw on failed exchange", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":"invalid_grant"}',
      })

      await expect(
        exchangeCode("bad-code", "cid", "csecret", "http://localhost/cb"),
      ).rejects.toThrow("Failed to exchange code")
    })
  })

  describe("refreshAccessToken", () => {
    it("should refresh and return new access token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-at-789",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      })

      const token = await refreshAccessToken("rt-456", "cid", "csecret")
      expect(token).toBe("new-at-789")

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe("https://oauth2.googleapis.com/token")
      const body = new URLSearchParams(options.body)
      expect(body.get("refresh_token")).toBe("rt-456")
      expect(body.get("grant_type")).toBe("refresh_token")
    })

    it("should throw on 401 expired token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{"error":"invalid_grant","error_description":"Token has been revoked"}',
      })

      await expect(refreshAccessToken("bad-rt", "cid", "csecret")).rejects.toThrow(
        "Token expired or revoked",
      )
    })
  })

  describe("uploadVideo", () => {
    it("should perform resumable upload and return video ID", async () => {
      // Step 1: POST metadata → get upload URI
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc123",
        }),
      })

      // Step 2: PUT file → get video response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "video-id-xyz" }),
      })

      const onProgress = vi.fn()

      const videoId = await uploadVideo({
        accessToken: "at-123",
        videoPath: "/tmp/video.mp4",
        title: "Test Video",
        description: "A test video",
        tags: ["test", "video"],
        categoryId: "28",
        privacyStatus: "unlisted",
        onProgress,
      })

      expect(videoId).toBe("video-id-xyz")

      // Verify metadata POST
      const [metaUrl, metaOpts] = mockFetch.mock.calls[0]
      expect(metaUrl).toContain("https://www.googleapis.com/upload/youtube/v3/videos")
      expect(metaUrl).toContain("uploadType=resumable")
      expect(metaOpts.method).toBe("POST")
      expect(metaOpts.headers["Authorization"]).toBe("Bearer at-123")

      const metaBody = JSON.parse(metaOpts.body)
      expect(metaBody.snippet.title).toBe("Test Video")
      expect(metaBody.snippet.tags).toEqual(["test", "video"])
      expect(metaBody.status.privacyStatus).toBe("unlisted")

      // Verify file PUT
      const [putUrl, putOpts] = mockFetch.mock.calls[1]
      expect(putUrl).toBe("https://www.googleapis.com/upload/youtube/v3/videos?upload_id=abc123")
      expect(putOpts.method).toBe("PUT")
      expect(putOpts.headers["Content-Length"]).toBe("1048576") // 1MB

      // Progress should have been called
      expect(onProgress).toHaveBeenCalled()
    })

    it("should throw on 401 during metadata POST", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      })

      await expect(
        uploadVideo({
          accessToken: "expired-token",
          videoPath: "/tmp/video.mp4",
          title: "Test",
          description: "Test",
          tags: [],
          categoryId: "28",
          privacyStatus: "private",
        }),
      ).rejects.toThrow("expired or invalid")
    })

    it("should throw on 403 quota exceeded", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "quota exceeded",
      })

      await expect(
        uploadVideo({
          accessToken: "at-123",
          videoPath: "/tmp/video.mp4",
          title: "Test",
          description: "Test",
          tags: [],
          categoryId: "28",
          privacyStatus: "private",
        }),
      ).rejects.toThrow("quota")
    })

    it("should throw if no upload URI returned", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({}), // no location header
      })

      await expect(
        uploadVideo({
          accessToken: "at-123",
          videoPath: "/tmp/video.mp4",
          title: "Test",
          description: "Test",
          tags: [],
          categoryId: "28",
          privacyStatus: "private",
        }),
      ).rejects.toThrow("upload URI")
    })
  })

  describe("setThumbnail", () => {
    it("should upload thumbnail to correct endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ default: { url: "https://i.ytimg.com/thumb.jpg" } }] }),
      })

      await setThumbnail("video-id-xyz", "/tmp/thumb.png", "at-123")

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain("https://www.googleapis.com/upload/youtube/v3/thumbnails/set")
      expect(url).toContain("videoId=video-id-xyz")
      expect(options.method).toBe("POST")
      expect(options.headers["Authorization"]).toBe("Bearer at-123")
      expect(options.headers["Content-Type"]).toBe("image/png")
    })

    it("should throw on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      })

      await expect(setThumbnail("vid", "/tmp/t.png", "at")).rejects.toThrow(
        "Failed to set thumbnail",
      )
    })
  })

  describe("listChannelVideos", () => {
    it("should fetch channel uploads and return video stats", async () => {
      // Step 1: channels.list → get uploads playlist ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{ contentDetails: { relatedPlaylists: { uploads: "UU_playlist_123" } } }],
        }),
      })

      // Step 2: playlistItems.list → get video IDs + snippets
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              snippet: {
                resourceId: { videoId: "vid-1" },
                title: "YOMOO 每日AI快送 — 2026-03-25",
                publishedAt: "2026-03-25T08:00:00Z",
              },
            },
            {
              snippet: {
                resourceId: { videoId: "vid-2" },
                title: "YOMOO 每日AI快送 — 2026-03-24",
                publishedAt: "2026-03-24T08:00:00Z",
              },
            },
          ],
        }),
      })

      // Step 3: videos.list → get statistics + full snippet (description)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "vid-1",
              snippet: {
                title: "YOMOO 每日AI快送 — 2026-03-25",
                publishedAt: "2026-03-25T08:00:00Z",
                description:
                  "YOMOO 每日AI快送 — 2026-03-25\n\n今日快送：3条重点新闻\n1. GPT-5 released\n2. Apple AI chip\n3. Anthropic funding\n\n🔗 网页版: https://example.com",
              },
              statistics: { viewCount: "12500", likeCount: "340", commentCount: "28" },
            },
            {
              id: "vid-2",
              snippet: {
                title: "YOMOO 每日AI快送 — 2026-03-24",
                publishedAt: "2026-03-24T08:00:00Z",
                description:
                  "YOMOO 每日AI快送 — 2026-03-24\n\n今日快送：2条重点新闻\n1. Google Gemini update\n2. Nvidia new GPU\n\n🔗 网页版: https://example.com",
              },
              statistics: { viewCount: "8200", likeCount: "210", commentCount: "15" },
            },
          ],
        }),
      })

      const videos = await listChannelVideos("access-token-123", 10)

      expect(videos).toHaveLength(2)
      expect(videos[0]).toEqual({
        videoId: "vid-1",
        title: "YOMOO 每日AI快送 — 2026-03-25",
        publishedAt: "2026-03-25T08:00:00Z",
        description: expect.stringContaining("GPT-5 released"),
        viewCount: 12500,
        likeCount: 340,
        commentCount: 28,
      })
      expect(videos[1]!.viewCount).toBe(8200)

      // Verify API calls
      const [channelsUrl] = mockFetch.mock.calls[0]
      expect(channelsUrl).toContain("youtube.googleapis.com/youtube/v3/channels")
      expect(channelsUrl).toContain("mine=true")

      const [playlistUrl] = mockFetch.mock.calls[1]
      expect(playlistUrl).toContain("youtube.googleapis.com/youtube/v3/playlistItems")
      expect(playlistUrl).toContain("UU_playlist_123")

      const [videosUrl] = mockFetch.mock.calls[2]
      expect(videosUrl).toContain("youtube.googleapis.com/youtube/v3/videos")
      expect(videosUrl).toContain("vid-1")
      expect(videosUrl).toContain("vid-2")
    })

    it("should return empty array if channel has no uploads", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [] }),
      })

      const videos = await listChannelVideos("access-token", 10)
      expect(videos).toEqual([])
    })

    it("should throw on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      })

      await expect(listChannelVideos("bad-token", 10)).rejects.toThrow("Failed to list channel")
    })
  })

  describe("buildVideoDescription", () => {
    it("should format description with headlines and links", () => {
      const desc = buildVideoDescription(
        "2026-02-22",
        ["OpenAI releases GPT-5", "Apple unveils AI chip", "Google updates Gemini"],
        "https://daily.yomoo.net/episodes/2026-02-22/index.html",
        "https://github.com/user/repo/releases/download/audio.mp3",
      )

      expect(desc).toContain("1. OpenAI releases GPT-5")
      expect(desc).toContain("2. Apple unveils AI chip")
      expect(desc).toContain("3. Google updates Gemini")
      expect(desc).toContain("https://daily.yomoo.net/episodes/2026-02-22/index.html")
      expect(desc).toContain("audio.mp3")
    })

    it("should work without audio URL", () => {
      const desc = buildVideoDescription(
        "2026-02-22",
        ["One headline"],
        "https://daily.yomoo.net/episodes/2026-02-22/index.html",
      )

      expect(desc).toContain("1. One headline")
      expect(desc).toContain("https://daily.yomoo.net/episodes/2026-02-22/index.html")
      expect(desc).not.toContain("undefined")
    })
  })
})
