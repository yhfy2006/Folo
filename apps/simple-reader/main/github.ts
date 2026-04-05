const API_BASE = "https://api.github.com"

async function ghFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  })
}

export async function verifyToken(token: string): Promise<string> {
  const resp = await ghFetch("/user", token)
  if (!resp.ok) {
    throw new Error(`GitHub token invalid: HTTP ${resp.status}`)
  }
  const data = await resp.json()
  return data.login as string
}

export async function ensureRepo(token: string, owner: string): Promise<void> {
  // Check if repo exists
  const resp = await ghFetch(`/repos/${owner}/yomoo-daily`, token)
  if (resp.ok) {
    console.info("[github] Repo yomoo-daily already exists")
    return
  }

  if (resp.status !== 404) {
    throw new Error(`Failed to check repo: HTTP ${resp.status}`)
  }

  // Create repo — use org endpoint if owner looks like an org, else user endpoint
  console.info("[github] Creating repo yomoo-daily...")
  const tokenUser = (await (await ghFetch("/user", token)).json()).login as string
  const isOrg = owner !== tokenUser
  const createUrl = isOrg ? `/orgs/${owner}/repos` : "/user/repos"
  const createResp = await ghFetch(createUrl, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "yomoo-daily",
      description: "YOMOO 每日AI快送 - Daily AI News Podcast",
      homepage: "https://daily.yomoo.net",
      auto_init: true,
      private: false,
    }),
  })

  if (!createResp.ok) {
    const err = await createResp.text()
    throw new Error(`Failed to create repo: ${err}`)
  }

  console.info("[github] Repo created, waiting for initialization...")

  // Wait for GitHub to fully initialize the repo (auto_init creates first commit)
  // Retry checking until the repo is ready
  for (let attempt = 0; attempt < 10; attempt++) {
    await sleep(3000)
    const checkResp = await ghFetch(`/repos/${owner}/yomoo-daily/contents/README.md`, token)
    if (checkResp.ok) {
      console.info("[github] Repo initialized (attempt", attempt + 1, ")")
      break
    }
    console.info("[github] Repo not ready yet, retrying... (attempt", attempt + 1, ")")
  }

  // Enable GitHub Pages on main branch
  const pagesResp = await ghFetch(`/repos/${owner}/yomoo-daily/pages`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      build_type: "workflow",
      source: { branch: "main", path: "/" },
    }),
  })

  if (!pagesResp.ok) {
    // Pages might already be enabled or need manual setup
    console.warn("[github] Could not auto-enable Pages:", pagesResp.status)
  }

  // Create GitHub Actions workflow for Pages deployment (with retry)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await commitFile(
        token,
        owner,
        "yomoo-daily",
        ".github/workflows/pages.yml",
        Buffer.from(PAGES_WORKFLOW).toString("base64"),
        "ci: add GitHub Pages deployment workflow",
      )
      break
    } catch (err) {
      console.warn("[github] Workflow commit attempt", attempt + 1, "failed:", err)
      if (attempt === 2) {
        console.warn("[github] Skipping workflow commit, Pages may need manual setup")
      }
      await sleep(3000)
    }
  }

  // Deploy newsletter workflow and send script
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await commitFile(
        token,
        owner,
        "yomoo-daily",
        ".github/workflows/send-newsletter.yml",
        Buffer.from(NEWSLETTER_WORKFLOW).toString("base64"),
        "ci: add newsletter send workflow",
      )
      break
    } catch (err) {
      console.warn("[github] Newsletter workflow commit attempt", attempt + 1, "failed:", err)
      if (attempt === 2) console.warn("[github] Skipping newsletter workflow commit")
      await sleep(3000)
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await commitFile(
        token,
        owner,
        "yomoo-daily",
        ".github/scripts/send-newsletter.js",
        Buffer.from(SEND_NEWSLETTER_SCRIPT).toString("base64"),
        "ci: add newsletter send script",
      )
      break
    } catch (err) {
      console.warn("[github] Newsletter script commit attempt", attempt + 1, "failed:", err)
      if (attempt === 2) console.warn("[github] Skipping newsletter script commit")
      await sleep(3000)
    }
  }

  // Deploy subscribe page if worker URL is configured
  try {
    const { loadPreferences: loadPrefs } = await import("./preferences")
    const prefs = loadPrefs()
    if (prefs.workerUrl) {
      await deploySubscribePage(token, owner, prefs.workerUrl)
    }
  } catch (err) {
    console.warn("[github] Failed to deploy subscribe page:", err)
  }
}

