import { marked } from "marked"

/**
 * Generate a branded YOMOO HTML page with dual tabs (Report + Podcast).
 * Mobile-first, editorial design with warm amber palette.
 */
export function generateHtmlPage(
  reportMarkdown: string,
  audioUrl: string | null,
  date: string,
  podcastScript?: string | null,
): string {
  const renderedReport = marked.parse(reportMarkdown, { async: false, breaks: true }) as string
  const renderedPodcast = podcastScript
    ? (marked.parse(podcastScript, { async: false, breaks: true }) as string)
    : null

  const audioBlock = audioUrl
    ? `<div class="audio-player">
        <div class="audio-player-label">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>收听音频版</span>
        </div>
        <audio controls preload="metadata">
          <source src="${escapeHtml(audioUrl)}" type="audio/mpeg">
        </audio>
        <a href="${escapeHtml(audioUrl)}" class="audio-download" download>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          下载 MP3
        </a>
      </div>`
    : ""

  const hasPodcast = renderedPodcast !== null

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1a1410" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#fffbf5" media="(prefers-color-scheme: light)">
  <title>YOMOO 每日AI快送 — ${escapeHtml(date)}</title>
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
      --bg-subtle: #f5efe6;
      --text-primary: #1a1410;
      --text-body: #3d3529;
      --text-secondary: #8a7e6e;
      --text-muted: #b5a898;
      --border: rgba(26,20,16,0.08);
      --border-strong: rgba(26,20,16,0.14);
      --shadow-sm: 0 1px 3px rgba(26,20,16,0.04);
      --shadow-md: 0 4px 16px rgba(26,20,16,0.06);
      --shadow-lg: 0 8px 32px rgba(26,20,16,0.08);
      --radius: 14px;
      --radius-sm: 8px;
      --serif: 'Playfair Display', 'Noto Serif SC', Georgia, serif;
      --sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
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
        --bg-subtle: #1f1a14;
        --text-primary: #f5efe6;
        --text-body: #d4cbbf;
        --text-secondary: #8a7e6e;
        --text-muted: #5c5347;
        --border: rgba(245,239,230,0.06);
        --border-strong: rgba(245,239,230,0.12);
        --shadow-sm: 0 1px 3px rgba(0,0,0,0.2);
        --shadow-md: 0 4px 16px rgba(0,0,0,0.25);
        --shadow-lg: 0 8px 32px rgba(0,0,0,0.3);
      }
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html {
      font-size: 16px;
      -webkit-text-size-adjust: 100%;
      scroll-behavior: smooth;
    }

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
      text-rendering: optimizeLegibility;
    }

    /* ===== HEADER ===== */
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
      font-weight: 900;
      font-size: 15px;
      color: white;
      letter-spacing: -0.02em;
      box-shadow: 0 2px 8px rgba(232,114,42,0.3);
    }

    .header-name {
      font-family: var(--serif);
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.01em;
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

    .header-date {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-secondary);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* ===== TABS ===== */
    .tabs-container {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .tabs-inner {
      max-width: 720px;
      margin: 0 auto;
      display: flex;
      padding: 0 1.25rem;
    }

    .tab-btn {
      flex: 1;
      padding: 0.85rem 0;
      font-family: var(--sans);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      position: relative;
      transition: color 0.3s ease;
      -webkit-tap-highlight-color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }

    .tab-btn svg { opacity: 0.5; transition: opacity 0.3s ease; }
    .tab-btn.active svg { opacity: 1; }

    .tab-btn.active {
      color: var(--y-amber);
    }

    .tab-btn::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 50%;
      width: 0;
      height: 2px;
      background: var(--y-amber);
      border-radius: 1px;
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tab-btn.active::after {
      width: 100%;
      left: 0;
    }

    /* ===== MAIN ===== */
    .content-area {
      flex: 1;
      max-width: 720px;
      width: 100%;
      margin: 0 auto;
      padding: 0 1.25rem;
    }

    .tab-panel {
      display: none;
      animation: fadeIn 0.4s ease;
    }

    .tab-panel.active {
      display: block;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ===== AUDIO PLAYER ===== */
    .audio-player {
      max-width: 720px;
      width: 100%;
      margin: 1.25rem auto;
      padding: 1rem 1.25rem;
      background: var(--bg-elevated);
      border: 1px solid var(--y-amber-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.04);
      box-sizing: border-box;
    }

    .audio-player-label {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--y-amber);
      margin-bottom: 0.75rem;
      letter-spacing: 0.02em;
    }

    .audio-player audio {
      width: 100%;
      height: 36px;
      border-radius: var(--radius-sm);
      margin-bottom: 0.6rem;
    }

    .audio-download {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--y-amber);
      text-decoration: none;
      padding: 0.35rem 0.75rem;
      border: 1px solid var(--y-amber-border);
      border-radius: 20px;
      transition: all 0.2s ease;
    }

    .audio-download:hover {
      background: var(--y-amber-glow);
    }

    /* ===== REPORT CONTENT ===== */
    .report-content {
      padding: 1.5rem 0 3rem;
    }

    .report-content h1 {
      font-family: var(--serif);
      font-size: clamp(1.35rem, 4vw, 1.75rem);
      font-weight: 900;
      color: var(--text-primary);
      line-height: 1.3;
      letter-spacing: -0.02em;
      margin: 2rem 0 1rem;
    }

    .report-content h1:first-child {
      margin-top: 0;
    }

    .report-content h2 {
      font-family: var(--serif);
      font-size: clamp(1.1rem, 3.5vw, 1.35rem);
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.35;
      letter-spacing: -0.01em;
      margin: 2rem 0 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border);
    }

    .report-content h3 {
      font-family: var(--serif);
      font-size: clamp(1rem, 3vw, 1.15rem);
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.4;
      margin: 1.5rem 0 0.6rem;
    }

    .report-content p {
      margin-bottom: 1rem;
      font-size: 0.95rem;
      line-height: 1.85;
      color: var(--text-body);
    }

    .report-content ul, .report-content ol {
      margin: 0.75rem 0 1.25rem 1.25rem;
      font-size: 0.95rem;
      color: var(--text-body);
    }

    .report-content li {
      margin-bottom: 0.4rem;
      line-height: 1.75;
    }

    .report-content li::marker {
      color: var(--y-amber);
    }

    .report-content strong {
      color: var(--text-primary);
      font-weight: 600;
    }

    .report-content a {
      color: var(--y-amber);
      text-decoration: none;
      border-bottom: 1px solid var(--y-amber-border);
      transition: border-color 0.2s ease;
    }

    .report-content a:hover {
      border-color: var(--y-amber);
    }

    .report-content blockquote {
      margin: 1.25rem 0;
      padding: 0.85rem 1.15rem;
      border-left: 3px solid var(--y-amber);
      background: var(--y-amber-glow);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
      font-size: 0.92rem;
      color: var(--text-body);
      font-style: italic;
    }

    .report-content blockquote p:last-child {
      margin-bottom: 0;
    }

    .report-content hr {
      border: none;
      height: 1px;
      background: linear-gradient(90deg, transparent, var(--border-strong), transparent);
      margin: 2rem 0;
    }

    .report-content code {
      font-family: var(--mono);
      font-size: 0.85em;
      padding: 0.15em 0.45em;
      background: var(--bg-subtle);
      border-radius: 4px;
      color: var(--y-amber-deep);
    }

    .report-content pre {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 1rem;
      overflow-x: auto;
      margin: 1rem 0;
      -webkit-overflow-scrolling: touch;
    }

    .report-content pre code {
      background: none;
      padding: 0;
      color: var(--text-body);
    }

    .report-content img {
      max-width: 100%;
      border-radius: var(--radius-sm);
    }

    /* ===== PODCAST TAB ===== */
    .podcast-content {
      padding: 1.5rem 0 3rem;
    }

    .podcast-content p {
      font-size: 1rem;
      line-height: 2;
      margin-bottom: 1.5rem;
      color: var(--text-body);
      text-indent: 2em;
    }

    .podcast-content p:first-child::first-letter {
      font-family: var(--serif);
      font-size: 3.2em;
      font-weight: 900;
      float: left;
      line-height: 0.8;
      margin: 0.08em 0.12em 0 0;
      color: var(--y-amber);
    }

    .podcast-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.75rem;
      background: var(--y-amber-glow);
      border: 1px solid var(--y-amber-border);
      border-radius: 20px;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--y-amber);
      letter-spacing: 0.04em;
      margin-bottom: 1.25rem;
    }

    .podcast-badge svg { flex-shrink: 0; }

    /* ===== FOOTER ===== */
    .site-footer {
      text-align: center;
      padding: 2rem 1.25rem calc(env(safe-area-inset-bottom, 0px) + 2rem);
      border-top: 1px solid var(--border);
    }

    .footer-brand {
      font-size: 0.7rem;
      font-weight: 500;
      color: var(--text-muted);
      letter-spacing: 0.06em;
    }

    .footer-brand a {
      color: var(--text-secondary);
      text-decoration: none;
    }

    .footer-powered {
      margin-top: 0.35rem;
      font-size: 0.65rem;
      color: var(--text-muted);
      letter-spacing: 0.08em;
    }

    /* ===== RESPONSIVE ===== */
    @media (min-width: 768px) {
      .site-header { padding-top: 3rem; padding-bottom: 2rem; }
      .content-area { padding: 0 2rem; }
      .tabs-inner { padding: 0 2rem; }
      .tab-btn { font-size: 0.88rem; padding: 1rem 0; }
      .report-content { padding: 2rem 0 4rem; }
      .podcast-content { padding: 2rem 0 4rem; }
    }

    @media (max-width: 374px) {
      html { font-size: 14px; }
    }

    /* ===== SCROLL BAR ===== */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 2px; }
  </style>
