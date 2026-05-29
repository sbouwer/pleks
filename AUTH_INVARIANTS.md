# AUTH INVARIANTS

Load-bearing rules for the Pleks auth system. Each is a falsifiable statement — if code
violates one, that's the bug. This file is the short checklist; full rationale lives in
the `ADDENDUM_AUTH_*` specs and the CLAUDE.md "Single-Pass Auth Doctrine" + "CRON
ARCHITECTURE" sections. When you change auth, re-read this and keep it true.

## The two authorities

- **Gate (`proxy.ts`)** — cheap, per-request. Reads cookies + the JWT `aal` claim
  (`collectGateFacts`), decides `allow | to_login | to_resolver | forbidden`
  (`routeGateDecision`). Never hits the DB. Fail-closed: a role-gated route with no
  readable `sessionRole` → `to_resolver` (never `allow`).
- **Resolver (`/auth/resolver`)** — canonical, DB-backed. Makes exactly ONE post-auth
  routing decision per call (`collectResolverFacts` → `resolveAuthDestination`).

## Invariants

1. **Single-pass resolver.** `/auth/resolver` produces exactly one decision and redirects
   to a real destination (or a transient state carrying the final dest in `?redirect=`).
   It MUST NOT appear in any `?redirect=` value it forwards. Transient states
   (`/login/mfa`, `/settings/security/enrol-totp`, `/onboarding`) navigate directly to the
   destination on success — never back through the resolver. (ADDENDUM_AUTH_RESOLVER_SELF_REFERENCE_FIX)

2. **Termination invariant (the loop class).** Every route the resolver can redirect to
   must be gate-admittable in the state the resolver sends the user in. Concretely: a
   resolver-target route that is role-gated must be either `skipOrgCheck` (so
   `ensureOrgCookies` always hydrates the role) or `requiresAal2` (only reached post-MFA,
   cookies warm). Otherwise an AAL1 agent whose `pleks_org` (300s) lapsed mid-flow is
   bounced back to the resolver forever. **Enforced statically** by architecture-audit
   CHECK 9 and at runtime by the `pleks_rdr` loop-breaker (→ `/login?err=loop` after 4
   bounces, purging the org cookies).

3. **Hot-path session read + edge recovery (ratified 2026-05-29).** Middleware uses
   `getSession()` for the hot path (local, zero-network, and the source of the
   `access_token` for AAL extraction). Proactive token refresh happens at the
   destination's own `getUser()`, NOT in middleware. The expired-token throw
   (`getUser()`'s refresh fetch can throw, not just return `{user:null}`) is **recovered at
   the edges, not prevented**: `/welcome` and `/auth/resolver` catch it and redirect
   (→ resolver re-auths, or → `/login` if the refresh token is dead). Both terminals are
   correct. Do NOT switch middleware to `getUser()` — it would tax every gated request
   with a gotrue round-trip, drop the AAL token, and move the throw into the unguarded
   hot path.

4. **Cookies carry across redirects.** `NextResponse.redirect()` drops `Set-Cookie` unless
   the `supabaseResponse` cookies are copied onto it (`carryCookies`). Every gate redirect
   must carry them, or the refreshed session/org cookie never reaches the browser and the
   next request repeats identically → loop.

5. **Durable role.** The agent role lives in `pleks_org` (300s). The 7-day `pleks_has_org`
   also carries `role` + `portal_class` so the gate can still admit a role-gated route
   after `pleks_org` lapses, even if DB re-hydration returns nothing. `collectGateFacts`
   reads in priority order: `pleks_org.role → pleks_has_org.role → portal_class → org-only
   (no role, fail closed)`.

6. **Cross-user purge (shared desk).** If a cached org cookie's `user_id` ≠ the session
   user, `ensureOrgCookies` purges and re-resolves — never authorise user B with user A's
   cached org/role.

7. **AAL is read from one source.** Gate (`extractAalFromJwt`) and resolver
   (`getAuthenticatorAssuranceLevel().currentLevel`) both read the JWT `aal` claim. They
   agree by construction — auth disagreements are role/cookie, never AAL.

8. **`skipOrgCheck` routes must not be agent-role-gated.** `skipOrgCheck` disables
   `ensureOrgCookies` (the only role-cookie hydrator), so a role-gated `skipOrgCheck` route
   fails closed and loops. Enforced by architecture-audit CHECK 8. (Portal routes are
   exempt — their role comes from the login-set cookie, not `pleks_org`.)

## Observability

- One `pleks_trace` id (8-char, 30s) is shared across a gate→resolver→gate hop chain.
  Grep a single trace across `[gate]` (proxy) and `[resolver]` (route handler) log lines
  to reconstruct an entire cycle — alternating lines sharing one trace = a loop.
- The integration test `lib/auth/__tests__/gate-resolver-convergence.test.ts` runs the
  real gate + resolver and asserts convergence ≤3 hops for representative states. It is
  the regression guard for invariants 2, 3, 5, 6 — add a scenario when you touch them.