export async function commitFile(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  base64Content: string,
  message: string,
): Promise<void> {
  // Check if file already exists (to get SHA for update)
  const existResp = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token)
  let sha: string | undefined
  if (existResp.ok) {
    const data = await existResp.json()
    sha = data.sha
  }

  const body: Record<string, unknown> = {
    message,
    content: base64Content,
  }
  if (sha) {
    body.sha = sha
  }

  const resp = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Failed to commit ${filePath}: ${err}`)
  }

  console.info("[github] Committed:", filePath)
}

export async function createReleaseWithAudio(
  token: string,
  owner: string,
  tag: string,
  title: string,
  audioBuffer: Buffer,
  fileName: string,
): Promise<string> {
  // Create release (handle tag conflict by appending suffix)
  let releaseTag = tag
  let createResp = await ghFetch(`/repos/${owner}/yomoo-daily/releases`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: releaseTag,
      name: title,
      body: `Audio for ${title}`,
      draft: false,
      prerelease: false,
    }),
  })

  if (!createResp.ok && createResp.status === 422) {
    // Tag already exists, append suffix
    releaseTag = `${tag}-${Date.now().toString(36)}`
    createResp = await ghFetch(`/repos/${owner}/yomoo-daily/releases`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: releaseTag,
        name: title,
        body: `Audio for ${title}`,
        draft: false,
        prerelease: false,
      }),
    })
  }

  if (!createResp.ok) {
    const err = await createResp.text()
    throw new Error(`Failed to create release: ${err}`)
  }

  const release = await createResp.json()
  const uploadUrl = (release.upload_url as string).replace("{?name,label}", "")

  // Upload audio asset
  const uploadResp = await fetch(`${uploadUrl}?name=${encodeURIComponent(fileName)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
    },
    body: audioBuffer,
  })

  if (!uploadResp.ok) {
    const err = await uploadResp.text()
    throw new Error(`Failed to upload audio: ${err}`)
  }

  const asset = await uploadResp.json()
  const downloadUrl = asset.browser_download_url as string
  console.info("[github] Audio uploaded:", downloadUrl)
  return downloadUrl
}

export async function updateRootIndex(
  token: string,
  owner: string,
  date: string,
  title: string,
): Promise<void> {
  // Fetch current index.html or create new
  const existResp = await ghFetch(`/repos/${owner}/yomoo-daily/contents/index.html`, token)

  let existingHtml = ""
  let sha: string | undefined
  if (existResp.ok) {
    const data = await existResp.json()
    sha = data.sha
    existingHtml = Buffer.from(data.content, "base64").toString("utf-8")
  }

  const episodeLink = `<li><a href="episodes/${date}/index.html">${title}</a></li>`

  let newHtml: string
  if (
    existingHtml &&
    existingHtml.includes("episode-list") &&
    existingHtml.includes("subscribe-btn")
  ) {
    // Current style — insert new episode at top of list
    const insertTarget = existingHtml.includes('class="episode-list">')
      ? '<ul id="episode-list" class="episode-list">'
      : '<ul id="episode-list">'
    newHtml = existingHtml.replace(insertTarget, `${insertTarget}\n        ${episodeLink}`)
  } else if (existingHtml && existingHtml.includes("episode-list")) {
    // Old style — extract existing episodes and regenerate with new design
    const episodeMatches = existingHtml.match(/<li><a href="episodes\/[^"]+">.*?<\/a><\/li>/g) || []
    const allEpisodes = [episodeLink, ...episodeMatches.filter((e) => !e.includes(date))]
    newHtml = generateRootIndexHtml(allEpisodes.join("\n        "))
  } else {
    // No index yet — create fresh
    newHtml = generateRootIndexHtml(episodeLink)
  }

  const body: Record<string, unknown> = {
    message: `update: add episode ${date}`,
    content: Buffer.from(newHtml).toString("base64"),
  }
  if (sha) {
    body.sha = sha
  }

  const resp = await ghFetch(`/repos/${owner}/yomoo-daily/contents/index.html`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    console.warn("[github] Failed to update root index:", resp.status)
  }
}

