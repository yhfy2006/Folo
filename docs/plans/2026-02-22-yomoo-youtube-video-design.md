# YOMOO 每日AI快送 — YouTube 视频自动化设计

## 概述

将现有的每日AI快送 pipeline 扩展，自动生成品牌化新闻播报视频并发布到 YouTube。视频使用 Remotion 渲染，Deepgram 对齐音频时间轴，YouTube Data API v3 上传。

## 决策记录

| 决策         | 选择                            | 理由                                                |
| ------------ | ------------------------------- | --------------------------------------------------- |
| 视频风格     | 新闻播报（文字动画 + 品牌元素） | 100% 可控，全自动，不依赖外部图片                   |
| 渲染引擎     | Remotion CLI 本地渲染           | 生态成熟，组件化开发，和 Electron pipeline 无缝集成 |
| 时间轴对齐   | Deepgram STT + 原文核验         | 精确 word-level timestamps，原文做 ground truth     |
| 视频时长     | 等于音频时长（5-20 分钟）       | 复用现有 TTS 音频，无需额外生成                     |
| YouTube 认证 | OAuth 2.0 + refresh_token       | YouTube API 要求，一次授权长期有效                  |

## 视频内容结构

```
[0s-5s]     品牌开场
             YOMOO logo 动画 + "每日AI快送" + 日期
             背景: 深色 (#1a1410) + 琥珀渐变光效

[5s-15s]    今日概览
             "今天有 N 条重点新闻" + 标题列表淡入

[15s~尾-30s] 新闻逐条播报
             每条新闻一个场景卡片：
               - 序号 (琥珀色大字) + 新闻标题 (白色粗体)
               - 来源标签 (灰色小字)
               - 2-3 个要点文字依次淡入
               - 场景间转场动画
             底部：持续显示进度条 (当前/总数)

[最后30s]   结尾
             订阅引导 + YOMOO 品牌 + "明天见"
```

### 视觉设计

- **分辨率**: 1920x1080 (16:9)
- **色彩**: YOMOO 品牌暖琥珀色调
  - 背景: #1a1410 (深棕黑)
  - 主色: #E8722A (琥珀橙)
  - 辅色: #D4A053 (金色)
  - 文字: #f5efe6 (暖白)
- **字体**: Noto Sans SC (正文), Playfair Display (品牌)
- **动效**: 文字淡入滑入、卡片切换、进度条推进

## 技术架构

### Pipeline 扩展

现有 5 阶段后新增 3 个：

```
Stage 1-5 (现有): Verify → Report → Podcast → Audio → Upload+Publish
    ↓
Stage 6: Audio Alignment (新增)
  Deepgram STT → word timestamps → 原文对齐核验 → scenes.json
    ↓
Stage 7: Video Render (新增)
  Remotion CLI 读取 scenes.json + audio → 渲染 MP4 + 封面 PNG
    ↓
Stage 8: YouTube Upload (新增)
  YouTube Data API v3 上传视频 + 设置封面/标题/描述
```

### 文件结构

```
apps/simple-reader/
  video/                          ← 新 Remotion 项目
    src/
      index.ts                    ← registerRoot entry
      Root.tsx                    ← 根组件，包含所有 Compositions
      DailyReport.tsx             ← 主 Composition（完整视频）
      Thumbnail.tsx               ← 封面图 Composition (1280x720)
      scenes/
        BrandIntro.tsx            ← 开场动画 (0-5s)
        Overview.tsx              ← 今日概览 (5-15s)
        NewsCard.tsx              ← 单条新闻卡片 (动态时长)
        Outro.tsx                 ← 结尾 (最后30s)
      components/
        ProgressBar.tsx           ← 底部进度条
        AnimatedText.tsx          ← 文字淡入/滑入动画
        TransitionWipe.tsx        ← 转场效果
        YomooLogo.tsx             ← 品牌 logo 组件
      styles/
        theme.ts                  ← 品牌色/字体/间距常量
    remotion.config.ts
    package.json                  ← remotion, @remotion/cli 等依赖
    tsconfig.json

  main/
    deepgram.ts                   ← 新：Deepgram STT API 客户端
    scene-generator.ts            ← 新：时间轴对齐 + Claude scenes.json 生成
    video-render.ts               ← 新：调用 Remotion CLI 渲染
    youtube.ts                    ← 新：YouTube Data API v3 客户端
    pipeline.ts                   ← 修改：增加 Stage 6-8
    preferences.ts                ← 修改：增加 deepgramApiKey, youtubeTokens
    ipc-handlers.ts               ← 修改：YouTube OAuth flow
    preload.ts                    ← 修改：YouTube 相关 API
```

### 数据流

#### Step 1: Deepgram 转录 + 时间戳

```
输入: podcast.mp3
调用: Deepgram Nova-3 API (pre-recorded, word timestamps)
输出:
{
  "results": {
    "channels": [{
      "alternatives": [{
        "words": [
          { "word": "大家好", "start": 0.5, "end": 1.2, "confidence": 0.98 },
          { "word": "欢迎", "start": 1.3, "end": 1.8, "confidence": 0.97 },
          ...
        ]
      }]
    }]
  }
}
```

#### Step 2: 原文对齐核验

```
输入: Deepgram words[] + 原始 podcast script
处理:
  1. 原始文案按段落分割
  2. 对每段文案，在 Deepgram words 中做 fuzzy matching 找到对应区间
  3. 文字内容以原文为准（STT 可能识别错专有名词）
  4. 时间以 Deepgram 为准
输出: 带精确时间戳的原始文案段落
[
  { "text": "大家好，欢迎收听...", "start": 0.5, "end": 15.2 },
  { "text": "今天的第一条新闻...", "start": 15.3, "end": 85.7 },
  ...
]
```

