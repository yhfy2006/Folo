import { describe, expect, it } from "vitest"

import { generateEmailHtml } from "./html-generator"

describe("generateEmailHtml", () => {
  const sampleMarkdown = "## Hello World\n\nThis is a **test** report."
  const sampleDate = "2026-02-20"
  const sampleAudioUrl = "https://example.com/audio.mp3"

  it("should return valid HTML with email-safe structure", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain('<html lang="zh-CN">')
    expect(html).toContain("</html>")
  })

  it("should contain no <script> tags", () => {
    const html = generateEmailHtml(sampleMarkdown, sampleAudioUrl, sampleDate)
    expect(html).not.toContain("<script")
    expect(html).not.toContain("</script>")
  })

  it("should use table-based layout", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<table")
    expect(html).toContain("</table>")
  })

  it("should contain the {{UNSUBSCRIBE_URL}} placeholder in footer", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("{{UNSUBSCRIBE_URL}}")
  })

  it("should render markdown content using marked", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<h2>")
    expect(html).toContain("Hello World")
    expect(html).toContain("<strong>test</strong>")
  })

  it("should include YOMOO branding in header", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("YOMOO")
    expect(html).toContain("每日AI快送")
  })

  it("should include the Y logo element", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    // Y logo in header
    expect(html).toContain(">Y<")
  })

  it("should display the date", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("2026-02-20")
  })

  it("should escape HTML in the date", () => {
    const html = generateEmailHtml(sampleMarkdown, null, '<script>alert("xss")</script>')
    expect(html).not.toContain('<script>alert("xss")</script>')
    expect(html).toContain("&lt;script&gt;")
  })

  it("should include audio download link when audioUrl is provided", () => {
    const html = generateEmailHtml(sampleMarkdown, sampleAudioUrl, sampleDate)
    expect(html).toContain("https://example.com/audio.mp3")
    expect(html).toContain("下载 MP3")
    // Should NOT contain <audio> tag (not supported in email)
    expect(html).not.toContain("<audio")
  })

  it("should not include audio section when audioUrl is null", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).not.toContain("下载 MP3")
  })

  it("should have no sticky nav or tabs", () => {
    const html = generateEmailHtml(sampleMarkdown, sampleAudioUrl, sampleDate)
    expect(html).not.toContain("tab-btn")
    expect(html).not.toContain("tabs-container")
    expect(html).not.toContain("switchTab")
    expect(html).not.toContain("podcast")
  })

  it("should include email-safe CSS in a <style> tag", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<style>")
    expect(html).toContain("</style>")
  })

  it("should include title with date", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<title>YOMOO 每日AI快送")
    expect(html).toContain(sampleDate)
  })

  it("should include MSO conditional comment for Outlook", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("<!--[if mso]>")
  })

  it("should have max-width 640px content table", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("640")
  })

  it("should include amber gradient bar", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    // 3px amber gradient bar
    expect(html).toContain("linear-gradient")
    expect(html).toContain("#E8722A")
  })

  it("should include Powered by YOMOO LLC in footer", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("Powered by YOMOO LLC")
  })

  it("should include unsubscribe link in footer", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    expect(html).toContain("{{UNSUBSCRIBE_URL}}")
    // The unsubscribe URL should be in an <a> tag
    expect(html).toMatch(/href="?\{\{UNSUBSCRIBE_URL\}\}"?/)
  })

  it("should use email-safe colors", () => {
    const html = generateEmailHtml(sampleMarkdown, null, sampleDate)
    // Check key color values are present
    expect(html).toContain("#fffbf5") // background
    expect(html).toContain("#3d3529") // text color
    expect(html).toContain("#1a1410") // heading color
    expect(html).toContain("#E8722A") // link/accent color
  })

  it("should escape HTML in audioUrl", () => {
    const maliciousUrl = 'https://example.com/audio.mp3?x=1&y=2"onload="alert(1)'
    const html = generateEmailHtml(sampleMarkdown, maliciousUrl, sampleDate)
    expect(html).not.toContain('"onload="alert(1)')
    expect(html).toContain("&amp;")
  })
})
