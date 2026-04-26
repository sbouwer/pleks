# BUILD_61 — Route Alignment, Subdomain & Role Namespace

> Status: ✅ **Fully shipped** on branch `refactor/build-61-route-alignment` (2026-04-26)
> Type: Refactor (no new user-facing features) + structural namespace move
> Final scope: ~250 file changes
> Dependencies: none — pure refactor against current state
> Shipped before: BUILD_63 (so BUILD_63 is authored against the final URL shape from day one)
>
> **Shipped sub-phases:** (A) route-naming renames → `/payments→/billing`, `/contractors→/suppliers`, settings restructure, `/api/*` mirror renames, 16 permanent 308 redirects in `next.config.ts`. (B) role namespace renames → `(portal)→(tenant)` with `/portal/*→/tenant/*`, `(contractor)→(supplier)` with `/contractor/*→/supplier/*`. (C) `lib/routing/manifest.ts` + `lib/routing/hostname.ts` + `lib/auth/cookie-config.ts`. (D) `proxy.ts` rewritten as manifest-driven with longest-prefix match + agent role enforcement from `pleks_org` cookie + skipOrgCheck from manifest. (E) subdomain split wired in proxy: apex serves marketing, all product paths 308→`app.pleks.co.za`; cookies host-scoped via AUTH_COOKIE_OPTS.
>
> **Open follow-ups:** ADDENDUM_61A (conditional rendering audit — spec'd, not built), ADDENDUM_61B (multi-role navigation — spec'd, not built).

---

## Problem

Three coupled problems, addressed as one coherent refactor to avoid paying the touch-everything cost twice.

**1. Routes drifted from UI labels.** Sidebar says "Suppliers", URL says `/contractors`. Page heading says "Billing", URL says `/payments`. Sidebar says "Subscription", URL says `/settings/billing`. Sidebar says "Deposits", URL says `/settings/finance`. Sidebar groups "Templates" under "Documents", URL says `/settings/communication/templates`.

**2. No subdomain discipline.** Everything currently lives under one origin. Marketing content, agent product, tenant portal, landlord portal, contractor portal — all served from the same hostname. As we approach production go-live with real customers, we need a clean split between `pleks.co.za` (marketing, SEO, public content) and `app.pleks.co.za` (the authenticated product). Competitors universally do this (PropWorx: `propworx.co.za` + `app.propworx.co.za`; WeconnectU: `weconnectu.co.za` + three product subdomains). The right moment to introduce the split is now, before production, before any tenant has a bookmark.

**3. `/portal/*` as a URL segment is weak naming.** It's ambiguous ("whose portal?"), it doesn't scale to additional role namespaces, and it propagated through the codebase because we didn't push back on it early. The cleaner model: URL prefix = role context. Agent on unprefixed root (operational default). Tenant at `/tenant/*`. Landlord at `/landlord/*`. Supplier at `/supplier/*`. Applicant at `/apply/*`. Session identifies the user; URL prefix identifies the role context the user is currently operating in.

Doing these three renames in one pass avoids three separate touch-every-file change windows.

---

## Design decisions

### Route-naming

**[DECISION] UI routes and API routes renamed together.** Split-scope option rejected because it leaves the codebase half-renamed and support docs internally inconsistent.

