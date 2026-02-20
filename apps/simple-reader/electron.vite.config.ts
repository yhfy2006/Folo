import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import autoprefixer from "autoprefixer"
import { defineConfig } from "electron-vite"
import { resolve } from "pathe"
import tailwindcss from "tailwindcss"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__dirname, "main/index.ts"),
      },
      rollupOptions: {
        external: ["sql.js"],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__dirname, "main/preload.ts"),
        formats: ["cjs"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "preload.cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "renderer"),
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "renderer/index.html"),
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    },
    plugins: [react()],
  },
})
