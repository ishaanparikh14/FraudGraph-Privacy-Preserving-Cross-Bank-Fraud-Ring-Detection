import { formatDetectionMethodFromPayload } from './fraudAlertDetectionLabel'
import type { FraudAlert } from '../types/fraudStream'
import type { GraphEngineRing } from '../types/graphEngine'

export function detectionMethodLabel(
  picked: GraphEngineRing | null,
  alert: FraudAlert | null | undefined,
): string | null {
  const raw = picked?.detection_method?.trim() || alert?.detection_method?.trim()
  if (!raw) return null
  return formatDetectionMethodFromPayload(raw) || null
}