**[DECISION] Webhook URLs NOT renamed.** `/api/webhooks/*` stays exactly as is. URLs are registered with external providers (PayFast, Peach, DocuSeal, Searchworx, Resend, Africa's Talking, Yodlee). Renaming requires coordination on every provider dashboard — external work, not a code refactor. Defer indefinitely.

**[DECISION] Cron routes (`/api/cron/*`) NOT renamed.** Already named by purpose.

**[DECISION] `(contractor)` route group renamed to `(supplier)` along with URL namespace.** Route group for the contractor-facing *portal* becomes `(supplier)` and lives at `/supplier/*`. This is consistent with the `/contractors` → `/suppliers` agent-side rename already in scope.

**[DECISION] Establish a `profile` (person) vs `details` (organisation) namespace split.** Today `/settings/profile` is ambiguous — it renders organisation details for agencies but is conceptually personal for landlord orgs. And `/settings/profile/signature` nested under it is user-scoped, not org-scoped. The fix: `profile` = person, `details` = organisation. Specifically:

- `/settings/profile` (org details page) → moves to `/settings/details`.
- `/settings/profile/signature` stays where it is — it's already correctly user-scoped.
- `/settings/profile` is replaced by a minimal stub landing page for the user surface (personal info read-only, link to Signature, note pointing agency users to Settings → Details).

**"account" deliberately NOT used.** Rejected because: (a) collides with `/settings/subscription`; (b) "account" is ambiguous in SaaS (login, subscription, workspace, tenant); (c) "details" is neutral.

**Database unchanged.** `organisations` table continues to serve both agency and landlord orgs. No migration.

**`/finance` hub stays.** Sidebar label "Overview" is contextual inside the Finance section; `/finance` as the hub URL is correct.

**Orphan settings pages (`/settings/applications`, `/settings/contractors`, `/settings/reports`) get an audit pass.** If nothing links to them, delete. If something does, document.

### Subdomain

**[DECISION] `app.pleks.co.za` is the single product surface.** All authenticated roles — agent, tenant, landlord, supplier, applicant — live under this subdomain. No per-role subdomains. No `portal.pleks.co.za` / `tenant.pleks.co.za` / etc. — those fragment the session layer and create cross-origin cookie problems.

**[DECISION] `pleks.co.za` apex is marketing-only.** Public website, pricing pages, marketing content. Stateless. No auth cookies set on the apex. Any form submissions on marketing go to `app.pleks.co.za/api/*` with explicit CORS.

**[DECISION] Central login gateway at `app.pleks.co.za/login`.** One login form. Email + password or magic link. Post-auth, session is issued with identity and available role memberships. Role-resolution + post-login routing is handled inside the app (see ADDENDUM_61B).

**[DECISION] No multi-role identity in URL.** Resource IDs parameterise resources (`/tenants/abc-123` = agent viewing tenant record), never user identity. Session identifies the logged-in user. The URL's first path segment identifies the role context that user is currently operating in.

**[DECISION] Cookies scoped to `app.pleks.co.za` only, not `.pleks.co.za`.** Auth cookies should not leak to the marketing site. Production `Domain` attribute = `app.pleks.co.za` (or omitted, which browsers default to host-only). Dev: no Domain attribute. Marketing forms are stateless; no auth cookie needed there.

### Role namespace

**[DECISION] No `/portal/` in URLs.** Replaced by explicit role namespaces.

| Role | Route prefix | Notes |
|------|-------------|-------|
| Agent (owner / property_manager / agent / accountant / maintenance_manager) | unprefixed | `/dashboard`, `/properties`, `/tenants`, `/leases`, `/finance`, `/settings`, etc. Operational default. |
| Tenant | `/tenant/` | Was `/portal/`. |
| Landlord | `/landlord/` | Was `/landlord-portal/` route group. |
| Supplier | `/supplier/` | Was `/contractor/` route group. |
| Applicant | `/apply/` | Unchanged. Public flow, no auth. |
| Admin | `/admin/` | Unchanged. Separate auth. |
| Demo | `/demo/` | Unchanged. No auth. |

**[DECISION] Schema names retain "portal" where appropriate.** Database names document *concepts*, not URLs. Do NOT rename:
- `portal_view` event type in `communication_delivery_events.event_type` CHECK
- `tenant_portal_login` audit event in `audit_log.event_type`
- `portal.tenant_invite` template key in `template-registry.ts`
- `pleks_portal` provider in `communication_delivery_events.provider` CHECK

These describe what the thing *is* (an authenticated in-product view of a notice by its recipient), which doesn't change because the URL changed.

**[DECISION] Permanent 308 redirects for every old → new path.** Covers in-flight bookmarks, email magic links that have already shipped (BUILD_49 tenant portal invites, if any have gone out), and support-doc URLs.

### Security model

**[DECISION] URL prefix IS the security boundary (coarse gate).** Middleware (`proxy.ts`) enforces that the session's active role matches the URL prefix. A tenant session cannot reach `/dashboard` or `/landlord/*`. A landlord session cannot reach `/dashboard` or `/tenant/*`. Agent sessions cannot reach `/tenant/*`, `/landlord/*`, or `/supplier/*` — agents view tenant data via agent-side routes like `/tenants/abc-123`, not by pretending to be the tenant.

**[DECISION] RLS remains the data boundary.** Middleware + URL prefix stops the wrong role from reaching a route. RLS stops the right role from seeing someone else's data. Three-layer model:

1. **Middleware (coarse):** URL prefix vs session active role.
2. **Server-component auth helpers (per-role):** `getTenantSession()`, `getAgentSession()`, `getLandlordSession()`, `getSupplierSession()` each called at the top of every page in their namespace.
3. **RLS (data gate):** Every tenant-data table scoped to the authenticated user's record via RLS policies.

**[DECISION] Canonical route manifest.** Single file at `lib/routing/manifest.ts` listing every route prefix and its permitted roles. Middleware reads from this. No ad-hoc role checks scattered through proxy.ts. New route added without a manifest entry fails a CI lint.

**[DECISION] Active-role discipline.** A multi-role user (e.g. tenant at one agency + landlord of their own property) has a session with multiple role memberships, but always exactly ONE `active_role` at a time. Role switching is explicit (UI action) and re-routes. No route ever tries to infer *which* role a user "probably is" at that URL.

### Dev and preview environment

**[DECISION] Single dev server on `localhost:3000`.** No subdomain simulation in dev. The subdomain split only matters in production. Hostname-resolution helper has dev and preview branches that default to "app context."

**[DECISION] `NEXT_PUBLIC_APP_URL` is the single source of truth for absolute URLs** in emails and deep links. Dev: `http://localhost:3000`. Preview: `https://pleks-<branch>.vercel.app`. Production: `https://app.pleks.co.za`. No hardcoded URLs in templates.

**[DECISION] Marketing site routes in dev mount under `/marketing/*`.** Production-only DNS-based split. Dev can visit `localhost:3000/marketing/pricing` to test marketing pages.

---

## Scope

### In scope

**Route-naming renames:**

| Area | From | To |
|---|---|---|
| Main-nav section | `/payments/*` | `/billing/*` |
| Main-nav section | `/contractors/*` | `/suppliers/*` |
| Settings item | `/settings/finance` | `/settings/deposits` |
| Settings item | `/settings/billing` | `/settings/subscription` |
| Settings item | `/settings/communication/templates` | `/settings/documents/templates` |
| Settings — org details | `/settings/profile` (org details page) | `/settings/details` — plus new stub page at `/settings/profile` |
| API — billing | `/api/payments/*` (excl. webhooks) | `/api/billing/*` |
| API — suppliers | `/api/contractors/*` | `/api/suppliers/*` |
| Orphan redirects | `/managing-schemes`, `/utilities` | Update targets to `/suppliers?type=…` |
| Orphan audit | `/settings/applications`, `/settings/contractors`, `/settings/reports` | Delete if dead, document if kept |

**Role namespace renames:**

| Area | From | To |
|---|---|---|
| Tenant route group | `(portal)` | `(tenant)` |
| Tenant URL prefix | `/portal/*` | `/tenant/*` |
| Landlord route group | `(landlord-portal)` | `(landlord)` |
| Landlord URL prefix | `/landlord/*` | `/landlord/*` (unchanged — already correct) |
| Supplier (was contractor) route group | `(contractor)` | `(supplier)` |
| Supplier URL prefix | `/contractor/*` | `/supplier/*` |

**Subdomain:**

| Environment | Before | After |
|-------------|--------|-------|
| Production apex | `pleks.co.za` (product) | `pleks.co.za` (marketing) |
| Production app | — (none) | `app.pleks.co.za` (product) |
| Dev | `localhost:3000` | `localhost:3000` (unchanged) |
| Preview | `<branch>-pleks.vercel.app` | `<branch>-pleks.vercel.app` (unchanged) |

### Out of scope (do not touch in this build)

- Building out the user profile surface (BUILD_62 follow-up).
- `/settings/profile/signature` stays exactly where it is.
- `/api/webhooks/*` (external providers own these URLs).
- `/api/cron/*` (already well-named).
- `/apply/*` (applicant portal — unchanged).
- `/admin/*` (admin surface — unchanged).
- `/demo/*` (demo route — unchanged).
- `/finance` root (correct name for Finance hub).
- Database table / column names — not a route concern.
- Tier-gating logic changes — this is pure refactor.
- Multi-role navigation UI — shipped in ADDENDUM_61B as a follow-up.
- Marketing website buildout — the `pleks.co.za` apex ships as whatever marketing content exists today (landing + pricing + legal pages). Full marketing rebuild is separate work.

---

## Full rename map

### A. Route-naming renames (was BUILD_61 original scope)

#### A1. `/payments` → `/billing`

Page routes (app directory moves):

```
app/(dashboard)/payments/                         → app/(dashboard)/billing/
app/(dashboard)/payments/page.tsx                 → app/(dashboard)/billing/page.tsx
app/(dashboard)/payments/layout.tsx               → app/(dashboard)/billing/layout.tsx
app/(dashboard)/payments/actions.ts               → app/(dashboard)/billing/actions.ts
app/(dashboard)/payments/PaymentsPageClient.tsx   → app/(dashboard)/billing/BillingPageClient.tsx (rename)
app/(dashboard)/payments/arrears/                 → app/(dashboard)/billing/arrears/
app/(dashboard)/payments/bulk-import/             → app/(dashboard)/billing/bulk-import/
app/(dashboard)/payments/debicheck/               → app/(dashboard)/billing/debicheck/
app/(dashboard)/payments/invoices/                → app/(dashboard)/billing/invoices/
app/(dashboard)/payments/municipal/               → app/(dashboard)/billing/municipal/
app/(dashboard)/payments/reconciliation/          → app/(dashboard)/billing/reconciliation/
```

Tab bar (`components/payments/PaymentsTabBar.tsx` → `components/billing/BillingTabBar.tsx`):
- Update all `href` values inside the tabs array from `/payments` → `/billing`.
- Rename the component to `BillingTabBar`.
- First tab labelled `"Payments"` — shows the payments list (legitimate sub-concept). Its href becomes `/billing`.
- Other tab labels unchanged (Invoices, Reconciliation, Arrears, Municipal, DebiCheck).

Component directory:
- `components/payments/` → `components/billing/`
- Top-level container concept: `Payments…` → `Billing…`.
- Individual payment-entity components (`PaymentRow`, `BatchPaymentEntry`) stay named "Payment" — refer to the payment record itself.

#### A2. `/contractors` → `/suppliers` (agent-side directory)

```
app/(dashboard)/contractors/                      → app/(dashboard)/suppliers/
app/(dashboard)/contractors/page.tsx              → app/(dashboard)/suppliers/page.tsx
app/(dashboard)/contractors/loading.tsx           → app/(dashboard)/suppliers/loading.tsx
app/(dashboard)/contractors/ContractorsClient.tsx → app/(dashboard)/suppliers/SuppliersClient.tsx (rename)
app/(dashboard)/contractors/ContractorsPageClient.tsx → app/(dashboard)/suppliers/SuppliersPageClient.tsx (rename)
app/(dashboard)/contractors/[id]/                 → app/(dashboard)/suppliers/[id]/
app/(dashboard)/contractors/[id]/page.tsx         → app/(dashboard)/suppliers/[id]/page.tsx
app/(dashboard)/contractors/[id]/ContractorSections.tsx → app/(dashboard)/suppliers/[id]/SupplierSections.tsx (rename)
app/(dashboard)/contractors/[id]/contact-details/ → app/(dashboard)/suppliers/[id]/contact-details/
app/(dashboard)/contractors/[id]/people/          → app/(dashboard)/suppliers/[id]/people/
```

Keep "Contractor" naming inside component tree where it refers to the contractor sub-type. The TABS array inside `SuppliersPageClient.tsx` distinguishes contractor / managing_scheme / utility — preserve.

#### A3. Settings renames

```
app/(dashboard)/settings/finance/                 → app/(dashboard)/settings/deposits/
app/(dashboard)/settings/billing/                 → app/(dashboard)/settings/subscription/
app/(dashboard)/settings/communication/templates/ → app/(dashboard)/settings/documents/templates/
# Remove empty app/(dashboard)/settings/communication/ directory after move.
```

Rename page exports:
- `FinanceSettingsPage` → `DepositsSettingsPage`
- (Analogous for Subscription; Templates page already named appropriately.)

#### A4. Profile → Details + user-profile stub

File moves:

```
app/(dashboard)/settings/profile/page.tsx         → app/(dashboard)/settings/details/page.tsx
app/(dashboard)/settings/profile/ProfileForm.tsx  → app/(dashboard)/settings/details/DetailsForm.tsx (rename)
app/(dashboard)/settings/profile/loading.tsx      → app/(dashboard)/settings/details/loading.tsx

app/(dashboard)/settings/profile/signature/       (UNCHANGED)
```

Component rename: `ProfileForm` → `DetailsForm`. Update imports.

Create new stub at `app/(dashboard)/settings/profile/page.tsx` (stub content shown in original BUILD_61 spec, unchanged). Shows current user's display name, email, phone (read-only from `user_profiles`), link to Signature, note pointing agency users to `/settings/details`.

**No redirect from `/settings/profile` → `/settings/details`.** URL is repurposed, not retired. See "Permanent redirects" below.

**Sidebar changes** (SettingsSidebar.tsx):
- Organisation group: `"Details"` item href `/settings/profile` → `/settings/details`.
- My Profile group: new `"Profile"` item with href `/settings/profile`, listed above `"Signature"`.

#### A5. API route renames

```
app/api/payments/screening/              → app/api/billing/screening/
app/api/payments/[paymentId]/receipt/    → app/api/billing/[paymentId]/receipt/

app/api/contractors/route.ts             → app/api/suppliers/route.ts
app/api/contractors/[id]/contact-details → app/api/suppliers/[id]/contact-details
app/api/contractors/[id]/people          → app/api/suppliers/[id]/people
app/api/contractors/[id]/portal-invite   → app/api/suppliers/[id]/portal-invite
```

Guard comment for `portal-invite`: endpoint is contractor-portal-specific. Must only permit invitation when `supplier_type === 'contractor'`.

#### A6. Orphan redirect updates

```ts
// app/(dashboard)/managing-schemes/page.tsx
-  redirect("/contractors?type=managing_scheme")
+  redirect("/suppliers?type=managing_scheme")

// app/(dashboard)/utilities/page.tsx
-  redirect("/contractors?type=utility")
+  redirect("/suppliers?type=utility")
```

#### A7. Orphan audit

```bash
grep -rn "settings/applications" app lib components brief
grep -rn "settings/contractors" app lib components brief
grep -rn "settings/reports" app lib components brief
```

For each: zero matches → delete folder. Matches found → leave route, add code comment documenting why kept.

### B. Role namespace renames (new scope)

#### B1. Tenant: `(portal)` → `(tenant)`, `/portal/*` → `/tenant/*`

```
app/(portal)/portal/                              → app/(tenant)/tenant/
app/(portal)/portal/layout.tsx                    → app/(tenant)/tenant/layout.tsx
app/(portal)/portal/page.tsx                      → app/(tenant)/tenant/page.tsx
app/(portal)/portal/access/                       → app/(tenant)/tenant/access/
app/(portal)/portal/account/                      → app/(tenant)/tenant/account/
app/(portal)/portal/lease/                        → app/(tenant)/tenant/lease/
app/(portal)/portal/maintenance/                  → app/(tenant)/tenant/maintenance/
app/(portal)/portal/payments/                     → app/(tenant)/tenant/payments/
```

Any files inside `lib/` that live under a `portal/` subdirectory related to the tenant portal (e.g. `lib/portal/inviteTenant.ts`): **stay as-is**. File-system naming under `lib/` describes feature domain ("the portal feature"), not URLs. Same reasoning as schema names.

Find/replace for URL paths only:

```
Find:    (['"`])/portal(['/?#"`])
Replace: $1/tenant$2
```

**Critical scoping rule during find/replace:**
- Skip hits in `lib/portal/*` file paths (these are import paths, not URL strings).
- Skip hits in schema / SQL / migration files (`portal_view`, `tenant_portal_login`, `portal.tenant_invite`, `pleks_portal` — all conceptual, not URLs).
- Skip hits in template-registry.ts for `portal.tenant_invite`, `portal.invite_reminder`, `portal.access_revoked` keys.
- Skip hits in code comments that use the word "portal" generically.

Review every hit manually. This is the most error-prone part of BUILD_61.

#### B2. Landlord: `(landlord-portal)` → `(landlord)`

```
app/(landlord-portal)/                            → app/(landlord)/
app/(landlord-portal)/landlord/                   (unchanged — subdirectory already /landlord)
```

URL paths under `/landlord/*` already correct — only the route-group name changes. No URL changes, no redirects needed.

Any server code referencing the route-group name (imports, comments) gets updated.

#### B3. Supplier (was contractor): `(contractor)` → `(supplier)`, `/contractor/*` → `/supplier/*`

```
app/(contractor)/                                 → app/(supplier)/
app/(contractor)/contractor/                      → app/(supplier)/supplier/
app/(contractor)/ContractorShell.tsx              → app/(supplier)/SupplierShell.tsx (rename)
app/(contractor)/layout.tsx                       → app/(supplier)/layout.tsx (content: update prop types)
```

**Nomenclature note:** the URL prefix changes from `/contractor/` to `/supplier/` but the user who logs in is still a "contractor" conceptually. Many suppliers in Pleks are specifically contractors (plumbers, electricians). However some suppliers are managing schemes or utilities who might use the portal for different purposes. "Supplier portal" as the generic name works for all three sub-types.

Find/replace:

```
Find:    (['"`])/contractor(['/?#"`])
Replace: $1/supplier$2
```

**Skip in find/replace:**
- `lib/actions/contractor*` (feature-domain, not URL).
- `components/contractor*` (feature-domain).
- References to the `contractors` database table or `contractor` supplier_type value.
- References to "contractor" as a role in user_orgs.role CHECK constraint (role name stays).
- `/api/suppliers/[id]/portal-invite` (API endpoint, not URL path).

#### B4. Tenant portal path references in BUILD_63 and any other specs

Every spec in `brief/build/` that references `/portal/*` for tenant-facing URLs updates to `/tenant/*`. See "Specs updated" section.

### C. Subdomain introduction

#### C1. DNS

**Pre-flight (manual, before code):**
- Add DNS CNAME record: `app.pleks.co.za` → Vercel (same target as apex).
- Verify DNS propagation before deploy.

**Apex remains** pointing at Vercel. Marketing content stays on apex deployment. If marketing is part of the same Next.js app, hostname-based routing in middleware handles which routes serve on which host.

#### C2. Hostname resolution helper

New file: `lib/routing/hostname.ts`

```ts
export type HostContext = 'marketing' | 'app';

export function resolveHostContext(host: string | null): HostContext {
  // Dev: localhost always resolves to 'app' context.
  if (process.env.NODE_ENV === 'development') return 'app';

  // Preview: Vercel preview URLs always resolve to 'app' context.
  // Marketing pages in preview are accessed via /marketing/* path prefix.
  if (process.env.VERCEL_ENV === 'preview') return 'app';

  // Production: hostname-based split.
  if (host?.startsWith('app.')) return 'app';
  return 'marketing';
}
```

#### C3. Proxy.ts / middleware update

`proxy.ts` gets a hostname check at the top. If hostname is marketing context, only serve marketing paths; if it's app context, serve app paths with full auth/role enforcement.

Updates to `proxy.ts`:

1. Replace the existing `isPublicRoute` list with a manifest-driven check (see C4 below).
2. Add hostname-based branch: if `resolveHostContext(request.headers.get('host'))` returns `'marketing'`, pass through only marketing routes. Anything else on the marketing host redirects to `app.pleks.co.za/login` (production only; dev/preview routes everything as 'app').
3. Add role-namespace auth check: if pathname starts with `/tenant/*`, require session with `active_role='tenant'`; `/landlord/*` → `active_role='landlord'`; `/supplier/*` → `active_role IN ('supplier','contractor')`; unprefixed agent routes → `active_role IN agent_roles`.

Existing `isOrgCheckSkipped` logic for onboarding / demo / tenant portal / contractor portal needs to be updated for the renamed paths: `/portal` → `/tenant`, `/contractor` → `/supplier`.

#### C4. Route security manifest

New file: `lib/routing/manifest.ts`

```ts
export const AGENT_ROLES = [
  'owner',
  'property_manager',
  'agent',
  'accountant',
  'maintenance_manager',
] as const;

export type AgentRole = typeof AGENT_ROLES[number];
export type PortalRole = 'tenant' | 'landlord' | 'supplier' | 'contractor';
export type SessionRole = AgentRole | PortalRole;

export interface RouteRule {
  auth: boolean;                       // session required?
  roles?: readonly SessionRole[];      // permitted active roles (omit for public)
  skipOrgCheck?: boolean;              // skip the org-membership check in proxy
  tokenGated?: boolean;                // token in URL grants access (no session needed)
}

/**
 * Every path prefix the app serves must have a manifest entry.
 * Longest match wins (e.g. /settings/profile/signature matches /settings first,
 * then refined by longer matches).
 *
 * New routes MUST be added here before shipping; CI lint enforces.
 */
export const ROUTE_MANIFEST: Record<string, RouteRule> = {
  // Public
  '/':                 { auth: false },
  '/login':            { auth: false },
  '/forgot-password':  { auth: false },
  '/reset-password':   { auth: false },
  '/register':         { auth: false },
  '/onboarding':       { auth: true, skipOrgCheck: true },
  '/pricing':          { auth: false },
  '/privacy':          { auth: false },
  '/terms':            { auth: false },
  '/credit-check-policy': { auth: false },
  '/for-agents':       { auth: false },
  '/for-landlords':    { auth: false },
  '/early-access':     { auth: false },
  '/migrate':          { auth: false },

  // Public token-gated
  '/apply':            { auth: false, tokenGated: true },
  '/invite':           { auth: false, tokenGated: true },
  '/public':           { auth: false, tokenGated: true },
  '/sign-signature':   { auth: false, tokenGated: true },
  '/property-info':    { auth: false, tokenGated: true },

  // Demo (public, fake data)
  '/demo':             { auth: false },

  // Admin (separate auth)
  '/admin':            { auth: false },   // handled by checkAdminAuth

  // Auth callbacks (Supabase)
  '/auth':             { auth: false },

  // Role-prefixed portals
  '/tenant':           { auth: true, roles: ['tenant'], skipOrgCheck: true },
  '/landlord':         { auth: true, roles: ['landlord'], skipOrgCheck: true },
  '/supplier':         { auth: true, roles: ['supplier', 'contractor'], skipOrgCheck: true },

  // Agent (unprefixed) — every top-level agent route registered here
  '/dashboard':        { auth: true, roles: AGENT_ROLES },
  '/properties':       { auth: true, roles: AGENT_ROLES },
  '/tenants':          { auth: true, roles: AGENT_ROLES },
  '/landlords':        { auth: true, roles: AGENT_ROLES },
  '/leases':           { auth: true, roles: AGENT_ROLES },
  '/applications':     { auth: true, roles: AGENT_ROLES },
  '/billing':          { auth: true, roles: AGENT_ROLES },
  '/finance':          { auth: true, roles: AGENT_ROLES },
  '/suppliers':        { auth: true, roles: AGENT_ROLES },
  '/maintenance':      { auth: true, roles: AGENT_ROLES },
  '/inspections':      { auth: true, roles: AGENT_ROLES },
  '/calendar':         { auth: true, roles: AGENT_ROLES },
  '/reports':          { auth: true, roles: AGENT_ROLES },
  '/documents':        { auth: true, roles: AGENT_ROLES },
  '/settings':         { auth: true, roles: AGENT_ROLES },
  '/hoa':              { auth: true, roles: AGENT_ROLES },
  '/managing-schemes': { auth: true, roles: AGENT_ROLES },
  '/utilities':        { auth: true, roles: AGENT_ROLES },
  '/statements':       { auth: true, roles: AGENT_ROLES },

  // Marketing (apex-only in production; prefixed in dev/preview)
  '/marketing':        { auth: false },
} as const;

/**
 * Webhook & API routes — handled separately in proxy.ts:
 * - /api/webhooks/*         → always public (HMAC-verified by handler)
 * - /api/cron/*             → always public (secret-verified by handler)
 * - /api/auth/*             → Supabase auth flows, public
 * - /api/admin/*            → admin auth (separate)
 * - /api/*                  → inherits auth from calling context (session check)
 */
```

#### C5. Proxy hostname + role enforcement

Replace the existing public-route check and `isOrgCheckSkipped` with manifest-driven lookups.

Pseudocode:

```ts
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host');
  const hostContext = resolveHostContext(host);

  // Admin has its own auth
  const adminResponse = checkAdminAuth(pathname, request);
  if (adminResponse) return adminResponse;

  // Webhooks pass through
  if (WEBHOOK_ROUTES.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // Host-based routing (production only)
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') {
    if (hostContext === 'marketing' && !isMarketingPath(pathname)) {
      // User hit an app path on the marketing host — redirect to app subdomain
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, `https://app.pleks.co.za`)
      );
    }
    if (hostContext === 'app' && isMarketingPath(pathname)) {
      // User hit a marketing path on the app host — redirect to apex
      return NextResponse.redirect(
        new URL(pathname + request.nextUrl.search, `https://pleks.co.za`)
      );
    }
  }

  // Look up manifest rule for this path
  const rule = findLongestMatchingRule(pathname, ROUTE_MANIFEST);

  // No manifest entry = let Next.js 404 handle it (and CI lint will have caught this)
  if (!rule) return NextResponse.next();

  // Public or token-gated routes
  if (!rule.auth) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // Auth required
  const { user, supabaseResponse } = await updateSession(request);
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Role enforcement
  if (rule.roles && rule.roles.length > 0) {
    const session = await resolveActiveRole(user.id, request);
    if (!rule.roles.includes(session.active_role)) {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  // Org-membership check (agent routes)
  if (!rule.skipOrgCheck) {
    const redirect = await ensureOrgCookies(user, request, supabaseResponse);
    if (redirect) return redirect;
  }

  return supabaseResponse;
}
```

Helper functions: `isMarketingPath(pathname)`, `findLongestMatchingRule(pathname, manifest)`, `resolveActiveRole(userId, request)`. Implementation details in CC handoff below.

#### C6. Cookie scoping

Update `lib/auth/cookie-config.ts` (new file consolidating the cookie pattern):

```ts
export const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  // No `domain` attribute — cookies are host-scoped to app.pleks.co.za in production,
  // localhost in dev. Marketing site on apex never sees auth cookies.
};
```

`proxy.ts` and `lib/supabase/middleware.ts` read from this. Audit any cookie `.set()` calls in the codebase to ensure none hardcode a different domain or path.

#### C7. Absolute URL generation

Audit every outbound URL generation site. Canonical pattern:

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const deepLink = `${appUrl}/login?redirect=/tenant/communications/${id}&via=delivery_alert`;
```

