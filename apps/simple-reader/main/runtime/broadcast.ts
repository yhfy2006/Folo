/**
 * Minimal broadcast channel so `scheduler.ts` / `pipeline-scheduler.ts` can
 * notify listeners without importing `BrowserWindow`. In Electron, the main
 * process registers a sender that forwards to the renderer; in CLI we attach
 * a no-op (or a log listener if `--verbose`).
 */
export type BroadcastListener = (event: string, ...args: unknown[]) => void

const listeners = new Set<BroadcastListener>()

export function registerBroadcastListener(listener: BroadcastListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function broadcast(event: string, ...args: unknown[]): void {
  for (const listener of listeners) {
    try {
      listener(event, ...args)
    } catch (err) {
      console.warn("[broadcast] listener threw:", err)
    }
  }
}
