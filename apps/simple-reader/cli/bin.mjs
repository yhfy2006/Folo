#!/usr/bin/env node
// Thin shim so `bin` entries in package.json still work before a bundled build
// exists. For Phase 1 we invoke tsx's CLI loader directly. Phase 2 will replace
// this with a bundled dist/cli/index.js entry.
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))

const entry = path.join(here, "index.ts")
const tsxBin = require.resolve("tsx/cli")

const child = spawn(process.execPath, [tsxBin, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