Vercel env vars to set:
- Production: `NEXT_PUBLIC_APP_URL=https://app.pleks.co.za`
- Preview: auto-populated by Vercel, or set explicitly to `https://${VERCEL_URL}`
- Development: `http://localhost:3000` in `.env.local`

Audit locations:
- `lib/comms/send-email.ts` — email URL construction.
- `lib/comms/templates/*` — any hardcoded URLs in React Email components.
- `lib/messaging/whatsapp/send.ts` — any WhatsApp template variable URLs.
- `lib/info-requests/sendInfoRequestEmail.tsx` (BUILD_60 Phase 20) — links to public `/property-info/[token]`.
- `lib/portal/inviteTenant.ts` — portal invite URL construction.
- Any `lib/reports/*` PDF/HTML that embeds URLs.

Zero hardcoded `http://localhost` or `https://pleks.vercel.app` or `https://pleks.co.za` strings in production code paths. Verify via grep.

#### C8. Supabase auth redirect URLs

Update Supabase dashboard (manual, pre-deploy):

- Add `https://app.pleks.co.za/auth/callback` to authorised redirect URLs.
- Add `https://app.pleks.co.za/reset-password` to authorised redirect URLs.
- Keep existing `http://localhost:3000/auth/callback` for dev.
- Keep existing preview URL pattern for branch previews.

