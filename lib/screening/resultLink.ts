/**
 * lib/screening/resultLink.ts — the N6 result link: a signed, stateless credential for one party's view of one assessment
 *
 * Auth:   the HMAC IS the credential — whoever holds the link may open it (the ruling's accepted risk, as for any emailed
 *         link). Every open re-checks the live row (lib/screening/resultView.ts), so the signature alone never shows data.
 * Data:   consent_log (the subject's stage-2 consent: metadata.group_clause_shown), applications /
 *         application_co_applicants (stage2_consent_log_id)
 * Notes:  Stéan 2026-10-05: signed stateless over (subject, application, purpose=result); expiry = the application's
 *         purge date; open-time re-check (application exists, group_clause_shown on this subject); a trail row per open;
 *         no change to the token table.
 *         · Expiry is the EARLIER of two dates. The purge date is not knowable when the link is minted — it is the
 *           terminal decision + 90 days, a future event — so it is enforced at open time, from the row (resultView.ts).
 *           But an approved or never-decided application has no purge date at all, and its link would then live for
 *           years in a mailbox (walker 14x-p5 F2). So the token also carries `iat` and dies RESULT_LINK_MAX_AGE_DAYS
 *           after it was minted — the purge window's own length. Decided in build; the ruling left those states open.
 *         · Signed with CONSENT_HMAC_SECRET ("POPIA consent link signing", lib/env.ts) over a `result:`-prefixed message,
 *           so a result signature can never be confused with the OTP hashes that secret also keys. No secret → no link
 *           (fail closed: N6 still goes, without one).
 *         · The gate is per recipient (14X §2: "the group_clause_shown flag is the gate, per recipient, not a release
 *           date"); counsel row 3b (policy §171 v1.5.1) shipped with this file (LEGAL_VERSIONS, asserted by test).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { optionalEnv } from "@/lib/env"
import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import type { TrailSubject } from "@/lib/screening/notificationTrail"

interface ResultPayload {
  v: 1
  p: "result"
  app: string
  st: TrailSubject["subjectType"]
  sid: string
  /** Minted at, epoch seconds. */
  iat: number
}

/** A link is dead this long after it was minted, whatever the application's state (the purge window's length). */
export const RESULT_LINK_MAX_AGE_DAYS = 90
const MAX_AGE_MS = RESULT_LINK_MAX_AGE_DAYS * 86_400_000
/** Clock skew tolerated on a token minted "in the future". */
const SKEW_MS = 5 * 60_000

const SUBJECT_TYPES: ReadonlySet<string> = new Set(["applicant", "company", "co_applicant"])

function secret(): string | null {
  return optionalEnv("CONSENT_HMAC_SECRET") || null
}

function sign(key: string, body: string): string {
  return createHmac("sha256", key).update(`result:${body}`).digest("base64url")
}

/** Mint the link token for one party of one application, or null when no signing secret is configured. */
export function signResultToken(applicationId: string, subject: TrailSubject, now: Date = new Date()): string | null {
  const key = secret()
  if (!key) return null
  const payload: ResultPayload = {
    v: 1, p: "result", app: applicationId, st: subject.subjectType, sid: subject.subjectId, iat: Math.floor(now.getTime() / 1000),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${body}.${sign(key, body)}`
}

/** Verify a link token. Any tamper, malformed input, wrong purpose, age past the cap, or missing secret → null. */
export function verifyResultToken(
  token: string | null | undefined, now: Date = new Date(),
): { applicationId: string; subject: TrailSubject } | null {
  const key = secret()
  if (!key || !token) return null
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null
  const body = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(key, body))
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload: Partial<ResultPayload>
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<ResultPayload>
  } catch {
    return null
  }
  if (payload.v !== 1 || payload.p !== "result" || typeof payload.app !== "string" || typeof payload.sid !== "string"
    || typeof payload.st !== "string" || !SUBJECT_TYPES.has(payload.st) || typeof payload.iat !== "number") return null
  const age = now.getTime() - payload.iat * 1000
  if (age > MAX_AGE_MS || age < -SKEW_MS) return null
  return { applicationId: payload.app, subject: { subjectType: payload.st, subjectId: payload.sid } }
}

function resultUrl(token: string): string {
  return absoluteUrl(`/apply/result/${token}`)
}

/**
 * Did THIS subject's stage-2 consent include the group block? Reads the consent_log row the subject's own row points at
 * (applications for the lead, application_co_applicants for a co party), org-scoped. False when there is no consent row
 * or the flag is absent — a consent given before P5 carries none, and that party has not consented to the sharing.
 * Throws on a read error; callers decide which way to fail.
 */
export async function groupClauseShownFor(
  db: SupabaseClient, orgId: string, applicationId: string, subject: TrailSubject,
): Promise<boolean> {
  const lead = subject.subjectType !== "co_applicant"
  if (lead && subject.subjectId !== applicationId) return false
  const { data: row, error } = lead
    ? await db.from("applications").select("stage2_consent_log_id")
      .eq("id", applicationId).eq("org_id", orgId).maybeSingle()
    : await db.from("application_co_applicants").select("stage2_consent_log_id")
      .eq("id", subject.subjectId).eq("primary_application_id", applicationId).eq("org_id", orgId).maybeSingle()
  if (error) throw new Error(`result link: read consent pointer: ${error.message}`)
  const logId = (row as { stage2_consent_log_id?: string | null } | null)?.stage2_consent_log_id
  if (!logId) return false
  const { data: log, error: logError } = await db
    .from("consent_log")
    .select("metadata")
    .eq("id", logId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (logError) throw new Error(`result link: read consent: ${logError.message}`)
  const metadata = (log as { metadata?: Record<string, unknown> | null } | null)?.metadata
  return metadata?.group_clause_shown === true && metadata?.application_id === applicationId
}

/** The N6 link for one recipient, or null when its consent did not include the group block (or nothing can sign). */
export async function outcomeLinkFor(
  db: SupabaseClient, orgId: string, applicationId: string, subject: TrailSubject,
): Promise<string | null> {
  if (!(await groupClauseShownFor(db, orgId, applicationId, subject))) return null
  const token = signResultToken(applicationId, subject)
  return token ? resultUrl(token) : null
}
