export function ingestionApiBase(): string {
  const v = import.meta.env.VITE_INGESTION_BASE_URL
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return '/person1-api'
}