Document this in the deploy runbook.

---

## Permanent redirects — `next.config.ts`

Combined redirects for route-naming + role namespace changes:

```ts
async redirects() {
  return [
    // ── Route-naming renames ──
    { source: '/payments',            destination: '/billing',            permanent: true },
    { source: '/payments/:path*',     destination: '/billing/:path*',     permanent: true },

    { source: '/contractors',         destination: '/suppliers',          permanent: true },
    { source: '/contractors/:path*',  destination: '/suppliers/:path*',   permanent: true },

    { source: '/settings/finance',    destination: '/settings/deposits',  permanent: true },
    { source: '/settings/billing',    destination: '/settings/subscription', permanent: true },
    { source: '/settings/communication/templates', destination: '/settings/documents/templates', permanent: true },
    { source: '/settings/communication/:path*',    destination: '/settings/documents/:path*',    permanent: true },

    { source: '/api/payments/screening',          destination: '/api/billing/screening',          permanent: true },
    { source: '/api/payments/:paymentId/receipt', destination: '/api/billing/:paymentId/receipt', permanent: true },
    { source: '/api/contractors',                 destination: '/api/suppliers',                  permanent: true },
    { source: '/api/contractors/:path*',          destination: '/api/suppliers/:path*',           permanent: true },

    // ── Role namespace renames ──
    { source: '/portal',              destination: '/tenant',             permanent: true },
    { source: '/portal/:path*',       destination: '/tenant/:path*',      permanent: true },

    { source: '/contractor',          destination: '/supplier',           permanent: true },
    { source: '/contractor/:path*',   destination: '/supplier/:path*',    permanent: true },

    // /landlord/* unchanged — route group renamed but URL prefix same.

    // NOTE: /settings/profile NOT redirected — URL is repurposed, not retired.
  ]
}
```

