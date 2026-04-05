// ESM loader hook that intercepts `electron` imports
// and provides a minimal mock for CLI usage outside Electron.

import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(__dirname, "..")
const USER_DATA = path.join(
  process.env.HOME || "/tmp",
  "Library",
  "Application Support",
  "simple-reader",
)

const mockSource = `
export const app = {
  getPath(name) {
    const paths = {
      userData: ${JSON.stringify(USER_DATA)},
      temp: "/tmp",
      home: ${JSON.stringify(process.env.HOME || "/tmp")},
    };
    return paths[name] || "/tmp";
  },
  getAppPath() {
    return ${JSON.stringify(APP_ROOT)};
  },
};
export const ipcMain = { handle() {} };
export const BrowserWindow = { getAllWindows() { return []; }, fromWebContents() { return null; } };
export const dialog = {};
export const ipcRenderer = { invoke() {}, on() {}, removeListener() {} };
export default { app, ipcMain, BrowserWindow, dialog, ipcRenderer };
`

const mockDataUrl = `data:text/javascript;base64,${Buffer.from(mockSource).toString("base64")}`

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") {
    return { shortCircuit: true, url: mockDataUrl }
  }
  return nextResolve(specifier, context)
}
