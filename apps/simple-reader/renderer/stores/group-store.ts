import { create } from "zustand"

export interface FeedGroup {
  id: string
  name: string
  language: string | null
  report_style: string | null
  interests: string | null
  time_range: number | null
  pipeline_schedule: string | null
  created_at: number
}

interface GroupState {
  groups: FeedGroup[]
  selectedGroupId: string | null

  setGroups: (groups: FeedGroup[]) => void
  setSelectedGroupId: (id: string | null) => void

  loadGroups: () => Promise<void>
}

export const useGroupStore = create<GroupState>((set) => ({
  groups: [],
  selectedGroupId: null,

  setGroups: (groups) => set({ groups }),
  setSelectedGroupId: (id) => set({ selectedGroupId: id }),

  loadGroups: async () => {
    const groups = await window.api.getFeedGroups()
    set({ groups })
  },
}))
