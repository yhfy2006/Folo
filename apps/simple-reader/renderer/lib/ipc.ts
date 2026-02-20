import type { SimpleReaderAPI } from "../../main/preload"

declare global {
  interface Window {
    api: SimpleReaderAPI
  }
}

export const ipc = window.api