function generateRootIndexHtml(firstEpisodeLink: string, htmlLang?: string): string {
  return `<!DOCTYPE html>
<html lang="${htmlLang ?? "zh-CN"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1a1410" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#fffbf5" media="(prefers-color-scheme: light)">
  <title>YOMOO 每日AI快送</title>
  <meta name="description" content="YOMOO 每日AI快送 - 每天精选最重要的AI和科技新闻，AI生成播客，一键收听。">
  <link rel="canonical" href="https://daily.yomoo.net/">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="YOMOO 每日AI快送">
  <meta property="og:description" content="YOMOO 每日AI快送 - 每天精选最重要的AI和科技新闻，AI生成播客，一键收听。">
  <meta property="og:url" content="https://daily.yomoo.net/">
  <meta property="og:site_name" content="YOMOO 每日AI快送">
  <meta property="og:locale" content="zh_CN">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="YOMOO 每日AI快送">
  <meta name="twitter:description" content="每天精选最重要的AI和科技新闻，AI生成播客，一键收听。">
  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "YOMOO 每日AI快送",
    "description": "每天精选最重要的AI和科技新闻，AI生成播客，一键收听。",
    "url": "https://daily.yomoo.net/",
    "publisher": {
      "@type": "Organization",
      "name": "YOMOO"
    }
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Noto+Serif+SC:wght@600;700;900&family=Noto+Sans+SC:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --y-amber: #E8722A;
      --y-amber-soft: #F4945E;
      --y-amber-deep: #C4561A;
      --y-amber-glow: rgba(232,114,42,0.12);
      --y-amber-border: rgba(232,114,42,0.25);
      --y-gold: #D4A053;
      --bg: #fffbf5;
      --bg-card: #ffffff;
      --bg-elevated: #fff8ef;
      --text-primary: #1a1410;
      --text-body: #3d3529;
      --text-secondary: #8a7e6e;
      --text-muted: #b5a898;
      --border: rgba(26,20,16,0.08);
      --border-strong: rgba(26,20,16,0.14);
      --shadow-sm: 0 1px 3px rgba(26,20,16,0.04);
      --shadow-md: 0 4px 16px rgba(26,20,16,0.06);
      --radius: 14px;
      --radius-sm: 8px;
      --serif: 'Playfair Display', 'Noto Serif SC', Georgia, serif;
      --sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --y-amber: #F4945E;
        --y-amber-soft: #F9B88A;
        --y-amber-deep: #E8722A;
        --y-amber-glow: rgba(244,148,94,0.1);
        --y-amber-border: rgba(244,148,94,0.2);
        --y-gold: #E8BD7A;
        --bg: #1a1410;
        --bg-card: #231e18;
        --bg-elevated: #2a241d;
        --text-primary: #f5efe6;
        --text-body: #d4cbbf;
        --text-secondary: #8a7e6e;
        --text-muted: #5c5347;
        --border: rgba(245,239,230,0.06);
        --border-strong: rgba(245,239,230,0.12);
        --shadow-sm: 0 1px 3px rgba(0,0,0,0.2);
        --shadow-md: 0 4px 16px rgba(0,0,0,0.25);
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { font-size: 16px; -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
    body {
      font-family: var(--sans);
      background: var(--bg);
      color: var(--text-body);
      line-height: 1.8;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }
    .site-header {
      position: relative;
      padding: calc(env(safe-area-inset-top, 0px) + 2.5rem) 1.25rem 1.5rem;
      text-align: center;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .site-header::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--y-amber-deep), var(--y-amber), var(--y-gold));
    }
    .header-brand {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .header-logo {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, var(--y-amber), var(--y-gold));
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--serif);
      font-weight: 900; font-size: 15px; color: white;
      letter-spacing: -0.02em;
      box-shadow: 0 2px 8px rgba(232,114,42,0.3);
    }
    .header-name {
      font-family: var(--serif);
      font-size: 1.1rem; font-weight: 800;
      color: var(--text-primary);
    }
    .header-title {
      font-family: var(--serif);
      font-size: clamp(1.5rem, 5vw, 2.2rem);
      font-weight: 900;
      color: var(--text-primary);
      line-height: 1.2;
      letter-spacing: -0.02em;
      margin-bottom: 0.5rem;
    }
    .header-subtitle {
      font-size: 0.85rem;
      color: var(--text-secondary);
      margin-bottom: 1.25rem;
    }
    .subscribe-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.6rem 1.4rem;
      background: linear-gradient(135deg, var(--y-amber-deep), var(--y-amber));
      color: white;
      font-family: var(--sans);
      font-size: 0.8rem;
      font-weight: 600;
      border: none;
      border-radius: 24px;
      text-decoration: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.2s;
      box-shadow: 0 2px 10px rgba(232,114,42,0.3);
    }
    .subscribe-btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .subscribe-btn svg { flex-shrink: 0; }
    .content-area {
      flex: 1;
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem;
    }
    .section-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 1rem;
    }
    .section-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }
    .episode-list {
      list-style: none;
    }
    .episode-list li {
      margin-bottom: 0.5rem;
    }
    .episode-list a {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-sm);
    }
    .episode-list a:hover {
      border-color: var(--y-amber-border);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }
    .episode-list a::before {
      content: '';
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--y-amber);
      flex-shrink: 0;
    }
    .site-footer {
      text-align: center;
      padding: 2rem 1.25rem calc(env(safe-area-inset-bottom, 0px) + 2rem);
      border-top: 1px solid var(--border);
    }
    .footer-brand {
      font-size: 0.7rem; font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.06em;
    }
    .footer-powered {
      margin-top: 0.35rem;
      font-size: 0.65rem;
      color: var(--text-muted);
      letter-spacing: 0.08em;
    }
    @media (min-width: 768px) {
      .site-header { padding-top: 3rem; padding-bottom: 2rem; }
      .content-area { padding: 2rem 2rem 4rem; }
    }
    @media (max-width: 374px) { html { font-size: 14px; } }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
  </style>
  <script defer src="https://cloud.umami.is/script.js" data-website-id="8864a5e3-4f85-4cb6-9565-d7a9538027df"></script>
</head>
<body>
  <header class="site-header">
    <div class="header-brand">
      <div class="header-logo">Y</div>
      <span class="header-name">YOMOO</span>
    </div>
    <h1 class="header-title">每日AI快送</h1>
    <p class="header-subtitle">AI-powered daily tech briefing &amp; podcast</p>
    <a href="subscribe/index.html" class="subscribe-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      Subscribe
    </a>
  </header>
  <main class="content-area">
    <div class="section-label">Episodes</div>
    <ul id="episode-list" class="episode-list">
        ${firstEpisodeLink}
    </ul>
  </main>
  <footer class="site-footer">
    <div class="footer-brand">YOMOO 每日AI快送 &copy; ${new Date().getFullYear()}</div>
    <div class="footer-powered">Powered by YOMOO LLC</div>
  </footer>
  <script>
  (function() {
    var u = typeof umami !== 'undefined' ? umami : null;
    function t(name, data) { if (u) u.track(name, data || {}); }
    // Track subscribe button click
    var sub = document.querySelector('.subscribe-btn');
    if (sub) sub.addEventListener('click', function() { t('subscribe-click'); });
    // Track episode clicks
    document.querySelectorAll('.episode-list a').forEach(function(a) {
      a.addEventListener('click', function() { t('episode-click', { episode: a.textContent.trim() }); });
    });
  })();
  </script>
</body>
</html>`
}

