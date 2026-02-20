# AI Daily Report Feature Design

## Overview

Electron 内置的 AI 报告功能，通过 Claude CLI 对过去 N 小时的 feed 内容生成早晚报风格的摘要报告。

## Architecture

```
用户点击"生成报告"
    ↓
主进程查询 entries（过去 N 小时 + feed 信息）
    ↓
第一轮：title + description 发给 Claude CLI 筛选有价值的 entry
    ↓
第二轮：对有价值的 entry 传入 full content（甚至抓取原文）
    ↓
Claude CLI 生成完整报告
    ↓
流式输出到渲染进程 → 实时渲染 Markdown
    ↓
完成后可导出为 .md 文件
```

## Technical Approach

- **AI 调用方式**：`child_process.spawn("claude", ["--print", "-p", prompt])` 调用 Claude Code CLI
- **两阶段分析**：
  1. 筛选阶段：传入所有 entry 的 title + description，AI 返回值得深读的 entry ID 列表
  2. 深读阶段：传入筛选出的 entry 的 full content + 原文内容，生成最终报告
- **原文抓取**：对有 URL 的 entry，用 fetch + readability 提取原文正文
- **流式输出**：通过 IPC 推送 stdout chunks 到渲染进程

## New Files

| File                                        | Purpose                                       |
| ------------------------------------------- | --------------------------------------------- |
| `main/ai-report.ts`                         | Claude CLI 调用，两阶段 prompt 构建，流式输出 |
| `main/preferences.ts`                       | 用户偏好 JSON 文件读写                        |
| `main/readability.ts`                       | 抓取原文 URL 并提取正文                       |
| `renderer/components/ReportView.tsx`        | 报告 Markdown 渲染 + 导出                     |
| `renderer/components/PreferencesDialog.tsx` | 偏好设置弹窗                                  |
| `renderer/stores/report-store.ts`           | 报告状态管理                                  |

## User Preferences

Stored at `{userData}/simple-reader-preferences.json`:

```typescript
interface UserPreferences {
  language: string // "zh-CN" | "en" | "ja" | custom
  interests: string[] // ["AI", "技术", "创业", ...]
  reportStyle: "concise" | "detailed"
  timeRange: number // hours: 12 | 24 | 48
}
```

## UI

- FeedSidebar 底部添加 "AI Report" 按钮
- 点击后右侧切换为 ReportView
- ReportView：时间范围/语言快捷设置 + 流式 Markdown 渲染 + 导出按钮
- PreferencesDialog：完整偏好设置弹窗
