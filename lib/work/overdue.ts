/**
 * lib/work/overdue.ts — "is this date in the past" helper for overdue warnings
 *
 * Notes:  Lives outside React components on purpose — the `new Date()` read is impure, which the
 *         react-hooks/purity rule flags inside render. Calling it from a component keeps render pure.
 */
export function isPastDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  return new Date(dateStr).getTime() < Date.now()
}
