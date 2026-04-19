import { fileURLToPath } from "node:url"

import { app, BrowserWindow } from "electron"
import path from "pathe"

import { closeDatabase, initDatabase } from "./database"
import { registerIpcHandlers } from "./ipc-handlers"
import { initChannels } from "./pipeline/channel-init"
import { startPipelineScheduler, stopPipelineScheduler } from "./pipeline-scheduler"
import { registerBroadcastListener } from "./runtime/broadcast"
import { setAppPath, setIsPackaged, setUserDataPath } from "./runtime/paths"
import { startScheduler, stopScheduler } from "./scheduler"
import { initWorkspace } from "./workspace"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const preloadPath = path.join(__dirname, "../preload/preload.cjs")
  console.info("[main] preload path:", preloadPath)
  console.info("[main] ELECTRON_RENDERER_URL:", process.env.ELECTRON_RENDERER_URL)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Simple Reader",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"))
  }

  // Open DevTools in dev mode
  mainWindow.webContents.openDevTools()

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Bridge Electron's runtime paths into the shared shim so database, prefs,
  // and channel loader return the exact same paths they did before the CLI
  // was introduced.
  setUserDataPath(app.getPath("userData"))
  setAppPath(app.getAppPath())
  setIsPackaged(app.isPackaged)

  // Forward runtime broadcasts (feeds-updated, pipeline-auto-trigger) to all
  // renderer windows — same wiring that used to live inline.
  registerBroadcastListener((event, ...args) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(event, ...args)
    }
  })

  // Initialize database (async for sql.js WASM loading)
  await initDatabase()

  // Initialize Claude workspace (skills, CLAUDE.md)
  initWorkspace()

  // Initialize channels (copy bundled templates, auto-bind groups, sync V1 prefs)
  initChannels()

  // Register IPC handlers
  registerIpcHandlers()

  // Create window
  createWindow()

  // Start periodic fetching
  startScheduler()

  // Start pipeline scheduler
  startPipelineScheduler()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  stopScheduler()
  stopPipelineScheduler()
  closeDatabase()
  if (process.platform !== "darwin") {
    app.quit()
  }
})
