/**
 * components/detail/DetailPageLayout.tsx — the universal detail-page base (header + card grid)
 *
 * Notes:  ADDENDUM_DETAIL_PAGE_TEMPLATE §1a/§7 OQ1 — the ONE detail layout: a sticky DetailPageHeader over
 *         a 2-col card grid (single canonical layout; no two-col/stacked variants — that divergence is
 *         exactly what this template removes). Pages fill the grid with SectionCard body blocks; wrap a
 *         block in <DetailFullWidth> for a span-2 full-width row (photo, financials, activity). Actions
 *         live ONLY in the header toolbar (no QuickActions body block). Presentation-only.
 */
import type { ReactNode } from "react"
import { DetailPageHeader } from "./DetailPageHeader"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"

/** Wrap a body block to make it span both grid columns (full-width row). */
export function DetailFullWidth({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="md:col-span-2">{children}</div>
}

export function DetailPageLayout({
  category, backHref, title, status, badge, facts, actions, tabs, children,
}: Readonly<{
  category: string
  backHref: string
  title: ReactNode
  status?: DetailStatus
  /** optional type chip next to the status pill (e.g. UTILITY / SCHEME SERVICE / TRUST). */
  badge?: ReactNode
  facts: DetailFact[]
  actions?: ReactNode
  tabs?: ReactNode
  children: ReactNode
}>) {
  return (
    <div>
      <DetailPageHeader
        category={category}
        backHref={backHref}
        title={title}
        status={status}
        badge={badge}
        facts={facts}
        actions={actions}
        tabs={tabs}
      />
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">{children}</div>
    </div>
  )
}
