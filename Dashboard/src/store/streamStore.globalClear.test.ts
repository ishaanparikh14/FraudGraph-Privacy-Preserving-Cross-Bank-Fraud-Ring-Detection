import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStreamStore } from './streamStore'

describe('useStreamStore — Global Clear (reset)', () => {
  beforeEach(() => {
    act(() => {
      useStreamStore.getState().reset()
    })
  })

  it('reset() empties transactions buffer', () => {
    act(() => {
      useStreamStore.getState().pushTransaction({
        txn_id: 'test-txn-1',
        source_account: 'ACCT_A',
        target_account: 'ACCT_B',
        amount: 500,
        timestamp: new Date().toISOString(),
        is_high_risk: false,
      })
    })
    expect(useStreamStore.getState().transactions).toHaveLength(1)
    act(() => {
      useStreamStore.getState().reset()
    })
    expect(useStreamStore.getState().transactions).toHaveLength(0)
  })

  it('reset() clears fraud alerts', () => {
    act(() => {
      useStreamStore.getState().pushFraudAlert({
        alert_id: 'alert-1',
        cycle_accounts: ['A', 'B'],
        edge_ids: [],
        reason: 'test ring',
      })
    })
    expect(useStreamStore.getState().fraudAlerts).toHaveLength(1)
    act(() => {
      useStreamStore.getState().reset()
    })
    expect(useStreamStore.getState().fraudAlerts).toHaveLength(0)
  })

  it('reset() sets connection back to idle', () => {
    act(() => {
      useStreamStore.setState({ connection: 'live' })
    })
    expect(useStreamStore.getState().connection).toBe('live')
    act(() => {
      useStreamStore.getState().reset()
    })
    expect(useStreamStore.getState().connection).toBe('idle')
  })

  it('reset() clears integration warnings', () => {
    act(() => {
      useStreamStore.getState().pushIntegrationWarnings(['Schema mismatch'])
    })
    expect(useStreamStore.getState().integrationWarnings.length).toBeGreaterThan(0)
    act(() => {
      useStreamStore.getState().reset()
    })
    expect(useStreamStore.getState().integrationWarnings).toHaveLength(0)
  })

  it('reset() nulls out metrics', () => {
    act(() => {
      useStreamStore.getState().setMetrics({
        throughput_per_sec: 42,
        total_processed: 1000,
        fraud_detected: 3,
        timestamp: new Date().toISOString(),
      })
    })
    expect(useStreamStore.getState().metrics).not.toBeNull()
    act(() => {
      useStreamStore.getState().reset()
    })
    expect(useStreamStore.getState().metrics).toBeNull()
  })
})
