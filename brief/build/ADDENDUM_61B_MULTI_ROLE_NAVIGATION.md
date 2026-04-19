# ADDENDUM_61B — Multi-role navigation

> Status: Spec'd, not yet built
> Type: Feature (sits on top of BUILD_61 structural refactor)
> Parent: BUILD_61 (subdomain + role namespace)
> Dependencies: BUILD_61 ships first (canonical route manifest, role-prefix URL structure). BUILD_62 should ship first if possible (`auth_events.event_type` CHECK constraint must include `'role_switched'`); if ADDENDUM_61B lands first, the `auth_events` dual-write no-ops gracefully per security-considerations §4.

---

## Problem

BUILD_61 establishes role-prefix URLs: `/tenant/`, `/landlord/`, `/supplier/`, `/apply/`, unprefixed agent. Every URL belongs to exactly one role context. Middleware enforces that a session's active role matches the URL prefix.

What BUILD_61 does not address: **users who have multiple role memberships**.

This is common in SA property management:

1. **Tenant who is also a landlord.** Alice rents a flat from Smith Realty (tenant role on that lease), and separately owns a unit she's putting on the market through Greenfield Property (landlord role on that property). Same human, two roles, two different managing agencies.
2. **Agent who is also a tenant.** Bob works at Acme Rentals as a property manager (agent role) and rents his own place through Beta Realty (tenant role).
3. **Landlord who is also the agency owner.** Charlie owns his own agency AND rents out properties through it (self-managed, with agency-side oversight of his own landlord record). Owner role + landlord role.
4. **Supplier who is also a tenant.** Common — a plumber is a supplier at the agencies he services, and simultaneously a tenant at his own rental home.

Currently, if these users exist in the system, there's no UI to switch context. BUILD_49 landed the tenant portal and BUILD_46 landed the landlord portal without ever answering "what if the same person is both?"

Without explicit role-context resolution, the session lives in ambiguity: `active_role` is whatever the last login happened to set. This is both a UX problem ("why can't I see my landlord statements?") and a security concern (every route relies on `active_role` matching URL prefix — ambiguous active_role = undefined behaviour).

---

## Design principles

1. **Exactly one active role per session, always.** Even if a user has N memberships, the session has one `active_role` and one `active_org` at a time. This is load-bearing for the security model (URL prefix → role check in middleware).
2. **Switching is explicit, never inferred.** The system never decides for the user which role they "probably" want. Either they have one role (auto-routed) or they pick (role-selector).
3. **Available roles resolved at login, cached in session.** Look up once, cache in cookie, refresh on role-membership changes.
4. **Role-switcher is a UI affordance, not a URL-level mechanism.** URL prefix still reflects active role. Switching roles changes the cookie then redirects.
5. **Security discipline preserved.** A user with available roles `[tenant, landlord]` still cannot hit `/tenant/*` unless `active_role='tenant'`. Middleware doesn't care about available roles — only active.

---

## Data model

### Role-membership sources

A user's available roles are derived at login from multiple bridge tables:

| Source | Role inferred | Condition |
|--------|---------------|-----------|
| `user_orgs` row where `role IN ('owner','property_manager','agent','accountant','maintenance_manager')` | One of the agent roles | Org-scoped: one per `(user_id, org_id)` |
| `user_orgs_tenants` row | `'tenant'` | Tenant-scoped: one per `(user_id, tenant_id)` |
| `user_orgs_landlords` row | `'landlord'` | Landlord-scoped: one per `(user_id, landlord_id)` |
| `user_orgs_contractors` row (or equivalent after BUILD_61 rename) | `'supplier'` / `'contractor'` | Supplier-scoped: one per `(user_id, contractor_id)` |

These tables already exist as part of BUILD_25 (contacts module) and BUILD_49 / BUILD_46 / BUILD_19 (portals). This addendum does not add new bridge tables.

### Role membership shape

```ts
export interface RoleMembership {
  role: SessionRole;                       // 'owner' | 'tenant' | 'landlord' | 'supplier' | ...
  scope: 'org' | 'tenant' | 'landlord' | 'supplier';
  scope_id: string;                        // org_id / tenant_id / landlord_id / contractor_id
  org_id: string;                          // always present — the managing org
  org_name: string;                        // for display in switcher
  label: string;                           // e.g. "Tenant at 5 Oak Ave"
                                           // or "Landlord of 3 properties"
                                           // or "Property manager at Smith Realty"
}

export interface SessionRoles {
  user_id: string;
  available: RoleMembership[];
  active_role: SessionRole;
  active_scope_id: string;                 // the specific tenant/landlord/supplier/org id
  active_org_id: string;                   // managing org
}
```

