---
paths:
  - "proxy.ts"
  - "middleware.ts"
  - "lib/auth/**"
  - "lib/routing/**"
---

## PROXY.TS — Next.js 16 Middleware Rename

In Next.js 16, `middleware.ts` was deprecated and renamed to `proxy.ts` to better
reflect its role as a network boundary for rewriting, redirecting, and header
manipulation rather than general server-side logic. The default export also changed
from `middleware` to `proxy`.

**`proxy.ts` at the project root IS the Next.js middleware.** Do NOT create a new
`middleware.ts` file — it is deprecated in Next.js 16 and will not be picked up.
**UNENFORCEABLE** — mechanisable and not done: a check could simply assert no `middleware.ts` exists at the project root (a one-line `existsSync` check), the same shape as `check-rules-tracked.mjs`'s ghost-file check.

`proxy.ts` handles (in order):
1. Webhook/cron bypass — `WEBHOOK_PREFIXES` skip all gates; handlers validate their own secrets
2. Admin API gate — `/api/admin/*` checked for HMAC token before reaching the handler
3. Subdomain split (production only) — hostname-based 308 redirects and rewrites
4. Manifest lookup — `ROUTE_MANIFEST` drives auth requirements per route prefix
5. Supabase session refresh — `updateSession()` on all authenticated routes
6. AAL2 enforcement — MFA check on agent workspace routes
7. Portal role gate — `pleks_active_role` cookie check for tenant/landlord/supplier portals
8. Org cookie hydration — `pleks_org` + `pleks_has_org` cookies set/refreshed per request

When any spec references "middleware" or "the proxy layer" — the implementation lives in
`proxy.ts`. When ADDENDUM_62A references signal points in `proxy.ts`, that means the
middleware layer. Never split this into a separate `middleware.ts`.

---

## Single-Pass Auth Doctrine (ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX_2026-05-27)

**Rule:** `/auth/resolver` produces exactly ONE routing decision per call. Every URL it returns redirects to the user's actual final destination (or a transient auth state with the final destination preserved in `?redirect=`). The resolver MUST NOT appear in any `?redirect=` value it forwards. The transient auth states (`/login/mfa`, `/settings/security/enrol-totp`, `/onboarding`) MUST navigate directly to the final destination on success — never back through the resolver.
**UNENFORCEABLE** — mechanisable and not done: a check could grep the resolver route and the three named transient-auth-state routes for a literal `/auth/resolver` substring inside a `redirect=`/`searchParams.set("redirect", ...)` value and fail on a match — the exact self-reference class this rule forbids — but nothing does today; it is a runtime routing property, not something `architecture-audit.mjs`'s current checks (cross-origin links, manifest completeness, safe-redirect denylist) happen to cover.

**Rationale:** Resolver self-references create infinite loops when AAL2 cookies don't propagate on post-MFA navigation, or when the user is in a cross-host MFA state (factor enrolled on host A, currently at host B).

Membership and consent are NOT the resolver's job after the first call. They are handled by `ensureOrgCookies` in proxy.ts and `ConsentGateModal` in destination layouts.

**Factor scoping:** Any code path that ROUTES based on "does the user have an MFA factor?" MUST use the host-scoped check (`filterFactorsByHost` from `lib/auth/mfa-host`). Global factor presence is meaningless for routing — only host-scoped presence determines whether the user can MFA-verify on the current host.
**UNENFORCEABLE** — mechanisable and not done: a check could flag a routing decision (`NextResponse.redirect` inside an `if`) guarded by `factors.some(...)`/raw factor-array truthiness instead of a `filterFactorsByHost(...)` call — the exact anti-pattern shown below — but nothing greps for it today.

**Anti-pattern (creates loops):**

```ts
// Wrapping resolver URL inside another transient state's redirect param
mfaUrl.searchParams.set("redirect", "/auth/resolver?redirect=" + safeNext)
// ↑ Post-MFA navigation re-enters the resolver — loop if AAL2 cookie is stale

// Routing based on global factor presence
const hasVerifiedFactor = factors.some(f => f.status === "verified")
if (hasVerifiedFactor) return NextResponse.redirect("/login/mfa")
// ↑ Cross-host user has factors elsewhere — /login/mfa sees no host match — stranded
```

**Correct pattern:**

```ts
// MFA redirect with original destination (not resolver)
const mfaUrl = new URL("/login/mfa", origin)
if (safeNext) mfaUrl.searchParams.set("redirect", safeNext)

// Host-scoped routing decision
const hostFactors = filterFactorsByHost(allVerified, currentHost)
if (hostFactors.length > 0) return NextResponse.redirect(mfaUrl)    // verify
else return NextResponse.redirect(enrolUrl)                          // enrol
```

Source: ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX_2026-05-27.

---

