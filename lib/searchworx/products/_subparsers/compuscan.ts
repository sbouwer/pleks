/**
 * lib/searchworx/products/_subparsers/compuscan.ts — CompuScan node parser (stub)
 *
 * Notes:  CompuScan (DataSupplier 6) was SERVICE OFFLINE in the 2026-05-18 Combined capture.
 *         Stub returns minimal typed shape. Populate when CompuScan UAT comes back online
 *         and a real CompuScanInfo block is captured in brief/vendors/searchworx/raw/.
 */

export interface CompuScanParsed {
  _stub: true
}

export function parseCompuScanNode(_raw: unknown): CompuScanParsed {
  return { _stub: true }
}
