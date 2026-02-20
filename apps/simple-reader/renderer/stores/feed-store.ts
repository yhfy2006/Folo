import { create } from "zustand"

export interface Feed {
  id: string
  title: string | null
  url: string
  site_url: string | null
  description: string | null
  image: string | null
  category: string | null
  error_at: string | null
  error_message: string | null
  last_fetched_at: string | null
}

interface FeedState {
  feeds: Feed[]
  selectedFeedId: string | null
  unreadCounts: Record<string, number>
  loading: boolean

  setFeeds: (feeds: Feed[]) => void
  setSelectedFeedId: (id: string | null) => void
  setUnreadCounts: (counts: Record<string, number>) => void
  setLoading: (loading: boolean) => void

  loadFeeds: () => Promise<void>
  loadUnreadCounts: () => Promise<void>
}

export const useFeedStore = create<FeedState>((set) => ({
  feeds: [],
  selectedFeedId: null,
  unreadCounts: {},
  loading: false,

  setFeeds: (feeds) => set({ feeds }),
  setSelectedFeedId: (id) => set({ selectedFeedId: id }),
  setUnreadCounts: (counts) => set({ unreadCounts: counts }),
  setLoading: (loading) => set({ loading }),

  loadFeeds: async () => {
    const feeds = await window.api.getFeeds()
    set({ feeds })
  },

  loadUnreadCounts: async () => {
    const counts = await window.api.getUnreadCounts()
    set({ unreadCounts: counts })
  },
}))
