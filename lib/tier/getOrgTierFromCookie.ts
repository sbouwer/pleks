/**
 * lib/tier/getOrgTierFromCookie.ts — reads the FORGEABLE pleks_org cookie. Never gate on this.
 *
 * Auth:   Server-only. Reads the caller's own session membership; the value is attacker-controlled.
 * Data:   pleks_org cookie (fast path) → subscriptions via getOrgTierCanonical (cache miss).
 * Notes:  A user can set tier:"bespoke" in the cookie. Everything this module returns is therefore a
 *         DISPLAY value — badges, plan labels, feature-visibility hints — and nothing more. For any
 *         entitlement, capability or lease gate, use getOrgTierCanonical from ./getOrgTier.
 *
 *         THE MODULE IS NAMED FOR THE DANGER ON PURPOSE. This function used to live beside the two
 *         authoritative readers, so `import { getOrgTier, getOrgTierCanonical }` put the forgeable
 *         one and the gate one on the same line, one character apart, on a path where picking the
 *         wrong one is a security defect rather than a bug. Splitting it turns "read the comment"
 *         into "read the import" (CD ruling 2026-08-23), and makes the invariant expressible as a
 *         rule about a MODULE PATH rather than an imported name — the token-anchoring shape this
 *         repo has now got wrong four times.
 *
 *         It also broke a real runtime cycle: lib/auth/can → orgRoles → getOrgTier → lib/auth/server,
 *         which worked only on the order Node happened to initialise those modules in. The
 *         getServerOrgMembership import below was its only cause, and it belongs here with the one
 *         function that needs it rather than in a module nine other files import to read a tier.
 */
import type { Tier } from "@/lib/constants"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getOrgTierCanonical } from "./getOrgTier"

/** Display-only tier — reads pleks_org cookie with DB fallback on cache miss.
 *  Forgeable: a user can set tier:"bespoke" in the cookie to mislead display.
 *  Use ONLY for display surfaces (badges, plan labels, feature-visibility hints).
 *  Never use for capability gates — use getOrgTierCanonical instead. */
export async function getOrgTier(orgId: string): Promise<Tier> {
  const membership = await getServerOrgMembership()
  if (membership?.org_id === orgId && membership.tier) {
    return membership.tier as Tier
  }

  // Cache miss → fall back to the SAME canonical read the gates use (service client, explicit org_id).
  // This used to re-roll the query on the COOKIE client, whose auth does not reliably reach Postgres RLS —
  // so an unwarmed session read empty and silently displayed the Owner tier. The service-client read cannot
  // drift from getOrgTierCanonical, and the cookie is still the fast path above.
  //
  // This line called the private _readEffectiveTier() before the move. getOrgTierCanonical's entire body is
  // `(await _readEffectiveTier(orgId)) as Tier` — so this is the same read with the same cast, not a change
  // of behaviour, and it avoids widening that helper's visibility just to reach it from here. The comment
  // above already claimed "the SAME canonical read the gates use"; now it is literally the same call.
  return getOrgTierCanonical(orgId)
}
