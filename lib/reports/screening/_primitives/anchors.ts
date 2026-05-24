/**
 * lib/reports/screening/_primitives/anchors.ts — Doctrinal anchor-id normalisation
 *
 * Notes:  Shared seam between _pdf/ and _web/ surfaces. Used by SectionHeader,
 *         BlockHeader, dimension-card chips, FitScoreReport section wrappers,
 *         and SectionNav. Future PDF anchored links + L2 / commercial deep-links
 *         route through here.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7, DOCTRINE.md "Web anchor id convention".
 */

export function toDocAnchorId(docRef: string): string {
  return "fs-" + docRef.toLowerCase().replaceAll(".", "-")
}