**Redirect lifecycle:** keep for at least 12 months after deploy. Cost is near-zero; benefit is any bookmark, email-link, or cached share continues working.

---

## Implementation steps (for CC)

Order matters — the redirects go first so intermediate states don't 404, and each logical chunk runs `npm run check` before proceeding.

### Step 0 — Commit strategy (post-ADDENDUM_00D)

BUILD_61 is a large refactor spanning ~200–300 file touches. Do NOT merge the whole thing as a single PR — reviewability and rollback atomicity both suffer. Each numbered step below is a natural PR boundary. Proposed PR sequence with conventional-commit titles:

| Step | PR title |
|------|----------|
| 1 | `chore(routing): add 15 permanent redirects for route-naming renames` |
| 2 | `feat(routing): add hostname + manifest scaffolding in lib/routing/` |
| 3 | `refactor(auth): consolidate cookie options into lib/auth/cookie-config.ts` |
| 4a | `refactor(routes): rename /payments to /billing` |
| 4b | `refactor(routes): rename /contractors to /suppliers` |
| 4c | `refactor(routes): rename /settings/finance|billing|communication` |
| 4d | `refactor(routes): split /settings/profile into details + profile + signature` |
| 4e | `refactor(api): rename /api/payments and /api/contractors` |
| 4f | `refactor(routes): update orphan page redirect targets` |
| 5a | `refactor(routes): rename /portal to /tenant` |
| 5b | `refactor(routes): rename (landlord-portal) route group to (landlord)` |
| 5c | `refactor(routes): rename /contractor to /supplier` |
| 6 | `feat(proxy): manifest-driven routing + role enforcement + hostname split` |
| 7 | `refactor(email): replace hardcoded URLs with NEXT_PUBLIC_APP_URL` |
| 8 | `docs(specs): update brief/ references from old paths to new` |
| 9 | `refactor(components): rename PortalShell/ContractorShell to TenantShell/SupplierShell (optional)` |
| 10 | `docs(index): register BUILD_61 + ADDENDUM_61B rollup in INDEX.md` |

