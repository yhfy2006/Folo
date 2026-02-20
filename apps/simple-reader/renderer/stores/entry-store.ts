import { create } from "zustand"

export interface Entry {
  id: string
  feed_id: string
  guid: string
  title: string | null
  url: string | null
  content: string | null
  description: string | null
  author: string | null
  published_at: number | null
  inserted_at: number
  read: number
}

interface EntryState {
  entries: Entry[]
  selectedEntryId: string | null
  selectedEntry: Entry | null
  loading: boolean

  setEntries: (entries: Entry[]) => void
  setSelectedEntryId: (id: string | null) => void
  setSelectedEntry: (entry: Entry | null) => void
  setLoading: (loading: boolean) => void

  loadEntries: (feedId?: string) => Promise<void>
  loadEntry: (entryId: string) => Promise<void>
  markAsRead: (entryId: string) => Promise<void>
}

export const useEntryStore = create<EntryState>((set, _get) => ({
  entries: [],
  selectedEntryId: null,
  selectedEntry: null,
  loading: false,

  setEntries: (entries) => set({ entries }),
  setSelectedEntryId: (id) => set({ selectedEntryId: id }),
  setSelectedEntry: (entry) => set({ selectedEntry: entry }),
  setLoading: (loading) => set({ loading }),

  loadEntries: async (feedId?: string) => {
    set({ loading: true })
    const entries = await window.api.getEntries(feedId)
    set({ entries, loading: false })
  },

  loadEntry: async (entryId: string) => {
    const entry = await window.api.getEntry(entryId)
    set({ selectedEntry: entry, selectedEntryId: entryId })
  },

  markAsRead: async (entryId: string) => {
    await window.api.markRead(entryId)
    set((state) => ({
      entries: state.entries.map((e) => (e.id === entryId ? { ...e, read: 1 } : e)),
      selectedEntry:
        state.selectedEntry?.id === entryId
          ? { ...state.selectedEntry, read: 1 }
          : state.selectedEntry,
    }))
  },
}))
