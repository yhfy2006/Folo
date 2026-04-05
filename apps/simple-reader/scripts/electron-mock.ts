// Mock electron module for running pipeline stages outside Electron
export const app = {
  getAppPath: () => "/Users/yhfy2006/.superset/worktrees/Folo/sticky-rat/apps/simple-reader",
  getPath: (name: string) => {
    if (name === "userData") return "/Users/yhfy2006/Library/Application Support/simple-reader"
    return "/tmp"
  },
}
