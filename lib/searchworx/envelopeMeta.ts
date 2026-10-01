/**
 * lib/searchworx/envelopeMeta.ts — the PII-free part of a Searchworx response envelope, for storage
 *
 * Data:   the parsed JSON body of one Searchworx REST response (pure — no I/O)
 * Notes:  ADDENDUM_14V §3.2a asks every pull to keep its envelope so a per-call cost field, if the
 *         vendor ever returns one, can be observed (`pull_observed`). The FULL envelope is the bureau
 *         report itself — ID number, accounts, judgments — and id_number is encrypted at rest
 *         everywhere (CLAUDE.md §4), so Stéan ruled 2026-10-01 to keep everything EXCEPT the payload:
 *
 *           · every top-level key except `ResponseObject` and `PDFCopyURL`, primitive values only
 *           · `SearchInformation` (search metadata, not subject data) minus `SearchDescription`, which
 *             can echo the subject's name or ID — primitive values only
 *           · the payload's top-level KEY NAMES, never its values
 *           · whether a PDF copy URL was present (the URL itself is a bearer link to the full report)
 *
 *         A billing field at envelope or SearchInformation level is therefore caught; one buried inside
 *         the payload is not, and none of the 13 vendor samples carries one anywhere (checked 2026-10-01).
 *         Denylist, not allowlist, on purpose: the column exists to catch a key nobody has named yet.
 */

export interface SearchworxEnvelopeMeta {
  /** Top-level envelope keys other than the payload and the PDF link, primitive values only. */
  top: Record<string, string | number | boolean | null>
  /** SearchInformation without SearchDescription, primitive values only; null when absent. */
  searchInformation: Record<string, string | number | boolean | null> | null
  /** Key names of the payload (of its first element when it is an array). */
  responseObjectKeys: string[]
  hasPdfCopyUrl: boolean
}

const DROPPED_TOP = new Set(["ResponseObject", "PDFCopyURL"])
const DROPPED_SEARCH_INFO = new Set(["SearchDescription"])

type Primitive = string | number | boolean | null

function isPrimitive(v: unknown): v is Primitive {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
}

function primitivesOf(obj: Record<string, unknown>, dropped: ReadonlySet<string>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (dropped.has(k) || !isPrimitive(v)) continue
    out[k] = v
  }
  return out
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function envelopeMeta(envelope: unknown): SearchworxEnvelopeMeta {
  const env = asRecord(envelope) ?? {}
  const ro = env.ResponseObject
  const payload = Array.isArray(ro) ? asRecord(ro[0]) : asRecord(ro)
  const si = asRecord(payload?.SearchInformation)
  return {
    top: primitivesOf(env, DROPPED_TOP),
    searchInformation: si ? primitivesOf(si, DROPPED_SEARCH_INFO) : null,
    responseObjectKeys: payload ? Object.keys(payload) : [],
    hasPdfCopyUrl: typeof env.PDFCopyURL === "string" && env.PDFCopyURL.length > 0,
  }
}