Rationale for this split:

- **Step 1 first, alone.** Landing redirects before any folder moves means intermediate states (between steps 4a–4f) redirect rather than 404 in CI preview deploys.
- **Steps 4a–4f parallelised if needed.** Each is independent and mechanical — CC can do them sequentially for simplicity, or parallel if CI/review bandwidth allows.
- **Step 5a/5b/5c are higher-risk** (role namespace renames touch many call sites). Land them one at a time after Step 4 completes, and verify the auth flow on Vercel preview deploy between each.
- **Step 6 lands LAST** before docs (Step 8) and component polish (Step 9). This is the highest-risk change (proxy middleware) and must land on a stable URL foundation.

**Conventional commit type selection:**

- `refactor:` for code moves that don't change behaviour (Step 3, most of 4, 5, 9). No release bump.
- `feat:` for genuinely new capability (Step 2 routing scaffolding, Step 6 manifest-driven routing). Minor bump.
- `chore:` for config-only (Step 1 redirects, Step 10 INDEX update). No release bump.
- `docs:` for spec-only (Step 7 email URL audit if it only touches templates, Step 8). No release bump.

Doing this discipline cleanly means the BUILD_61 rollup produces maybe one minor release bump (from Step 6) and zero surprise major bumps. The release notes become a readable narrative of the refactor rather than a 200-file wall.

**CI implications per PR:**

- Every PR runs `Lint & Typecheck`, `Security (static Supabase checks)`, `Dependency CVE scan (Trivy)`, `PR title (Conventional Commits)` via `ci.yml`.
- Vercel preview deploy fires per PR and catches any runtime regression that typecheck missed (especially important on Step 6 where middleware changes can break the whole app).
- `npm run check` locally before pushing each PR is still the first line of defence — CI is a safety net, not the primary gate.

**Rollback atomicity:** each PR is one squash commit on `main`. Revert any single step cleanly via `git revert <sha>` and a follow-up PR.

### Step 1 — Add all redirects first

Add all 15 redirect entries to `next.config.ts`. Run dev, confirm old URLs redirect to (not-yet-existing) new paths. 404s at new paths are expected for now.

### Step 2 — Create `lib/routing/` scaffolding

Create `lib/routing/hostname.ts` (see §C2) and `lib/routing/manifest.ts` (see §C4). These are read-only utilities at this step; nothing uses them yet.

### Step 3 — Create `lib/auth/cookie-config.ts`

Consolidate cookie options (§C6). Refactor `proxy.ts` and `lib/supabase/middleware.ts` to import from it.

### Step 4 — Agent-side route-naming renames (§A1–A7)

One rename at a time, with `npm run check` after each:

