# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Folo is an open-source content aggregation and feed reader. It organizes RSS feeds, news, and content into a unified timeline with AI-powered features (translation, summarization, discovery). Licensed under AGPL-3.0.

## Monorepo Structure

- **Package manager**: pnpm@10.17.0 with Corepack (`corepack enable && corepack prepare`)
- **Build orchestration**: Turbo
- **Module type**: ES modules throughout (`"type": "module"`)

```
apps/
  desktop/     # Electron app (Vite + React renderer is the primary web app)
  mobile/      # React Native app (Expo-based)
  ssr/         # Minimal SSR site for external sharing (Fastify)
packages/
  internal/    # Shared packages (@follow/atoms, components, store, database, hooks, utils, etc.)
  configs/     # Shared Tailwind & TSConfig
  readability/ # Standalone readability extraction
```

## Common Commands

```bash
# Install
pnpm install

# Development (web in browser — recommended)
cd apps/desktop && pnpm run dev:web

# Development (full Electron)
cd apps/desktop && pnpm run dev:electron

# Development (mobile)
cd apps/mobile && pnpm run ios    # or: pnpm run android

# Development (SSR)
cd apps/ssr && pnpm run dev

# Build
pnpm run build:web               # Build web version
pnpm run build:packages          # Build all packages

# Quality gates (run in this order)
pnpm run typecheck               # 1. TypeScript checking
pnpm run lint:fix                # 2. Lint and auto-fix
pnpm run test                    # 3. Vitest tests (CI mode)

# Formatting
pnpm run format                  # Prettier format all
pnpm run format:check            # Check formatting only

# Shorthand: all checks at once
npm exec turbo run format:check typecheck lint
npm exec turbo run test
```

Pre-commit hooks run `eslint --fix` and `prettier --write` via lint-staged.

## Architecture

### State Management

- **Jotai** — atomic state for simple reactive values (`packages/internal/atoms`)
- **Zustand** — complex stores with action modules (`packages/internal/store`)
- **TanStack Query** — server state and caching

### Database

- **Drizzle ORM + SQLite** — schemas in `packages/internal/database/src/drizzle/`
- Platform adapters: `db.desktop.ts` (wa-sqlite), `db.rn.ts` (expo-sqlite)
- Services layer in `packages/internal/database/src/services/`

### Desktop App Layout

- Main process: `apps/desktop/layer/main/`
- Renderer (Vite + React SPA): `apps/desktop/layer/renderer/`
- Feature modules: `apps/desktop/layer/renderer/src/modules/` (action, ai-chat, entry-column, discover, etc.)

### Mobile App Layout

- React Native + Expo with native modules in `apps/mobile/native/`
- Feature modules in `apps/mobile/src/modules/`, screens in `src/screens/`

### Import Conventions

- Desktop renderer uses `~/*` path alias for `apps/desktop/layer/renderer/src/`
- Shared packages imported as `@follow/<package>` (e.g., `@follow/components`, `@follow/utils`)

### i18n

- i18next with flat keys only (no `defaultValue`). Avoid conflicting dotted keys.
- Locale files in `locales/`. Provide `en`, `zh-CN`, `ja` for each feature.

## Code Style & Conventions

- TypeScript strict mode; avoid `any` — use precise types
- Comments in English
- Use `pathe` instead of `node:path` for cross-platform paths
- Don't use global `location` — use `useLocation` or `getReadonlyRoute` for route info
- Self-closing JSX components (`@stylistic/jsx-self-closing-comp`)
- Avoid inline styles in JSX; extract complex styles to `styles.ts` alongside the component
- Prefer CSS transitions/animations for simple UI interactions; use JS motion only when necessary

## UI Design System

UI follows Vercel/Linear SaaS aesthetics — clean, modern, minimal.

### Desktop/Web Colors (Apple UIKit system)

Tailwind classes bound to Apple UIKit color tokens (auto light/dark):

- System: `text-red`, `bg-blue`, `border-gray`, etc.
- Fill: `bg-fill`, `bg-fill-secondary`, ..., `bg-fill-vibrant`, etc.
- Text: `text-text`, `text-text-secondary`, `text-text-tertiary`, etc.
- Material: `bg-material-ultra-thick|thick|medium|thin|ultra-thin|opaque`
- Interface: `bg-menu`, `bg-popover`, `bg-sidebar`, `bg-tooltip`, etc.

### Mobile Colors (React Native UIKit)

NativeWind with `react-native-uikit-colors`:

- Backgrounds: `system-background`, `secondary-system-background`, `tertiary-system-background`
- Labels: `label`, `secondary-label`, `tertiary-label`, `quaternary-label`
- Fills: `system-fill`, `secondary-system-fill`, etc.

### Icons

- Desktop/Web: MingCute icons with `i-mgc-` prefix (e.g., `i-mgc-copy-cute-re`). Use `i-mingcute-` only as fallback.
- Mobile: icons from `apps/mobile/src/icons` only.

### Motion (Desktop/Web)

- Use `m.div` (not `motion.div`) — LazyMotion integration: `import { m } from 'motion/react'`
- Spring presets from `@follow/components/constants/spring.js`: `Spring.presets.smooth`, `Spring.presets.snappy`, `Spring.presets.bouncy`
- CSS transitions first for simple effects; Framer Motion only when needed

### Glassmorphic Depth System

Elevated components (modals, toasts, floating panels) use:

- Heavy backdrop blur (`backdrop-blur-2xl`)
- Accent color `--fo-a` at 5-20% opacity for borders/glows
- Layered shadows with accent tint
- See `apps/desktop/AGENTS.md` for full implementation patterns

## Component Placement

1. Check existing components in `apps/desktop/layer/renderer/src/modules/` first
2. Generic, reusable components go in `packages/internal/components`
3. App-specific UI stays in its app directory
4. Mobile: use NativeWind (not `StyleSheet.create`) for new UI

## Subproject Guides

Each app has its own `AGENTS.md` with platform-specific rules:

- `apps/desktop/AGENTS.md` — UIKit colors, icons, Framer Motion, glassmorphic depth details
- `apps/mobile/AGENTS.md` — React Native UIKit colors

The closest guide to the edited file takes precedence when rules conflict.
