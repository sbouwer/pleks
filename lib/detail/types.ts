/**
 * lib/detail/types.ts — shared config types for the universal detail-page template (ADDENDUM_DETAIL_PAGE_TEMPLATE)
 *
 * Notes:  The base (DetailPageLayout/Header/Quickbar) takes ONLY this config + body-block slots. Icons are
 *         referenced by name (string) so a server page can declare actions without crossing the client
 *         boundary with component references; DetailQuickbar maps names → lucide icons.
 */

/** A key fact in the header strip (e.g. Landlord · Tenant · Rent). `mono` for money/figures. */
export interface DetailFact {
  k: string
  v: string
  mono?: boolean
  tone?: "ok"
}

/** Status pill kind → colour (green / amber / red / neutral). */
export interface DetailStatus {
  kind: "occupied" | "vacant" | "flag" | "neutral"
  label: string
}

/** A quick-action in the header toolbar. href = navigation; icon = a name DetailQuickbar maps. */
export interface DetailAction {
  key: string
  label: string
  /** label shown when the toolbar expands (≥1440px); defaults to `label`. */
  short?: string
  icon: string
  href?: string
  danger?: boolean
}

/** An opt-in tab (off by default; dense entities like property use it). */
export interface DetailTab {
  id: string
  label: string
  count?: number
}
