/**
 * components/detail/DetailSection.tsx — bare card wrapper for an editable detail body block
 *
 * Notes:  ADDENDUM_DETAIL_PAGE_TEMPLATE §4 Phase 1. The contact trio's former sidebar sections (contact,
 *         rates, banking, address, portal) each own their uppercase label + inline edit toggle, so they
 *         don't need SectionCard's titled header — they just need card chrome to sit in the grid. This is
 *         the same `Card p-4` the retired ContactSidebar used, applied per-section. Data sections that want
 *         a titled header + count badge keep using SectionCard; this is for the self-titling edit sections.
 */
import type { ReactNode } from "react"

export function DetailSection({ children }: Readonly<{ children: ReactNode }>) {
  // Same chrome as DetailCard (square, amber bottom-border accent) so the self-titled edit sections
  // (banking, portal, …) match the titled DetailCards in the grid.
  return <div className="rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-4">{children}</div>
}
