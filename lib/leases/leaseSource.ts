/**
 * lib/leases/leaseSource.ts — the lease-source seam: how a lease's document comes to exist
 *
 * Auth:   none (pure; safe in client and server code)
 * Data:   interprets leases.template_source and organisations.default_lease_document_source
 * Notes:  Every "is this lease generated or uploaded?" decision reads a PROFILE from here, never compares
 *         template_source to a string literal. There are TWO lease sources, and only two (Stéan, 2026-10-09):
 *           'pleks'    — OUR lease: Pleks renders it from its template + clause library (generate-docx).
 *           'uploaded' — the CLIENT'S lease (the agency's own). Today the agency produces the document outside
 *                        Pleks and uploads it, so Pleks renders nothing.
 *         Next, the client's lease can be SET UP in Pleks — the agency's template with input fields defined on it,
 *         which Pleks then fills — and the agency either sets it up itself or pays Pleks to. Who set it up is a
 *         fact about the TEMPLATE, not a third lease source: do not add one. When it lands:
 *           1. 'uploaded' stays the source; its profile becomes a function of whether the lease references a
 *              set-up agency template (rendersDocument true then, false for a plain uploaded document);
 *           2. the template reference: the unused lease_templates table and leases.core_template_id (004) are
 *              the schema's existing slot (ADDENDUM_04B Axis B); the setup channel (self / Pleks paid) belongs on
 *              the template row. organisations.custom_template_* + custom_lease_requests are the older paid-setup
 *              pipeline, disconnected from generation — reuse or retire deliberately, never duplicate;
 *           3. schema changes amend forward in the domain file (008 is protected; never a new migration file).
 *         Grep for leaseSourceProfile( to find every consumer that branches on the profile.
 *         The org default column speaks a different vocabulary ('external', not 'uploaded'); the two
 *         mappers below are the only translation between them.
 */

export const LEASE_SOURCES = ["pleks", "uploaded"] as const
export type LeaseSource = (typeof LEASE_SOURCES)[number]

/** organisations.default_lease_document_source — null means "decide per lease". */
export const ORG_LEASE_SOURCE_DEFAULTS = ["pleks", "external"] as const
export type OrgLeaseSourceDefault = (typeof ORG_LEASE_SOURCE_DEFAULTS)[number]

interface LeaseSourceProfile {
  source: LeaseSource
  /** Pleks renders the lease document itself (generate-docx, DocuSeal send, print-and-sign download). */
  rendersDocument: boolean
  /** The clause library + per-lease clause selections apply, so the clauses prerequisite is checked. */
  usesClauseLibrary: boolean
  /** The agent must accept the Pleks template disclaimer before creating it. */
  requiresTemplateDisclaimer: boolean
}

const PROFILES: Record<LeaseSource, LeaseSourceProfile> = {
  pleks: { source: "pleks", rendersDocument: true, usesClauseLibrary: true, requiresTemplateDisclaimer: true },
  uploaded: { source: "uploaded", rendersDocument: false, usesClauseLibrary: false, requiresTemplateDisclaimer: false },
}

function isLeaseSource(raw: unknown): raw is LeaseSource {
  return typeof raw === "string" && (LEASE_SOURCES as readonly string[]).includes(raw)
}

export function isOrgLeaseSourceDefault(raw: unknown): raw is OrgLeaseSourceDefault {
  return typeof raw === "string" && (ORG_LEASE_SOURCE_DEFAULTS as readonly string[]).includes(raw)
}

/**
 * The profile for a stored template_source — for DISPLAY decisions. The column is NOT NULL DEFAULT 'pleks' with
 * a CHECK, so an unrecognised value can only come from a deploy that read a value a newer build wrote; it falls
 * back to 'pleks', the column default, rather than throw on a page render. Write paths use rendersLeaseDocument.
 */
export function leaseSourceProfile(raw: unknown): LeaseSourceProfile {
  return PROFILES[isLeaseSource(raw) ? raw : "pleks"]
}

/**
 * STRICT: may Pleks render (or send for signing) this lease's document? Unlike leaseSourceProfile, an
 * unknown value answers NO — a write path must not resolve a source it does not know to the most permissive
 * profile, or an older build would render a Pleks template over a newer source's document (walker F1, arc 2).
 */
export function rendersLeaseDocument(raw: unknown): boolean {
  return isLeaseSource(raw) && PROFILES[raw].rendersDocument
}

/** The org's stored default, as a per-lease source; null when the org decides per lease. */
export function leaseSourceFromOrgDefault(raw: unknown): LeaseSource | null {
  if (raw === "pleks") return "pleks"
  if (raw === "external") return "uploaded"
  return null
}
