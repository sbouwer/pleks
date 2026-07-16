/**
 * lib/import/assemble/resolveParties.ts — resolve a lease→party edge, or HOLD it (ADDENDUM_21C D-3/D-7/D-8)
 *
 * Notes:  A wrong lease↔tenant attachment is the catastrophic, near-irreversible error — another person's ID,
 *         deposit and arrears bound to the wrong lease (D-3). So there are exactly two outcomes: a DETERMINISTIC
 *         resolve by ID (the junction report, D-2 primary path), or a HOLD. The fuzzy tail (name+phone from
 *         LeaseExpiry's display string) is FALLBACK ONLY and, crucially, scores 0.90 — BELOW the 0.95 AUTO_LINK
 *         line — so it NEVER auto-attaches. It surfaces candidates for the human (21D's confirm-step) and holds.
 *         The result: with no junction report, every party edge is held-with-candidates, honestly, never guessed.
 */
import { AUTO_LINK } from "@/lib/import/identity"
import type { Hold, HoldCandidate } from "./types"
import { normaliseName, normalizePhone, normaliseRef, parsePartyString } from "./normalise"

/** A staged contact shaped for matching — a ContactsExport row reduced to what the band scores. */
export interface StagedContact {
  ref: string // the contact's own REFERENCE (e.g. "TEN000001")
  name: string
  phone: string | null
  email: string | null
}

export type PartyResolution =
  | { status: "resolved"; ref: string }
  | { status: "held"; hold: Hold }

const NAME_AND_PHONE = 0.9 // mirror of identity.ts's fuzzy band — DELIBERATELY below AUTO_LINK (0.95)
const PHONE_ONLY = 0.6 // a weaker candidate to SURFACE (never to auto-act on) — a shared line, a changed name

function label(c: StagedContact): string {
  return [c.name, c.email, c.phone].filter(Boolean).join(" · ") || c.ref
}

/**
 * DETERMINISTIC (D-2). The junction report gives `leaseRef → partyRef` by ID. If that party exists in the staged
 * contacts, attach it — safe, no guess. If the id points at nothing, that is a dangling reference: HELD, named,
 * never silently dropped (D-4).
 */
export function resolvePartyByJunction(
  leaseRef: string,
  partyRefRaw: string,
  contactsByRef: Map<string, StagedContact>,
  role: "tenant" | "landlord",
): PartyResolution {
  const key = normaliseRef(partyRefRaw)
  const hit = contactsByRef.get(key)
  if (hit) return { status: "resolved", ref: hit.ref }
  return {
    status: "held",
    hold: {
      kind: "reference",
      subject: leaseRef,
      reason: `Lease ${leaseRef} names a ${role} (${partyRefRaw}) that is not in any uploaded contact list.`,
      decisions: ["upload_table", "accept_as_held", "exclude"],
    },
  }
}

/**
 * FUZZY FALLBACK (D-7), used only when there is no junction report. The party is a display string —
 * `"Family Farao (0719780357)"`. Score every staged contact of the right role; NEVER auto-attach (the top score
 * is 0.90 < AUTO_LINK), always HOLD, but carry the ranked candidates so the human can confirm one (21D).
 * No candidate at all → a `reference` hold that says: go get the junction report.
 */
export function resolvePartyFuzzy(
  leaseRef: string,
  partyString: string,
  role: "tenant" | "landlord",
  contacts: StagedContact[],
): PartyResolution {
  const { name, phone } = parsePartyString(partyString)
  const wantName = normaliseName(name)
  const wantPhone = phone // parsePartyString already normalised it

  const scored: HoldCandidate[] = []
  for (const c of contacts) {
    const cName = normaliseName(c.name)
    const cPhone = normalizePhone(c.phone)
    let confidence = 0
    // name AND phone — the only band identity.ts trusts; still only 0.90, so still a HOLD, never an auto-link.
    if (wantName && wantPhone && cName === wantName && cPhone === wantPhone) confidence = NAME_AND_PHONE
    else if (wantPhone && cPhone === wantPhone) confidence = PHONE_ONLY // surface a phone-only near-miss to the human
    if (confidence > 0) scored.push({ ref: c.ref, label: label(c), confidence })
  }
  scored.sort((a, b) => b.confidence - a.confidence)

  // By construction nothing here reaches AUTO_LINK — asserted so a future band change that DID cross the line
  // could never silently start auto-attaching parties in a pre-DB stage that cannot see the DB dedup.
  const autoLinkable = scored.filter((c) => c.confidence >= AUTO_LINK)
  if (autoLinkable.length > 0) {
    throw new Error("assembler: a fuzzy party score reached AUTO_LINK — parties must never auto-attach pre-DB (D-3)")
  }

  if (scored.length === 0) {
    return {
      status: "held",
      hold: {
        kind: "reference",
        subject: leaseRef,
        reason:
          `Lease ${leaseRef}'s ${role} "${name}" matches no uploaded contact by name or phone. ` +
          `Upload the ${role} list, or the source system's lease-detail report that links leases to contacts by ID.`,
        decisions: ["upload_table", "accept_as_held", "exclude"],
      },
    }
  }
  return {
    status: "held",
    hold: {
      kind: "fuzzy",
      subject: leaseRef,
      reason:
        `Lease ${leaseRef}'s ${role} "${name}" has ${scored.length === 1 ? "a possible match" : `${scored.length} possible matches`} ` +
        `but no exact key — confirm which contact this is, or leave it held.`,
      candidates: scored,
      decisions: ["confirm_fuzzy", "upload_table", "accept_as_held", "exclude"],
    },
  }
}