### Session cookies

Add two new cookies alongside existing `pleks_org`:

| Cookie | Purpose | TTL | Contents |
|--------|---------|-----|----------|
| `pleks_active_role` | Which role context is active | 7 days | `{role, scope_id, org_id}` JSON |
| `pleks_available_roles` | Cached list of memberships | 5 minutes | array of `RoleMembership` JSON |

Existing `pleks_org` cookie continues to carry org context for agent sessions. For non-agent sessions it still carries `org_id` but the relevant scope is in `pleks_active_role.scope_id`.

Existing `pleks_has_org` stays for first-time-onboarding detection on the agent path.

TTL reasoning:
- `pleks_active_role` at 7 days matches typical session length.
- `pleks_available_roles` at 5 minutes mirrors the existing `pleks_org` pattern — short enough that role-membership changes (new tenancy, terminated lease) propagate quickly; long enough to avoid re-querying on every request.

---

## Authentication flow

### At login (`app.pleks.co.za/login`)

1. User submits email + password or magic-link.
2. Supabase auth succeeds. User record established.
3. Resolve memberships:
   ```sql
   -- Agent memberships
   SELECT role, org_id FROM user_orgs
   WHERE user_id = :uid AND deleted_at IS NULL;

   -- Tenant memberships
   SELECT tenant_id, org_id FROM user_orgs_tenants
   WHERE user_id = :uid;

   -- Landlord memberships
   SELECT landlord_id, org_id FROM user_orgs_landlords
   WHERE user_id = :uid;

   -- Supplier memberships
   SELECT contractor_id, org_id FROM user_orgs_contractors
   WHERE user_id = :uid;
   ```
4. Build `available` array. Enrich with display labels via a single join to properties/leases/contacts as needed for the switcher UI.
5. Decide landing:
   - `available.length === 0`: redirect to `/onboarding` (user exists in auth but no role yet).
   - `available.length === 1`: auto-route to that role's workspace; set `pleks_active_role` cookie.
   - `available.length > 1`: render role-selector at `/` on `app.pleks.co.za`; user picks; set cookie; redirect.

### Default role resolution when multiple exist

When a user last used role A in their previous session and returns: auto-route to role A (cookie still valid) OR re-pick.

Heuristic for first-time multi-role user:

1. If exactly one role is an agent role (owner/property_manager/etc.), that wins (operational default).
2. Otherwise, show the selector; no inferred default.

Specifically: **never auto-pick tenant over landlord or vice versa when both are non-agent.** The user must choose. This is the safety invariant — we never assume which role context they want.

### Session cookie set

```ts
// After role resolution, set cookies:
response.cookies.set('pleks_active_role', JSON.stringify({
  role: chosen.role,
  scope_id: chosen.scope_id,
  org_id: chosen.org_id,
}), { ...AUTH_COOKIE_OPTS, maxAge: 60 * 60 * 24 * 7 });

response.cookies.set('pleks_available_roles', JSON.stringify(available), {
  ...AUTH_COOKIE_OPTS, maxAge: 60 * 5,
});
```

### Session read in proxy.ts

`resolveActiveRole(user.id, request)` reads `pleks_active_role` cookie. If stale or missing:

1. Re-query bridge tables.
2. Apply default-resolution heuristic (if single role; else redirect to `/` for selection).
3. Write fresh cookie.

---

## URLs added

### `/` (root on `app.pleks.co.za`)

The role-selector landing. Rendered only for authenticated users with multiple available roles. Single-role users are auto-redirected before this page renders.

```
app.pleks.co.za/
```

Shows a card per available role, each with:
- Role label (e.g. "Tenant at 5 Oak Ave, Smith Realty")
- Scope detail (property address, agency name)
- "Enter" button → sets `pleks_active_role` cookie → redirects to appropriate workspace

Also shows the user's account menu (logout, profile).

### `/switch-role` (in-session switcher endpoint)

POST endpoint. Body:
```json
{ "role": "landlord", "scope_id": "abc-123", "org_id": "def-456" }
```