</head>
<body>

  <header class="site-header">
    <div class="header-brand">
      <div class="header-logo">Y</div>
      <span class="header-name">YOMOO</span>
    </div>
    <h1 class="header-title">每日AI快送</h1>
    <div class="header-date">${escapeHtml(date)}</div>
  </header>

  ${
    hasPodcast
      ? `
  <nav class="tabs-container">
    <div class="tabs-inner">
      <button class="tab-btn active" data-tab="report" onclick="switchTab('report')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        每日简报
      </button>
      <button class="tab-btn" data-tab="podcast" onclick="switchTab('podcast')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        播客文案
      </button>
    </div>
  </nav>`
      : ""
  }

  ${audioBlock}

  <main class="content-area">
    <div id="panel-report" class="tab-panel active">
      <div class="report-content">
        ${renderedReport}
      </div>
    </div>
    ${
      hasPodcast
        ? `
    <div id="panel-podcast" class="tab-panel">
      <div class="podcast-content">
        <div class="podcast-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          PODCAST SCRIPT
        </div>
        ${renderedPodcast}
      </div>
    </div>`
        : ""
    }
  </main>

  <footer class="site-footer">
    <div class="footer-brand">
      YOMOO 每日AI快送 &copy; ${new Date().getFullYear()} &middot; <a href="../index.html">所有期刊</a>
    </div>
    <div class="footer-powered">Powered by YOMOO LLC</div>
  </footer>

  ${
    hasPodcast
      ? `
  <script>
    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
      document.getElementById('panel-' + tab).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  </script>`
      : ""
  }