1. `/payments` → `/billing` (folders + find/replace).
2. `/contractors` → `/suppliers` (folders + find/replace).
3. Settings renames (finance / billing / communication-templates).
4. Profile → Details + new stub page (see §A4).
5. API folder renames (§A5).
6. Orphan page redirect target updates (§A6).
7. Orphan audit (§A7).

After Step 4, the agent-side URL shape matches the final design. BUILD_61-original scope is effectively complete.

### Step 5 — Role namespace renames (§B1–B3)

**Step 5a: Tenant.** Move `app/(portal)/portal/` → `app/(tenant)/tenant/`. Run find/replace for `/portal/` → `/tenant/`, carefully scoped per §B1. `npm run check`.

**Step 5b: Landlord route group.** Rename `(landlord-portal)` → `(landlord)`. URL segment unchanged. `npm run check`.

**Step 5c: Supplier.** Move `app/(contractor)/contractor/` → `app/(supplier)/supplier/`. Find/replace for `/contractor/` → `/supplier/`, scoped per §B3. `npm run check`.

### Step 6 — Update `proxy.ts` for manifest-driven routing (§C3, §C5)

Replace the hardcoded public-route list and `isOrgCheckSkipped` with manifest-driven logic. Add role-based enforcement. Add hostname-based marketing/app split (production-only branch).

`isOrgCheckSkipped` currently skips for `/onboarding`, `/demo`, `/contractor`, `/portal` — update to `/onboarding`, `/demo`, `/supplier`, `/tenant`, `/landlord`. Or better: source from manifest (`skipOrgCheck: true` on each entry).

### Step 7 — Update outbound URLs to use `NEXT_PUBLIC_APP_URL` (§C7)

Audit and fix any hardcoded URLs in email templates, WhatsApp sends, PDF generators, notification handlers. Target: zero hardcoded `localhost`, `pleks.vercel.app`, or `pleks.co.za` strings.

### Step 8 — Update specs in `brief/`

```bash
grep -rln "/portal" brief/build/
grep -rln "/contractor" brief/build/
grep -rln "/payments" brief/build/
grep -rln "/contractors" brief/build/
grep -rln "/settings/finance" brief/build/
grep -rln "/settings/billing" brief/build/
grep -rln "/settings/communication" brief/build/
```

For each hit: update to new path, unless in archived / superseded spec. See "Specs updated" section for the complete list.

### Step 9 — Component file renames (optional polish)

See original BUILD_61 Step 9. Same scope. Add to this list:

```
app/(tenant)/tenant/PortalShell.tsx (if exists)  → TenantShell.tsx
app/(supplier)/ContractorShell.tsx               → SupplierShell.tsx
```

### Step 10 — Update `brief/build/INDEX.md`

Add BUILD_61 row reflecting the expanded scope. Flag the cascade:
- BUILD_61 (route alignment + subdomain + role namespace)
- ADDENDUM_61B (multi-role navigation)
- BUILD_63 URLs now reflect the new namespace

### Step 11 — Validate

```bash
npm run check          # typecheck + lint, zero errors, zero warnings
npm run dev            # start dev server
```

