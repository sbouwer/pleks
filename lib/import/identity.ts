/**
 * lib/import/identity.ts — is this person ALREADY in the system? Identity first, email second.
 *
 * Notes:  The importer deduplicated on EMAIL alone. So `john@acme.co.za` on the old system and
 *         `j.smith@acme.co.za` on the rent roll became two contacts, two landlords, two payout identities —
 *         for one man. And we were already storing the key that would have caught it: `contacts.id_number_hash`
 *         is written on every import and is a deterministic SHA-256 of the SA ID. We computed the right key,
 *         stored it, and then matched on something weaker.
 *
 *         THE LADDER — strongest evidence first:
 *
 *           1.00  id_number_hash        a natural person's SA ID. Exact, deterministic, unforgeable by typo.
 *           1.00  registration_number   a company's CIPC number. Same.
 *           0.95  vat_number            a company's VAT number. Same class, marginally less canonical.
 *           0.95  email (exact)         what we used to do — kept, but demoted to what it is: strong, not proof.
 *           0.60-0.94  fuzzy           the same name and the same phone; the same phone; the same name.
 *           <0.60                       a different person.
 *
 *         WHAT HAPPENS IN THE GREY BAND IS THE WHOLE DESIGN.
 *
 *         A FALSE MERGE commingles two people. Two landlords become one payout identity; one of them stops
 *         being paid and the other is paid twice, and unpicking it means unpicking a trust ledger. It is close
 *         to unrecoverable.
 *
 *         A FALSE SPLIT is two records for one person. It is untidy, visible, and an agent merges them in a
 *         minute.
 *
 *         They are not symmetric, so we do not treat them symmetrically. Between 60% and 95% NOTHING IS
 *         WRITTEN. The row is HELD (`import_identity_reviews`), the rest of the book imports, and the agent is
 *         told exactly what it costs them: "3 records were NOT imported — confirm each as the same person
 *         (link) or as someone new (create), or they stay out."
 *
 *         A held TENANT holds their LEASE too, and that is correct: strictness costs the ROW, never the BOOK.
 *         A lease silently attached to the WRONG person is a far worse outcome than a lease that waits for one
 *         question. Same doctrine as lease type and deposit rates: where we cannot know, we do not guess — we
 *         ask, and we say plainly what is waiting on the answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/validation/contact"

export type MatchBasis =
  | "id_number"
  | "registration_number"
  | "vat_number"
  | "email"
  | "name_and_phone"
  | "phone"
  | "name"

export interface IdentityMatch {
  contactId: string
  /** 0–1. ≥ 0.95 links automatically; 0.60–0.94 needs the agent; below that it is a different person. */
  confidence: number
  basis: MatchBasis
  /** What the agent sees when asked "is this the same person?" */
  existing: { name: string; email: string | null; phone: string | null }
}

/** Above this we link without asking. At exactly this line the evidence is an exact identifier or an exact email. */
export const AUTO_LINK = 0.95
/** Below this it is a different person and we say nothing. Between the two, we ASK. */
export const ASK_THRESHOLD = 0.60

export interface IdentityCandidate {
  email: string | null
  phone: string | null
  /** SHA-256 of the raw SA ID — the same hash `idNumberColumns()` writes. Never the ID itself. */
  idNumberHash: string | null
  registrationNumber: string | null
  vatNumber: string | null
  firstName: string | null
  lastName: string | null
  companyName: string | null
}

interface ContactRow {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  primary_email: string | null
  primary_phone: string | null
}

const COLS = "id, first_name, last_name, company_name, primary_email, primary_phone"

const display = (c: ContactRow) =>
  c.company_name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(unnamed)"

const asMatch = (c: ContactRow, confidence: number, basis: MatchBasis): IdentityMatch => ({
  contactId: c.id,
  confidence,
  basis,
  existing: { name: display(c), email: c.primary_email, phone: c.primary_phone },
})

/**
 * The phone SSOT — `normalizePhone` (E.164 or null), NOT a hand-rolled \D-strip.
 *
 * My first version rolled its own, and `pleks/no-rerolled-phone-normalise` caught it: a naive digit-strip is
 * WEAKER, because it happily passes an unparseable number through as if it were valid. Here that would be worse
 * than useless — it would let two DIFFERENT people match on a garbage "phone" that normalised to the same
 * digits, and matching is the one thing this file exists to get right. "+27 82 123 4567", "082 123 4567" and
 * "0821234567" all resolve to the same E.164 number; an unparseable one resolves to null and matches nobody.
 */

const normaliseName = (v: string | null) =>
  (v ?? "").toLowerCase().replaceAll(/[^a-z]/g, "") || null

/**
 * Find the existing contact this row is about — if there is one.
 *
 * A failed lookup THROWS. A lookup that failed is not a lookup that found nothing: treating it as "no match"
 * is precisely how the importer used to mint a second landlord for an owner who already existed.
 */