</body>
</html>`
}

/**
 * Generate an email-safe HTML version of the YOMOO daily report.
 * No JavaScript, no tabs, table-based layout for email client compatibility.
 * Contains {{UNSUBSCRIBE_URL}} placeholder to be replaced per subscriber.
 */
export function generateEmailHtml(
  reportMarkdown: string,
  audioUrl: string | null,
  date: string,
): string {
  const renderedReport = marked.parse(reportMarkdown, { async: false, breaks: true }) as string

  const episodePageUrl = `https://daily.yomoo.net/episodes/${encodeURIComponent(date)}/index.html`
  const audioBlock = audioUrl
    ? `<tr>
        <td style="padding: 16px 32px;">
          <table cellpadding="0" cellspacing="0" border="0" style="background-color: #fff8ef; border: 1px solid rgba(232,114,42,0.25); border-radius: 8px; width: 100%;">
            <tr>
              <td style="padding: 14px 16px; text-align: center;">
                <a href="${escapeHtml(episodePageUrl)}" style="color: #E8722A; text-decoration: none; font-size: 14px; font-weight: 600;">&#9654; 在线收听播客</a>
                <span style="color: #c9bfb0; margin: 0 8px;">|</span>
                <a href="${escapeHtml(audioUrl)}" style="color: #9a8e7f; text-decoration: none; font-size: 14px;">下载 MP3</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ""

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YOMOO 每日AI快送 — ${escapeHtml(date)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #fffbf5;
      color: #3d3529;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.8;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #1a1410;
      line-height: 1.35;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    h1 { font-size: 24px; font-weight: 800; }
    h2 { font-size: 20px; font-weight: 700; border-bottom: 1px solid #e8e2d9; padding-bottom: 8px; }
    h3 { font-size: 17px; font-weight: 700; }
    p {
      margin: 0 0 16px 0;
      font-size: 15px;
      line-height: 1.85;
      color: #3d3529;
    }
    ul, ol {
      margin: 12px 0 16px 20px;
      padding: 0;
      font-size: 15px;
      color: #3d3529;
    }
    li {
      margin-bottom: 6px;
      line-height: 1.75;
    }
    blockquote {
      margin: 16px 0;
      padding: 12px 16px;
      border-left: 3px solid #E8722A;
      background-color: rgba(232,114,42,0.06);
      font-style: italic;
      color: #3d3529;
    }
    blockquote p:last-child { margin-bottom: 0; }
    code {
      font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
      font-size: 0.85em;
      padding: 2px 6px;
      background-color: #f5efe6;
      border-radius: 3px;
      color: #C4561A;
    }
    pre {
      background-color: #ffffff;
      border: 1px solid #e8e2d9;
      border-radius: 6px;
      padding: 12px;
      overflow-x: auto;
      margin: 12px 0;
    }
    pre code {
      background: none;
      padding: 0;
      color: #3d3529;
    }
    a {
      color: #E8722A;
      text-decoration: underline;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    hr {
      border: none;
      height: 1px;
      background-color: #e8e2d9;
      margin: 24px 0;
    }
    strong {
      color: #1a1410;
      font-weight: 600;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #fffbf5;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #fffbf5;">
    <tr>
      <td align="center" style="padding: 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="max-width: 640px; width: 100%; background-color: #ffffff;">
          <!-- Amber gradient bar -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #C4561A, #E8722A, #D4A053); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #e8e2d9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="width: 28px; height: 28px; background: linear-gradient(135deg, #E8722A, #D4A053); border-radius: 7px; text-align: center; vertical-align: middle; font-family: Georgia, serif; font-weight: 900; font-size: 15px; color: #ffffff;">Y</td>
                  <td style="padding-left: 8px; font-family: Georgia, serif; font-size: 17px; font-weight: 800; color: #1a1410;">YOMOO</td>
                </tr>
              </table>
              <h1 style="font-family: Georgia, serif; font-size: 26px; font-weight: 900; color: #1a1410; margin: 16px 0 8px; line-height: 1.2;">每日AI快送</h1>
              <p style="font-size: 13px; font-weight: 500; color: #8a7e6e; letter-spacing: 0.08em; margin: 0;">${escapeHtml(date)}</p>
            </td>
          </tr>
          ${audioBlock}
          <!-- Report content -->
          <tr>
            <td style="padding: 24px 32px 40px;">
              ${renderedReport}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; text-align: center; border-top: 1px solid #e8e2d9; background-color: #fffbf5;">
              <p style="font-size: 12px; font-weight: 500; color: #b5a898; letter-spacing: 0.06em; margin: 0 0 4px;">YOMOO 每日AI快送</p>
              <p style="font-size: 11px; color: #b5a898; letter-spacing: 0.08em; margin: 0 0 12px;">Powered by YOMOO LLC</p>
              <p style="font-size: 11px; color: #b5a898; margin: 0;">
                <a href="{{UNSUBSCRIBE_URL}}" style="color: #8a7e6e; text-decoration: underline;">退订邮件</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