Validates that the target role is in the user's available memberships. Sets `pleks_active_role` cookie. Redirects to the target role's workspace default page (`/dashboard` for agent, `/tenant/dashboard` for tenant, etc.).

Called by the UI role-switcher component (see below).

### `/403` (new)

Shown when a user's active role doesn't match the URL they hit. Displays:
- Brief explanation ("This page is not available in your current role context.")
- Switcher (if user has other roles that could access this page)
- Back to your workspace link

---

## UI components

### Role-selector landing (for `app.pleks.co.za/`)

New component: `components/role-selector/RoleSelector.tsx`.

Server component at `app/(auth)/page.tsx` (or similar; route group for auth-required-but-no-active-role pages).

Layout:
- Header: "Welcome back, [name]. Pick a workspace to continue."
- Grid of cards, one per `RoleMembership`
- Each card:
  - Icon (per role type)
  - Role label + scope label
  - Agency name (for tenants, landlords, suppliers)
  - "Enter →" button

Card copy examples:
- Tenant: "Tenant at 5 Oak Ave, Smith Realty" + "Enter →"
- Landlord: "Landlord · 3 properties · self-managed" + "Enter →"
- Agent: "Property manager at Acme Rentals" + "Enter →"
- Supplier: "Supplier at 4 agencies" + "Enter →"

If a user has 5+ memberships, group by role type with subheadings (Tenancies / Landlord / Agencies / Supplier).

### In-session role switcher

New component: `components/role-switcher/RoleSwitcher.tsx`.

Placement: top-left of every layout (tenant layout, landlord layout, agent sidebar, supplier layout).

