/**
 * lib/searchworx/products/_subparsers/experian.ts — Experian (non-Sigma) node parser (stub)
 *
 * Notes:  Experian (distinct from Experian Sigma / CompuScan) was SERVICE OFFLINE in the
 *         2026-05-18 Combined capture. Stub returns minimal typed shape. Populate when
 *         bureau comes back online and a real ExperianInfo block is captured.
 *         Note: Experian Sigma (DataSupplier 9, via CompuScan) is a separate sub-parser.
 */

export interface ExperianParsed {
  _stub: true
}

export function parseExperianNode(_raw: unknown): ExperianParsed {
  return { _stub: true }
}
