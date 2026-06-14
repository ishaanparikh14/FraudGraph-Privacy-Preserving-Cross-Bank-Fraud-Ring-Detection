import { create } from 'zustand'

interface DashboardUiState {
  pinnedTxnIdForXai: string | null
  setPinnedTxnIdForXai: (id: string | null) => void
}

export const useDashboardUiStore = create<DashboardUiState>((set) => ({
  pinnedTxnIdForXai: null,
  setPinnedTxnIdForXai: (id) => set({ pinnedTxnIdForXai: id }),
}))
