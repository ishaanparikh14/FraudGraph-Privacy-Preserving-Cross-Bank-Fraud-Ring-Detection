export function MissingFieldBadge({ field }: { field: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-900 bg-amber-950/40 px-1.5 py-0.5 font-mono text-xs text-amber-500">
      ⚠ {field} missing
    </span>
  )
}
