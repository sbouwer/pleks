/**
 * lib/auth/__tests__/membership-carries-no-forgeable-field.test.ts — the control that replaced
 * eslint:pleks/no-forgeable-tier-in-gate.
 *
 * Auth:   n/a — a source/type assertion, no session involved.
 * Data:   the text of lib/auth/server.ts, plus its own return type.
 * Notes:  WHY THIS EXISTS AND THE LINT RULE DOES NOT. The rule banned importing
 *         `lib/tier/getOrgTierFromCookie` from anything that decides entitlement. That module was
 *         deleted on 2026-08-23 when `tier` left getServerOrgMembership's return — with nothing
 *         forgeable to fast-path, its whole body reduced to `return getOrgTierCanonical(orgId)`.
 *         A rule matching imports of a deleted module cannot fire, and an inert rule is worse than
 *         no rule because the register still counts it as coverage.
 *
 *         It also never had the right aperture. All seven live bypasses that the tier removal
 *         surfaced read `membership.tier` DIRECTLY off getServerOrgMembership — they never imported
 *         the module the rule watched, so the rule was green throughout. It was aimed at one route
 *         to a forgeable value while the field itself was handed out at the source. This file is
 *         aimed at the source.
 *
 *         The regression to catch is somebody re-adding `tier` (or any other unvalidated cookie
 *         field) to that return for a round-trip saving. Two independent assertions, because they
 *         fail on different edits: the TYPE assertion catches the field coming back, and the SOURCE
 *         assertion catches the delegation being unwound into a second local cookie reader — which
 *         is the 2026-08-22 scar's shape and is what the CD ruling of 2026-08-23 forbade.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { getServerOrgMembership } from "../server"

type Membership = NonNullable<Awaited<ReturnType<typeof getServerOrgMembership>>>

/**
 * THE `tier` ASSERTION IS THIS LINE, and it is checked by `tsc --noEmit` in `npm run check` rather
 * than by vitest — vitest strips types, so a runtime expression could not have made this claim.
 * It lives at module scope on purpose: indexing a `null` cast inside a test body throws before any
 * assertion runs, which is how the first draft of this file failed.
 *
 * BOTH DIRECTIONS, from one line: today `tier` is absent, so the index is an error and the
 * directive is used. Re-add `tier` to the return and the error disappears — an UNUSED
 * `@ts-expect-error` is itself a TypeScript error, so the build fails on the regression too.
 */
// @ts-expect-error `tier` came verbatim from the unsigned pleks_org cookie and was removed on
// 2026-08-23. For a tier, call getOrgTierCanonical(orgId) from @/lib/tier/getOrgTier.
type _MembershipHasNoTier = Membership["tier"]

describe("getServerOrgMembership carries no unvalidated cookie field", () => {
  it("still returns the two fields it is supposed to return", () => {
    // Guards the vacuous case: the type assertion above also passes if the whole shape collapsed to
    // nothing. That is the enumeration trap in .claude/rules/lint-rules.md, one axis over.
    const m: Membership = { org_id: "o", role: "owner" }
    expect(Object.keys(m).sort()).toEqual(["org_id", "role"])
  })

  it("delegates to gateway's resolveOrgMembership instead of reading the cookie itself", () => {
    const src = readFileSync(join(process.cwd(), "lib/auth/server.ts"), "utf8")

    const start = src.indexOf("export const getServerOrgMembership")
    expect(start, "getServerOrgMembership not found — this test is measuring nothing").toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf("\n})", start))

    expect(body, "must resolve membership through the single shared implementation").toContain(
      "resolveOrgMembership(user.id)",
    )
    // A local JSON.parse here is how the second reader came into existence the first time.
    expect(body, "must not re-derive a cookie reader locally").not.toContain("JSON.parse")
    expect(body, "must not read pleks_org directly").not.toContain("pleks_org")
  })

  it("has no cookie fast path anywhere in the module, not just in that one function", () => {
    // WHOLE-FILE, on purpose. Scoping this to getServerOrgMembership is the mistake the M-091 lint
    // rule made one level up: it guarded the route it knew about while the same forgeable value was
    // read by three other functions in this file. getCurrentOrgCapabilities read `type`/`name`/
    // `sub_status` and getCurrentSubscriptionState read `sub_status`, both unvalidated, both twenty
    // lines from the function everyone was looking at. All three fast paths were removed 2026-08-23.
    const src = readFileSync(join(process.cwd(), "lib/auth/server.ts"), "utf8")

    // MATCHED ON CODE SHAPE, NOT ON COMMENT-STRIPPED SOURCE. The first draft stripped comments with
    // `/\/\*[\s\S]*?\*\//g` — which the repo's own super-linear-regex rule rejected at the commit
    // gate, correctly. Each needle below is a syntactic form that cannot occur in the prose of this
    // file (the docstrings discuss `pleks_org` and cookies at length, but never as a call or an
    // import specifier), so no stripping is needed and there is no pattern to get wrong. If a future
    // docstring ever writes one of these verbatim, this test fails loudly rather than silently
    // widening — the safe direction.
    for (const needle of ['JSON.parse(', 'from "next/headers"', "cookieStore.get(", "cookies()"]) {
      expect(src, `\`${needle}\` is how a cookie fast path comes back into this module`).not.toContain(
        needle,
      )
    }
  })
})