export async function matchExistingContact(
  db: SupabaseClient,
  orgId: string,
  role: string,
  candidate: IdentityCandidate,
): Promise<IdentityMatch | null> {
  const base = () => db.from("contacts").select(COLS).eq("org_id", orgId).eq("primary_role", role).is("deleted_at", null)

  // ── 1.00 · The SA ID. A natural person's identity, hashed. Nothing about it is a guess.
  if (candidate.idNumberHash) {
    const { data, error } = await base().eq("id_number_hash", candidate.idNumberHash).limit(1).maybeSingle()
    if (error) throw new Error(`identity match (id_number) failed: ${error.message}`)
    if (data) return asMatch(data as ContactRow, 1, "id_number")
  }

  // ── 1.00 · The CIPC registration number. A company's identity.
  if (candidate.registrationNumber) {
    const { data, error } = await base().eq("registration_number", candidate.registrationNumber).limit(1).maybeSingle()
    if (error) throw new Error(`identity match (registration_number) failed: ${error.message}`)
    if (data) return asMatch(data as ContactRow, 1, "registration_number")
  }

  // ── 0.95 · VAT number. Same class; a company can have one without the other in a book.
  if (candidate.vatNumber) {
    const { data, error } = await base().eq("vat_number", candidate.vatNumber).limit(1).maybeSingle()
    if (error) throw new Error(`identity match (vat_number) failed: ${error.message}`)
    if (data) return asMatch(data as ContactRow, 0.95, "vat_number")
  }

  // ── 0.95 · Email. What we used to do, kept — but demoted to what it actually is: strong, not proof.
  if (candidate.email) {
    const { data, error } = await base().ilike("primary_email", candidate.email).limit(1).maybeSingle()
    if (error) throw new Error(`identity match (email) failed: ${error.message}`)
    if (data) return asMatch(data as ContactRow, 0.95, "email")
  }

  return fuzzyMatch(await roster(base), candidate)
}

/** Everyone in this role, for the fuzzy pass. Org-scoped; small by construction (an org's own contacts). */
async function roster(
  base: () => { limit: (n: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
): Promise<ContactRow[]> {
  const { data, error } = await base().limit(2000)
  if (error) throw new Error(`identity roster failed: ${error.message}`)
  return (data ?? []) as ContactRow[]
}

/**
 * The grey band. Nothing here is ever merged automatically — it is evidence to put in front of a human.
 */
function fuzzyMatch(rows: ContactRow[], candidate: IdentityCandidate): IdentityMatch | null {
  const phone = normalizePhone(candidate.phone)
  const name = normaliseName(
    candidate.companyName ?? [candidate.firstName, candidate.lastName].filter(Boolean).join(""),
  )
  if (!phone && !name) return null

  let best: IdentityMatch | null = null
  for (const row of rows) {
    const rowPhone = normalizePhone(row.primary_phone)
    const rowName = normaliseName(row.company_name ?? [row.first_name, row.last_name].filter(Boolean).join(""))

    // THE FUZZY BAND IS DELIBERATELY NARROW: name AND phone TOGETHER. Nothing else.
    //
    // The first version also held on name-alone (0.65) and phone-alone (0.70), and the stress harness killed it
    // within one run: in a book of a hundred leases "John Smith" legitimately appears twice, so name-alone HELD
    // rows that were simply two different people — and at five thousand rows it would hold a large fraction of
    // a legitimate book. Worse, a row can match a contact created EARLIER IN THE SAME RUN, so the book would
    // start holding itself. Phone-alone is no better: families and office lines share a number.
    //
    // A hold has a real cost — a row that does not import until a human answers a question. Spending that cost
    // on a coincidence of names is how a safety feature becomes the thing agencies switch off.
    //
    // Name AND phone, both, with a different email: that is a person who changed their email address. It is the
    // case this band exists for, and it is the only one weak evidence supports. Everything below it CREATES —
    // which is the REVERSIBLE error, and therefore the right one to make.
    let confidence = 0
    let basis: MatchBasis | null = null

    if (name && phone && rowName === name && rowPhone === phone) {
      confidence = 0.90
      basis = "name_and_phone"
    }

    if (basis && confidence >= ASK_THRESHOLD && (!best || confidence > best.confidence)) {
      best = asMatch(row, confidence, basis)
    }
  }
  return best
}

/** The message an agent reads. It has to be answerable without opening the database. */
export function describeMatch(m: IdentityMatch, incoming: { name: string; email: string | null }): string {
  const why: Record<MatchBasis, string> = {
    id_number: "the same SA ID number",
    registration_number: "the same company registration number",
    vat_number: "the same VAT number",
    email: "the same email address",
    name_and_phone: "the same name AND the same phone number, but a different email address",
    phone: "the same phone number",
    name: "the same name",
  }

  return (
    `"${incoming.name}" (${incoming.email ?? "no email"}) may already exist as "${m.existing.name}" ` +
    `(${m.existing.email ?? "no email"}) — they share ${why[m.basis]}. THIS ROW WAS NOT IMPORTED. Confirm ` +
    `whether they are the same person (we will link to the existing record) or someone new (we will create ` +
    `them), or the row stays out. We do not merge on a resemblance: joining two people who are actually ` +
    `different joins EVERYTHING — their payouts, their statements, their history — and that is far harder to ` +
    `undo than two records that should have been one.`
  )
}
