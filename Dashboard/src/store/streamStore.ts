import { create } from 'zustand'
import type {
  ConnectionState,
  FraudAlert,
  IngestedTransaction,
  TransactionMetric,
} from '../types/fraudStream'

const MAX_TRANSACTIONS = 800
const MAX_ALERTS = 50
const MAX_WARNINGS = 100

interface StreamState {
  connection: ConnectionState
  streamError: string | null
  integrationWarnings: string[]
  transactions: IngestedTransaction[]
  fraudAlerts: FraudAlert[]
  metrics: TransactionMetric | null

  setConnection: (s: ConnectionState) => void
  setStreamError: (e: string | null) => void
  pushTransaction: (t: IngestedTransaction) => void
  pushFraudAlert: (a: FraudAlert) => void
  setMetrics: (m: TransactionMetric) => void
  pushIntegrationWarnings: (w: string[]) => void
  clearIntegrationWarnings: () => void
  reset: () => void
}

export const useStreamStore = create<StreamState>((set) => ({
  connection: 'idle',
  streamError: null,
  integrationWarnings: [],
  transactions: [],
  fraudAlerts: [],
  metrics: null,

  setConnection: (connection) => set({ connection }),
  setStreamError: (streamError) => set({ streamError }),

  pushTransaction: (t) =>
    set((s) => ({
      transactions: [t, ...s.transactions].slice(0, MAX_TRANSACTIONS),
    })),

  pushFraudAlert: (a) =>
    set((s) => ({
      fraudAlerts: [a, ...s.fraudAlerts].slice(0, MAX_ALERTS),
    })),

  setMetrics: (metrics) => set({ metrics }),

  pushIntegrationWarnings: (w) =>
    set((s) => ({
      integrationWarnings: [
        ...w.map((msg) => `[${new Date().toISOString()}] ${msg}`),
        ...s.integrationWarnings,
      ].slice(0, MAX_WARNINGS),
    })),

  clearIntegrationWarnings: () => set({ integrationWarnings: [] }),

  reset: () =>
    set({
      connection: 'idle',
      streamError: null,
      integrationWarnings: [],
      transactions: [],
      fraudAlerts: [],
      metrics: null,
    }),
}))