export function getGitHubPagesUrl(_owner: string, date: string): string {
  return `https://daily.yomoo.net/episodes/${date}/index.html`
}

export async function updateSitemap(token: string, owner: string, date: string): Promise<void> {
  const repo = "yomoo-daily"
  const sitemapPath = "sitemap.xml"

  // Try to fetch existing sitemap
  let existingUrls: string[] = []
  let sha: string | undefined
  const existResp = await ghFetch(`/repos/${owner}/${repo}/contents/${sitemapPath}`, token)
  if (existResp.ok) {
    const data = await existResp.json()
    sha = data.sha
    const content = Buffer.from(data.content, "base64").toString("utf-8")
    // Extract existing <loc> entries
    const locMatches = content.match(/<loc>(.*?)<\/loc>/g) || []
    existingUrls = locMatches.map((m: string) => m.replaceAll(/<\/?loc>/g, ""))
  }

  const newUrl = `https://daily.yomoo.net/episodes/${date}/index.html`
  if (existingUrls.includes(newUrl)) {
    console.info("[github] Sitemap already contains", date)
    return
  }

  // Build URL entries: homepage + all episodes
  const allUrls = new Set(existingUrls)
  allUrls.add("https://daily.yomoo.net/")
  allUrls.add(newUrl)

  const today = new Date().toISOString().slice(0, 10)
  const urlEntries = [...allUrls]
    .map(
      (url) => `  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
  </url>`,
    )
    .join("\n")

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`

  const body: Record<string, unknown> = {
    message: `chore: update sitemap for ${date}`,
    content: Buffer.from(sitemap).toString("base64"),
  }
  if (sha) {
    body.sha = sha
  }

  const resp = await ghFetch(`/repos/${owner}/${repo}/contents/${sitemapPath}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    console.warn("[github] Failed to update sitemap:", resp.status)
  } else {
    console.info("[github] Sitemap updated with", date)
  }
}