Note: `npm run build` locally is still expected pre-deploy (catches prerender errors that typecheck misses, per BUILD_63 `/tenant/communications` addition). CI does NOT duplicate the build step (ADDENDUM_00D D-CI-05 — Vercel's preview deploy is the authoritative build signal). If the local build fails but `npm run check` passes, Vercel preview deploy WILL catch it — but catching it locally first is faster.

Manual smoke test:

**Renamed URLs redirect correctly:**
- `localhost:3000/payments` → `/billing`
- `localhost:3000/contractors` → `/suppliers`
- `localhost:3000/portal/dashboard` → `/tenant/dashboard`
- `localhost:3000/contractor/jobs` → `/supplier/jobs`
- `localhost:3000/settings/finance` → `/settings/deposits`
- etc.

**New URLs render without errors.**

**Role enforcement:**
- Log in as agent. Try `localhost:3000/tenant/dashboard` — should redirect to `/403` or `/`.
- Log in as tenant. Try `localhost:3000/dashboard` — should redirect to `/403` or `/`.
- Log in as landlord. Try `localhost:3000/tenant/*` — blocked. Try `localhost:3000/landlord/*` — allowed.
- No session. Try any auth-required path — redirected to `/login?redirect=...`.

**Cookies:**
- Auth cookie set on `localhost` (dev) — should have no `Domain` attribute.
- No cookie leaks to `/marketing/*` paths (dev).

**Email URLs:**
- Trigger a test notification (portal invite, info request, info request reminder) in dev. Verify generated URL starts with `http://localhost:3000`.

Security audit:

```bash
npm run security:quick
```

---

## Migration strategy & safety

**Why redirects first.** Next.js checks redirects before routing. Adding redirects first means during the intermediate state (folder moved, links not yet all updated), old paths redirect rather than 404.

**Why one rename at a time.** `npm run check` after each chunk catches problems at the source. Batching all renames then trying to compile leaves you debugging 8 problems at once.

**Why route-naming before role namespace.** The route-naming renames (§A) are mechanical and well-scoped. The role namespace renames (§B) have more widespread find/replace risk. Completing §A first builds momentum and finds any tooling issues before the riskier work.

**Safe rollback.** Each rename is a git commit. Partial rollback is safe because each step leaves the app in a green state.

**Cookie migration risk.** Users with existing sessions: when the auth cookie options change, any active session might be lost if the cookie attributes differ from what the user's browser stored. Acceptable given (a) no production users yet and (b) worst case = one re-login.

**Middleware change risk.** Replacing `proxy.ts` logic with manifest-driven lookups is the highest-risk change. Do it last (Step 6) with extensive testing. If anything breaks in production, rollback is a single file revert.

---

## Known risks

1. **Regex false positives during find/replace.** High risk for role namespace renames (§B) because "portal" and "contractor" appear in many contexts (code comments, feature names, DB schema). Mitigation: scope rules in §B1 and §B3, review every hit manually.

2. **Schema name vs URL name divergence after rename.** `portal_view` event type lives at `/tenant/communications/:id`. Future contributors may get confused. Mitigation: add a comment at each schema definition pointing out the naming rationale ("name retained for conceptual clarity even though URL says /tenant/").

3. **Email templates with hard-coded URLs.** Mitigation: Step 7 audits and fixes. Grep `localhost`, `pleks.co.za`, `vercel.app` in email / template code paths.

4. **Cron configurations referencing old paths.** Low risk — crons are at `/api/cron/*` which isn't renamed. Verify `vercel.json` cron entries don't reference any renamed API paths.

5. **External integrations.** Not yet live, so no external URLs out in the wild. Good reason to do this before going live.

6. **Documentation drift.** Step 8 catches this. Also update `CLAUDE.md` if it references old URL paths.

7. **Multi-role users mid-migration.** If any existing users have multiple role memberships, make sure the active-role resolution (new in Step 6) has a deterministic default. Spec'd in ADDENDUM_61B but the default-picker logic needs to exist even before the UI role-switcher ships.

8. **Supabase auth redirect URLs out of date.** Manual pre-flight in §C8. If missed, magic-link auth breaks in production after DNS switch.

9. **Subdomain DNS not in place at deploy time.** Pre-flight check. DNS propagation can take hours. Cut over only after DNS is confirmed.

10. **Hostname-resolution logic too eager in dev/preview.** Mitigation: `resolveHostContext` explicitly short-circuits on `NODE_ENV=development` and `VERCEL_ENV=preview` to always return 'app'. Tested in Step 11.

---

## Tier access rules

N/A. Pure refactor, no tier-gating logic changes.

---

## Specs updated

These specs reference old paths and need updating in Step 8:

| Spec | Changes |
|------|---------|
| `BUILD_49_TENANT_PORTAL.md` | `/portal/*` → `/tenant/*` throughout. |
| `BUILD_58_WHATSAPP_INTEGRATION.md` | Any URL references in message templates. |
| `BUILD_63_TENANT_COMMUNICATION_LIFECYCLE.md` | All `/portal/*` → `/tenant/*`. `/portal/login` → `/login`. Delivery-alert deep link target updated to `app.pleks.co.za/login?redirect=/tenant/communications/{id}&via=delivery_alert`. |
| `ADDENDUM_48A_COMMS_FOUNDATION.md` | Any `/portal/*` references. |
| `BUILD_19_CONTRACTOR_PORTAL.md` | `/contractor/*` → `/supplier/*`. |
| `BUILD_46_LANDLORD_PORTAL.md` | Route-group name; URL unchanged. |
| `CLAUDE.md` | Update any URL examples. |

Schema names stay — `portal_view`, `tenant_portal_login`, `portal.tenant_invite`, `pleks_portal` — all retained as conceptual names.

---

## Follow-up work (separate specs)

- **ADDENDUM_61B — Multi-role navigation.** Role-resolution logic at login (read all role-membership bridge tables, build session.available_roles). Single-role vs multi-role landing. Role-switcher UI. Active-role persistence in `pleks_active_role` + `pleks_active_org` cookies. RLS implications.
- **BUILD_62 — User profile surface buildout.** `/settings/profile` stub expanded into security, preferences, personal info editing.
- **ADDENDUM_61A — Conditional-rendering audit.** Verify every Settings page renders sensibly for landlord-type orgs. Scope is audit + tweaks, not rebuild.

---

## Validation checklist

### Agent-side route-naming

- [ ] All 15 redirects in place in `next.config.ts`
- [ ] `app/(dashboard)/billing/` exists, `app/(dashboard)/payments/` does not
- [ ] `app/(dashboard)/suppliers/` exists, `app/(dashboard)/contractors/` does not
- [ ] `app/(dashboard)/settings/deposits/` exists, `app/(dashboard)/settings/finance/` does not
- [ ] `app/(dashboard)/settings/subscription/` exists, `app/(dashboard)/settings/billing/` does not
- [ ] `app/(dashboard)/settings/documents/templates/` exists, `app/(dashboard)/settings/communication/` does not
- [ ] `app/(dashboard)/settings/details/` exists with `DetailsForm.tsx`
- [ ] `app/(dashboard)/settings/profile/page.tsx` is new user-profile stub
- [ ] `app/(dashboard)/settings/profile/signature/` UNCHANGED
- [ ] `app/api/billing/*` exists, `app/api/payments/*` (except webhooks) does not
- [ ] `app/api/suppliers/*` exists, `app/api/contractors/*` does not
- [ ] `/managing-schemes` redirects to `/suppliers?type=managing_scheme`
- [ ] `/utilities` redirects to `/suppliers?type=utility`
- [ ] Orphan audit completed and documented

### Role namespace

- [ ] `app/(tenant)/tenant/` exists, `app/(portal)/portal/` does not
- [ ] `app/(landlord)/landlord/` exists, `app/(landlord-portal)/` does not
- [ ] `app/(supplier)/supplier/` exists, `app/(contractor)/contractor/` does not
- [ ] `(tenant)`, `(landlord)`, `(supplier)` route groups mount correctly
- [ ] All redirects work: `/portal/*` → `/tenant/*`, `/contractor/*` → `/supplier/*`
- [ ] Schema names retained: grep confirms `portal_view`, `tenant_portal_login`, `portal.tenant_invite`, `pleks_portal` all still present in SQL and TS
- [ ] `lib/portal/` directory untouched (feature-domain naming, not URL)

### Subdomain + security

- [ ] `lib/routing/hostname.ts` exists with dev/preview short-circuits
- [ ] `lib/routing/manifest.ts` exists and is exhaustive for all current routes
- [ ] `lib/auth/cookie-config.ts` exists; no cookie `.set()` call in the codebase hardcodes a `domain` attribute
- [ ] `proxy.ts` reads from `ROUTE_MANIFEST` for auth / role checks
- [ ] `proxy.ts` enforces role-namespace alignment: tenant session can't reach agent routes, etc.
- [ ] `proxy.ts` has hostname-based branch (production-only) for apex = marketing, `app.` = product
- [ ] Production env: `NEXT_PUBLIC_APP_URL=https://app.pleks.co.za`
- [ ] Dev env: `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- [ ] Preview env: resolves to current preview URL
- [ ] Zero hardcoded absolute URLs in email / template code paths (grep check)
- [ ] Supabase dashboard: `https://app.pleks.co.za/auth/callback` added to redirect URLs
- [ ] DNS CNAME for `app.pleks.co.za` confirmed

### Validation

- [ ] `npm run check` passes with 0 errors, 0 warnings
- [ ] `npm run security:quick` passes with 0 critical findings
- [ ] Manual smoke tests pass (see Step 11)
- [ ] Agent session blocked from `/tenant/*`, `/landlord/*`, `/supplier/*`
- [ ] Tenant session blocked from agent routes, `/landlord/*`, `/supplier/*`
- [ ] Landlord session blocked from agent routes, `/tenant/*`, `/supplier/*`
- [ ] Supplier session blocked from agent routes, `/tenant/*`, `/landlord/*`
- [ ] `brief/build/INDEX.md` updated
- [ ] All spec files in "Specs updated" section updated
