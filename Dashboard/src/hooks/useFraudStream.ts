import { Client, type IMessage } from '@stomp/stompjs'
import { useEffect } from 'react'
import SockJS from 'sockjs-client'
import {
  parseFraudAlertBody,
  parseMetricsBody,
  parseTransactionBody,
} from '../lib/stompBodyParsers'
import { useStreamStore } from '../store/streamStore'

const DEFAULT_STOMP = 'http://127.0.0.1:8080/ws'

function unwrapEnvelope(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if ((o.type === 'ML_FLAG' || o.type === 'RING_DETECTED') && o.payload !== undefined) {
      return o.payload
    }
  }
  return raw
}

export function useFraudStream() {
  useEffect(() => {
    const store = useStreamStore.getState()
    const stompUrl = import.meta.env.VITE_STOMP_URL ?? DEFAULT_STOMP

    const client = new Client({
      reconnectDelay: 4000,
      webSocketFactory: () => new SockJS(stompUrl),
      debug: (msg) => {
        if (import.meta.env.DEV) console.debug('[STOMP]', msg)
      },
    })

    const handleTransactionMessage = (message: IMessage) => {
      let raw: unknown
      try {
        raw = JSON.parse(message.body)
      } catch {
        store.pushIntegrationWarnings(['Non-JSON body on /topic/transactions'])
        return
      }
      const body = unwrapEnvelope(raw)
      const parsed = parseTransactionBody(body)
      if (parsed.ok) {
        store.pushTransaction(parsed.data)
        return
      }
      store.pushIntegrationWarnings([`Transaction dropped: ${parsed.reason}`])
    }

    const handleAlertMessage = (message: IMessage) => {
      let raw: unknown
      try {
        raw = JSON.parse(message.body)
      } catch {
        store.pushIntegrationWarnings(['Non-JSON body on /topic/fraud-alerts'])
        return
      }
      const body = unwrapEnvelope(raw)
      const parsed = parseFraudAlertBody(body)
      if (parsed.ok) {
        store.pushFraudAlert(parsed.data)
        return
      }
      store.pushIntegrationWarnings([`Fraud alert dropped: ${parsed.reason}`])
    }

    const handleMetricsMessage = (message: IMessage) => {
      let raw: unknown
      try {
        raw = JSON.parse(message.body)
      } catch {
        store.pushIntegrationWarnings(['Non-JSON body on /topic/metrics'])
        return
      }
      const body = unwrapEnvelope(raw)
      const parsed = parseMetricsBody(body)
      if (parsed.ok) {
        store.setMetrics(parsed.data)
        return
      }
      store.pushIntegrationWarnings([`Metrics dropped: ${parsed.reason}`])
    }

    client.onConnect = () => {
      store.setConnection('live')
      store.setStreamError(null)
      client.subscribe('/topic/transactions', handleTransactionMessage)
      client.subscribe('/topic/fraud-alerts', handleAlertMessage)
      client.subscribe('/topic/metrics', handleMetricsMessage)
    }

    client.onStompError = (frame) => {
      const msg = frame.headers['message'] ?? frame.body ?? 'STOMP broker error'
      store.setStreamError(String(msg))
    }

    client.onWebSocketClose = () => {
      if (useStreamStore.getState().connection !== 'idle') {
        useStreamStore.getState().setConnection('reconnecting')
      }
    }

    client.onWebSocketError = () => {
      useStreamStore.getState().setConnection('reconnecting')
    }

    store.setConnection('connecting')
    client.activate()

    return () => {
      void client.deactivate()
      useStreamStore.getState().setConnection('idle')
    }
  }, [])
}