export async function ensureRobotsTxt(token: string, owner: string): Promise<void> {
  const repo = "yomoo-daily"
  const filePath = "robots.txt"

  // Check if already exists
  const existResp = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token)
  if (existResp.ok) {
    console.info("[github] robots.txt already exists, skipping")
    return
  }

  const content = `User-agent: *
Allow: /
Sitemap: https://daily.yomoo.net/sitemap.xml
`

  const resp = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "chore: add robots.txt",
      content: Buffer.from(content).toString("base64"),
    }),
  })

  if (!resp.ok) {
    console.warn("[github] Failed to create robots.txt:", resp.status)
  } else {
    console.info("[github] robots.txt created")
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function deploySubscribePage(
  token: string,
  owner: string,
  workerUrl: string,
): Promise<void> {
  if (!workerUrl) return

  const html = generateSubscribePageHtml(workerUrl)
  const base64 = Buffer.from(html).toString("base64")

  await commitFile(
    token,
    owner,
    "yomoo-daily",
    "subscribe/index.html",
    base64,
    "feat: add/update subscribe page",
  )
  console.info("[github] Subscribe page deployed")
}

function generateSubscribePageHtml(workerUrl: string, htmlLang?: string): string {
  // Escape the worker URL for safe embedding in JS string
  const _safeWorkerUrl = workerUrl
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replace(/\/$/, "")

  return `<!DOCTYPE html>
<html lang="${htmlLang ?? "zh-CN"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#1a1410">
  <title>Subscribe — YOMOO 每日AI快送</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Noto+Sans+SC:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    :root{--y-amber:#E8722A;--bg:#1a1410;--bg-card:#231e18;--text-primary:#f5efe6;--text-body:#d4cbbf;--text-muted:#5c5347;--border:rgba(245,239,230,0.06);--serif:'Playfair Display',Georgia,serif;--sans:'Noto Sans SC',-apple-system,sans-serif}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:var(--sans);background:var(--bg);color:var(--text-body);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1.25rem}
    .card{max-width:400px;width:100%;text-align:center}
    .logo{display:inline-flex;align-items:center;gap:0.5rem;margin-bottom:1.5rem}
    .logo-icon{width:36px;height:36px;background:linear-gradient(135deg,#E8722A,#D4A053);border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:900;font-size:20px;color:white}
    .logo-name{font-family:var(--serif);font-size:1.3rem;font-weight:800;color:var(--text-primary)}
    h1{font-family:var(--serif);font-size:1.8rem;font-weight:900;color:var(--text-primary);margin-bottom:0.5rem}
    .subtitle{font-size:0.9rem;color:var(--text-muted);margin-bottom:2rem}
    .form-group{display:flex;gap:0.5rem;margin-bottom:1rem}
    input[type="email"]{flex:1;padding:0.75rem 1rem;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);font-size:0.9rem;outline:none}
    input[type="email"]:focus{border-color:rgba(232,114,42,0.4)}
    button{padding:0.75rem 1.5rem;background:linear-gradient(135deg,#E8722A,#D4A053);color:white;border:none;border-radius:10px;font-weight:600;font-size:0.9rem;cursor:pointer;transition:opacity 0.2s}
    button:hover{opacity:0.9}
    button:disabled{opacity:0.5;cursor:not-allowed}
    .message{font-size:0.85rem;margin-top:0.5rem;min-height:1.5em}
    .message.success{color:#22c55e}
    .message.error{color:#ef4444}
    .footer{margin-top:3rem;font-size:0.7rem;color:var(--text-muted)}
    .footer a{color:var(--text-muted);text-decoration:none}
    .footer a:hover{color:var(--y-amber)}
  </style>
  <script defer src="https://cloud.umami.is/script.js" data-website-id="8864a5e3-4f85-4cb6-9565-d7a9538027df"></script>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">Y</div>
      <span class="logo-name">YOMOO</span>
    </div>
    <h1>每日AI快送</h1>
    <p class="subtitle">Subscribe to receive the daily AI briefing in your inbox</p>
    <div class="form-group">
      <input type="email" id="email" placeholder="your@email.com" required>
      <button id="btn" onclick="subscribe()">Subscribe</button>
    </div>
    <p class="message" id="msg"></p>
    <div class="footer">
      <a href="../index.html">Browse episodes</a> &middot; Powered by YOMOO LLC
    </div>
  </div>
  <script>
    async function subscribe(){
      var email=document.getElementById('email').value.trim();
      var msg=document.getElementById('msg');
      var btn=document.getElementById('btn');
      if(!email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)){msg.className='message error';msg.textContent='Please enter a valid email (e.g. name@example.com)';if(typeof umami!=='undefined')umami.track('subscribe-validation-error');return}
      btn.disabled=true;btn.textContent='...';msg.textContent='';
      try{
        var resp=await fetch('\${safeWorkerUrl}/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email})});
        var data=await resp.json();
        if(data.success){msg.className='message success';msg.textContent='Subscribed! Check your inbox tomorrow.';document.getElementById('email').value='';if(typeof umami!=='undefined')umami.track('subscribe-success')}
        else{msg.className='message error';msg.textContent=data.error||'Something went wrong';if(typeof umami!=='undefined')umami.track('subscribe-error',{error:data.error||'unknown'})}
      }catch(e){msg.className='message error';msg.textContent='Network error, please try again'}
      btn.disabled=false;btn.textContent='Subscribe';
    }
    document.getElementById('email').addEventListener('keydown',function(e){if(e.key==='Enter')subscribe()});
    // Track browse episodes link
    var _bel=document.querySelector('.footer a');
    if(_bel)_bel.addEventListener('click',function(){if(typeof umami!=='undefined')umami.track('browse-episodes');});
  </script>
</body>
</html>`
}

const PAGES_WORKFLOW = `name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`

const NEWSLETTER_WORKFLOW = `name: Send Newsletter

on:
  push:
    paths:
      - 'episodes/*/email.html'
    branches: ["main"]
  workflow_dispatch:
    inputs:
      date:
        description: 'Episode date (YYYY-MM-DD)'
        required: true

jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Determine episode date
        id: date
        run: |
          if [ -n "\${{ github.event.inputs.date }}" ]; then
            echo "date=\${{ github.event.inputs.date }}" >> $GITHUB_OUTPUT
          else
            # Extract date from the changed file path (episodes/YYYY-MM-DD/email.html)
            DATE=$(git diff --name-only HEAD~1 HEAD | grep 'episodes/.*/email.html' | head -1 | sed 's|episodes/\\(.*\\)/email.html|\\1|')
            echo "date=$DATE" >> $GITHUB_OUTPUT
          fi

      - name: Send newsletter
        if: steps.date.outputs.date != ''
        env:
          RESEND_API_KEY: \${{ secrets.RESEND_API_KEY }}
          WORKER_URL: \${{ secrets.WORKER_URL }}
          WORKER_SECRET: \${{ secrets.WORKER_SECRET }}
          RESEND_FROM: \${{ secrets.RESEND_FROM || 'YOMOO 每日AI快送 <daily@yomoo.com>' }}
          EPISODE_DATE: \${{ steps.date.outputs.date }}
        run: node .github/scripts/send-newsletter.js
`

const SEND_NEWSLETTER_SCRIPT = `const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const { RESEND_API_KEY, WORKER_URL, WORKER_SECRET, RESEND_FROM, EPISODE_DATE } = process.env;

if (!RESEND_API_KEY || !WORKER_URL || !WORKER_SECRET || !EPISODE_DATE) {
  console.log('Missing required env vars, skipping newsletter');
  process.exit(0);
}

const emailPath = path.join('episodes', EPISODE_DATE, 'email.html');
if (!fs.existsSync(emailPath)) {
  console.error('Email HTML not found:', emailPath);
  process.exit(1);
}
const emailTemplate = fs.readFileSync(emailPath, 'utf-8');

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function hmacToken(email, secret) {
  return crypto.createHmac('sha256', secret).update(email).digest('hex');
}

async function main() {
  // Fetch subscribers
  const workerUrl = WORKER_URL.replace(/\\/$/, '');
  console.log('Fetching subscribers from', workerUrl);

  const subResp = await fetchJson(workerUrl + '/subscribers', {
    method: 'GET',
    headers: { 'X-API-Secret': WORKER_SECRET },
  });

  if (subResp.status !== 200) {
    console.error('Failed to fetch subscribers:', subResp.status, subResp.data);
    process.exit(1);
  }

  const subscribers = subResp.data;
  console.log('Found', subscribers.length, 'subscriber(s)');

  if (subscribers.length === 0) {
    console.log('No subscribers, done');
    return;
  }

  let sent = 0, failed = 0;

  for (const sub of subscribers) {
    const email = sub.email;
    const token = hmacToken(email, WORKER_SECRET);
    const unsubUrl = workerUrl + '/unsubscribe?email=' + encodeURIComponent(email) + '&token=' + token;
    const html = emailTemplate.replace(/{{UNSUBSCRIBE_URL}}/g, unsubUrl);

    try {
      const resp = await fetchJson('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM || 'Yomoo 每日AI快送 <daily@yomoo.com>',
          to: email,
          subject: 'Yomoo 每日AI快送 — ' + EPISODE_DATE,
          html: html,
        }),
      });

      if (resp.status >= 200 && resp.status < 300) {
        sent++;
        console.log('  Sent to', email);
      } else {
        failed++;
        console.error('  Failed for', email, ':', resp.status, JSON.stringify(resp.data));
      }
    } catch (err) {
      failed++;
      console.error('  Error for', email, ':', err.message);
    }

    // Rate limit: 100ms between sends
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('Done:', sent, 'sent,', failed, 'failed, out of', subscribers.length);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
`