Visible only when `session.available.length > 1`. Hidden for single-role users (avoids clutter when there's nothing to switch to).

Trigger: a button showing the current role + context ("Tenant · 5 Oak Ave ▾") that opens a dropdown with the other available roles.

Action: clicking a different role POSTs to `/switch-role`, then hard-navigates to the new workspace.

Dropdown item copy matches the role-selector card copy.

### `/403` page

Simple centred-content layout:
- Icon (lock / block)
- Heading: "Not available here"
- Body: "This page isn't available in your current workspace. You're signed in as [current role label]."
- Actions:
  - If user has other available roles: "Switch workspace →" (opens role switcher).
  - Always: "Go to [current workspace] home" (link to role default page).
  - Always: "Sign out" (link to logout).

---

## Middleware integration

Update `proxy.ts` role-enforcement logic (§C5 in BUILD_61) to read from `pleks_active_role` cookie and compare to the route rule's permitted roles.

```ts
async function resolveActiveRole(user: User, request: NextRequest): Promise<{
  role: SessionRole;
  scope_id: string;
  org_id: string;
}> {
  const cookie = request.cookies.get('pleks_active_role')?.value;
  if (cookie) {
    try {
      return JSON.parse(cookie);
    } catch { /* fall through */ }
  }

  // Cookie missing or invalid — re-resolve from DB
  const memberships = await queryMemberships(user.id);

  if (memberships.length === 0) {
    // No role at all — redirect to onboarding
    throw new RedirectError('/onboarding');
  }

  if (memberships.length === 1) {
    return memberships[0];
  }

  // Multiple roles — redirect to selector
  throw new RedirectError('/');
}

async function enforceRoleAccess(
  rule: RouteRule,
  user: User,
  request: NextRequest
): Promise<NextResponse | null> {
  const activeRole = await resolveActiveRole(user, request);

  if (rule.roles && !rule.roles.includes(activeRole.role)) {
    // Active role doesn't permit this URL — 403
    return NextResponse.redirect(new URL('/403', request.url));
  }

  return null;  // pass through
}
```

`RedirectError` is caught at the top of the proxy and converted to a `NextResponse.redirect`.

---

## RLS implications

The `active_role` in the session cookie is informational for routing. **It is NOT a data-access claim.** RLS policies ignore `pleks_active_role` and continue to scope queries based on `auth.uid()` and the bridge tables.

Example: a tenant Alice is at `/tenant/lease` with `active_role='tenant'`. RLS on `leases` checks via `user_orgs_tenants` that Alice has a tenancy relationship with the lease's tenant record. The cookie doesn't factor in.

This keeps RLS simple and defends against cookie-tampering attacks: even if a user forges a `pleks_active_role` cookie claiming `role='owner'`, they still can't read data that isn't theirs because RLS doesn't trust the cookie.

What the cookie DOES control: which UI the user sees. A forged cookie gets you into the wrong URL path, sees middleware allow you through, then RLS returns empty result sets. Not a data breach — just a broken UI experience. Which is the correct failure mode.

---

## Edge cases

### User is on `/tenant/communications` and role-switches to landlord

Current URL is tenant-scoped. New active role is landlord. The switcher endpoint redirects to `/landlord/dashboard` (the landlord default page), not to `/landlord/communications` (which doesn't exist). Each role has a default landing page defined in the manifest:

```ts
export const ROLE_DEFAULT_ROUTES: Record<SessionRole, string> = {
  'tenant': '/tenant/dashboard',
  'landlord': '/landlord/dashboard',
  'supplier': '/supplier/dashboard',
  'contractor': '/supplier/dashboard',
  'owner': '/dashboard',
  'property_manager': '/dashboard',
  'agent': '/dashboard',
  'accountant': '/dashboard',
  'maintenance_manager': '/dashboard',
};
```

### User has agent role in two different orgs

Multi-org-agent case. Separate from multi-role. The existing `pleks_org` cookie handles this: session carries `active_org_id`, agent can switch orgs (which changes `pleks_org`, not `pleks_active_role`).

Two dimensions:
- `pleks_active_role` → which role type (tenant / landlord / agent / supplier)
- `pleks_org` → within agent role, which specific org's workspace

Switching between "tenant workspace" and "agent workspace at Acme" uses role switcher. Switching between "agent workspace at Acme" and "agent workspace at Beta" uses org switcher.

### User's role membership changes mid-session

A user is in tenant workspace. Agent revokes their tenancy (lease terminated, portal access revoked). Next request the user makes to `/tenant/*` hits middleware. Cookie says `active_role='tenant'`. But the underlying tenant membership no longer exists.

Middleware behavior: when `pleks_available_roles` cookie is stale (>5 minutes old), re-query. If the claimed `active_role` is no longer in available memberships, invalidate cookie and redirect to `/` for re-selection.

Acceptable window: up to 5 minutes of "zombie" access after revocation. Not a critical security issue because RLS still enforces (revoked tenant can't see any lease data). The portal UI renders empty states, which is the right behaviour.

### User has role memberships only from deleted orgs

Shouldn't happen — `user_orgs.deleted_at IS NULL` filter handles the agent path. Parallel filters on `user_orgs_tenants` etc. via the org's status should exclude deleted orgs. Defense-in-depth: role-resolution query explicitly joins `organisations` with a non-deleted filter.

### Delivery-alert deep link from BUILD_63 §9.5

A tenant clicks `app.pleks.co.za/login?redirect=/tenant/communications/{id}&via=delivery_alert`. After auth:

1. User authenticates.
2. Role-resolution runs.
3. If user has tenant role and `active_role` resolves to tenant: redirect to `/tenant/communications/{id}`.
4. If user has multiple roles and tenant isn't active: the `redirect` parameter tells us the target role. Post-auth logic reads `redirect`, infers target role from URL prefix, sets `pleks_active_role` to match, then redirects.

This is the one place where URL-derived role hints DO drive active-role selection. Safe because the target URL is still role-gated by middleware — if the user doesn't have tenant membership, middleware redirects to /403 even if the cookie was coerced.

---

## Security considerations

1. **Cookie-tampering does not grant data access.** RLS is the data boundary; `pleks_active_role` is routing state only. Worst case of a tampered cookie: user hits a URL their active_role doesn't permit, gets /403.

2. **Role-switcher validates membership server-side.** The `/switch-role` POST endpoint re-queries bridge tables to confirm the requested target role is legitimately available. Rejects unknown or stale role claims.

3. **Cookie rotation on role switch.** Every switch issues a fresh `pleks_active_role` cookie. No stale claims linger.

4. **Dual-write audit on every role switch.** Role switching is both a security event (changes the user's active authorization surface) and a business event (changes which data the user sees in the portal) — so it writes to both `auth_events` (BUILD_62 substrate) and `audit_log` (business trail), mirroring the dual-write pattern established by BUILD_63 §9.2 for portal logins.

   **Write 1 — `auth_events`:**
   ```
   event_type:    'role_switched'       -- must be added to BUILD_62 auth_events CHECK constraint
   user_id:       session.user_id
   aal:           session.aal
   auth_method:   'session_cookie'       -- no re-auth required for role switch
   success:       true
   session_id:    same uuid as audit_log row
   metadata:      { from_role, to_role, from_scope_id, to_scope_id, from_org_id, to_org_id }
   ```
   Consumed by: BUILD_62 step-up logic may require step-up before switching INTO high-privilege agent roles (future consideration, flagged open decision).

   **Write 2 — `audit_log`:**
   ```
   event_type:    'role_switched'
   entity_type:   'user'
   entity_id:     session.user_id
   session_id:    same uuid as auth_events row
   payload:       { from_role, to_role, from_scope_id, to_scope_id, from_org_id, to_org_id, auth_event_id }
   ```
   Consumed by: Tribunal activity trail, POPIA subject-access export.

   **BUILD_62 dependency:** `auth_events` CHECK constraint in migration 013 must include `'role_switched'`. If ADDENDUM_61B ships before BUILD_62, the `auth_events` write no-ops gracefully (same pattern as BUILD_63 §9.2). `audit_log` write is unconditional.

   Pairs with BUILD_63 §9.2 portal-login audit for a full activity trail.

5. **No role elevation via switcher.** The `/switch-role` endpoint only permits switching to roles already in `pleks_available_roles`. Cannot be used to "become" a role the user wasn't already granted.

---

## Acceptance criteria

- [ ] `/` on `app.pleks.co.za` renders role-selector for multi-role authenticated users
- [ ] Single-role users are auto-redirected past the selector to their workspace default
- [ ] Zero-role users are redirected to `/onboarding`
- [ ] Role-switcher component visible in top-left of every role workspace layout (tenant / landlord / agent / supplier)
- [ ] Role-switcher hidden for single-role users
- [ ] `/switch-role` POST endpoint validates target role is in available memberships before setting cookie
- [ ] `/switch-role` writes BOTH an `auth_events` row AND an `audit_log` row of type `role_switched`, linked by `session_id`. See security considerations §4 for dual-write rationale.
- [ ] `/403` page renders when middleware blocks a role mismatch
- [ ] `/403` offers switcher when other roles could access the target URL
- [ ] `pleks_active_role` cookie set on login, refreshed on switch
- [ ] `pleks_available_roles` cookie cached for 5 minutes
- [ ] Middleware reads active role from cookie; re-resolves when stale
- [ ] Middleware redirects to `/` (selector) when cookie missing and user has multiple roles
- [ ] Middleware redirects to default workspace when cookie missing and user has single role
- [ ] Role default routes defined in `ROLE_DEFAULT_ROUTES` manifest entry
- [ ] RLS policies unchanged — data access still scoped by `auth.uid()` and bridge tables, not by cookie
- [ ] Tampered `pleks_active_role` cookie does not grant data access (RLS still enforces)
- [ ] Revoked role membership invalidates active-role cookie within 5 minutes
- [ ] Delivery-alert deep link flow (BUILD_63 §9.5) correctly sets active role from URL redirect parameter after auth
- [ ] Multi-org agent case: role switcher handles role-type switching; org switcher (existing) handles org switching within agent role

---

## Open decisions

1. **Default role for returning multi-role users.** Proposed: use last-session active role if cookie still valid; else present selector. Alternative: always present selector on login. Selector-always is safer but adds friction for users who almost always use the same role. Lean: cookie-cached default with explicit "choose another workspace" option in the switcher.

2. **Role-selector design for 5+ memberships.** Grouped-by-role-type sections. Needs design pass before implementation. Out of scope for this spec (design task).

3. **Cross-role notifications.** If Alice gets a comm as tenant and switches to landlord workspace, does the tenant notification still surface? Proposed: no — notifications are scoped to the role context in which they were generated. Alice-as-landlord doesn't see tenant-context notifications.

4. **Session invalidation on role switch.** Some security-strict products invalidate the entire session on role switch (forces re-auth). Overkill for our model; cookie rotation is sufficient. Confirm.

5. **Role-switcher UX placement.** Top-left of layout is one option. Top-right in user menu is another. Mobile-first consideration: mobile agent view has a bottom bar (BUILD_57), tenant mobile has the same — where does the switcher go on mobile? Lean: inside the "More" sheet on mobile.
