/**
 * lib/applications/liveCoParties.ts — which co rows are still parties to the application (SSOT)
 *
 * Notes:  A co row leaves the set two ways: it DECLINES (`declined_at` set), or its subject exercises ERASURE
 *         (`ANONYMISE_PLAN`'s strip). The strip leaves no column of its own — `declined_at` stays null, and
 *         `stage1_consent_given` stays true — so the only surviving marker is `applicant_email = REDACTED`
 *         (the column is NOT NULL, which is also why `.neq` drops nothing it should keep). A reader that
 *         filters `declined_at` alone reads an erased co as a live, consenting peer: emails "[erased]",
 *         counts it towards all-green and the group consent block, chases it for a screening line (N3).
 *
 *         Every reader that means "the parties still in this application" applies `onlyLiveCoParties`;
 *         three sites spelled the erased half inline (PRs #358/#361) and five did not, which is the drift
 *         this module ends. NOT for erasure, export or audit (they must still reach the erased row), nor for
 *         the agent's historical roster, which shows declined rows on purpose.
 */
import { REDACTED } from "@/lib/popia/anonymisePlan"

/** The two filter methods the predicate needs. Both return the builder itself, as PostgREST's do. */
interface LiveFilterable {
  is(column: string, value: null): LiveFilterable
  neq(column: string, value: string): LiveFilterable
}

/**
 * Narrow a co-applicant query to the live set: not declined, not erased. Pass a PostgREST filter builder.
 *
 * `Q` is deliberately UNCONSTRAINED. Any bound that tsc has to check against the real builder — `Q extends
 * LiveFilterable<Q>`, or one written with `this` — makes it compare generic method against generic method across
 * the whole schema type, and it gave up with TS2589 at a different call site on each run. The builder's methods
 * return the builder, so the cast back to `Q` describes what happens at runtime.
 */
export function onlyLiveCoParties<Q>(query: Q): Q {
  return (query as unknown as LiveFilterable).is("declined_at", null).neq("applicant_email", REDACTED) as unknown as Q
}

/** The same set as an in-memory test, for a row already loaded. Kept beside the query so the two cannot drift. */
export function isLiveCoParty(row: Readonly<{ declined_at?: string | null; applicant_email?: string | null }>): boolean {
  return row.declined_at == null && row.applicant_email !== REDACTED
}