#### Step 3: Claude 生成 scenes.json

```
输入: 对齐后的段落 + 原始 report markdown
Claude 任务: 把段落按新闻主题分组，提取每条新闻的标题和要点
输出:
{
  "date": "2026-02-22",
  "title": "YOMOO 每日AI快送",
  "audioDuration": 600,
  "fps": 30,
  "scenes": [
    {
      "type": "intro",
      "start": 0, "end": 5
    },
    {
      "type": "overview",
      "start": 5, "end": 15.2,
      "headlines": ["OpenAI 发布 GPT-5", "Apple 推出 AI 芯片", ...]
    },
    {
      "type": "news",
      "start": 15.3, "end": 85.7,
      "index": 1, "total": 8,
      "title": "OpenAI 发布 GPT-5",
      "source": "TechCrunch",
      "points": [
        { "text": "性能提升 5 倍", "showAt": 25.0 },
        { "text": "原生多模态支持", "showAt": 40.0 },
        { "text": "价格降低 50%", "showAt": 55.0 }
      ]
    },
    ...
    {
      "type": "outro",
      "start": 570, "end": 600
    }
  ]
}
```

#### Step 4: Remotion 渲染

```bash
# 渲染完整视频
npx remotion render src/index.ts DailyReport \
  --output out/video.mp4 \
  --props scenes.json \
  --codec h264 \
  --fps 30

# 渲染封面
npx remotion still src/index.ts Thumbnail \
  --output out/thumbnail.png \
  --props scenes.json \
  --width 1280 --height 720
```

#### Step 5: YouTube 上传

```
POST https://www.googleapis.com/upload/youtube/v3/videos
  part=snippet,status
  snippet:
    title: "YOMOO 每日AI快送 — 2026-02-22"
    description: |
      今日AI快送：8条重点新闻
      1. OpenAI 发布 GPT-5
      2. Apple 推出 AI 芯片
      ...

      🔗 网页版: https://daily.yomoo.net/episodes/2026-02-22/index.html
      📧 订阅邮件: https://daily.yomoo.net/subscribe/index.html
      🎧 播客音频: [GitHub Release URL]
    tags: ["AI", "每日AI快送", "YOMOO", "科技新闻", "AI新闻"]
    categoryId: "28" (Science & Technology)
    defaultLanguage: "zh-CN"
  status:
    privacyStatus: "public"
    selfDeclaredMadeForKids: false

POST .../thumbnails/set?videoId={id}
  上传 thumbnail.png
```

## YouTube OAuth 认证流程

1. 用户在 Google Cloud Console 创建 OAuth Client (Desktop App)
2. 获取 `client_id` + `client_secret`，存入 Preferences
3. 首次使用：点击 "连接 YouTube" → 打开浏览器 → 用户授权
4. 回调获取 `authorization_code` → 交换 `access_token` + `refresh_token`
5. `refresh_token` 存入 Preferences（长期有效）
6. 后续自动用 `refresh_token` 获取新 `access_token`

所需 OAuth Scopes:

- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube` (封面设置)

## Preferences 新增字段

```typescript
interface UserPreferences {
  // ... 现有字段 ...
  deepgramApiKey: string // Deepgram API Key
  youtubeClientId: string // Google OAuth Client ID
  youtubeClientSecret: string // Google OAuth Client Secret
  youtubeRefreshToken: string // OAuth Refresh Token (自动获取)
  youtubeEnabled: boolean // 是否启用 YouTube 上传阶段
}
```

## UI 变化

### Pipeline 进度

8 阶段指示器：
Verify → Report → Podcast → Audio → Upload → Publish → **Video** → **YouTube**

### Preferences 新增

- Deepgram API Key 输入框
- YouTube 区块：Client ID/Secret + "连接 YouTube" 按钮 + 连接状态
- YouTube 开关（可以只生成视频不上传）

### 结果卡片

Pipeline 完成后显示：

- ✅ Published Page: [链接]
- ✅ Audio: [链接]
- ✅ **YouTube Video**: [链接]

## 依赖

### 新增 npm 依赖 (apps/simple-reader)

```
remotion, @remotion/cli, @remotion/bundler
  → Remotion 视频框架
```

### 新增依赖 (apps/simple-reader/video)

```
remotion, @remotion/cli
react, react-dom (Remotion 需要)
@remotion/media-utils (音频时长检测)
```

### 外部服务

| 服务                | 用途              | 费用                         |
| ------------------- | ----------------- | ---------------------------- |
| Deepgram Nova-3     | 音频转录 + 时间戳 | ~$0.04/10min                 |
| YouTube Data API v3 | 视频上传          | 免费 (配额 10,000 units/day) |
| Remotion            | 本地渲染          | 免费 (CLI)                   |

## 边界处理

- **渲染超时**: Remotion 渲染可能需要 2-5 分钟，UI 显示渲染进度
- **YouTube 配额**: 每天上传配额充足（每次上传消耗 ~1600 units，日配额 10,000）
- **OAuth 过期**: refresh_token 过期时提示用户重新授权
- **Deepgram 失败**: 降级为 Claude 估算时间轴（精度降低但仍可用）
- **长视频**: 20 分钟视频渲染约 5 分钟，显示进度百分比
- **封面**: 如果封面渲染失败，YouTube 会自动选取视频帧
