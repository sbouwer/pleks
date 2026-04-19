# BUILD_62 — Authentication & Account Security

**Status:** Spec'd · **Parts:** A (native hardening) + B (passkey layer), independently shippable
**Depends on:** BUILD_01 (auth foundation), BUILD_61 (route alignment & `app.pleks.co.za` namespace), ADDENDUM_61B (multi-role navigation & `pleks_active_role` cookie), `009_security.sql` (RLS hardening)
**Unlocks:** no other builds block on this, but it is a release-gate for first production agency customer
**Slot rationale:** claims the reserved BUILD_62 slot previously earmarked as "user profile surface — security, preferences, richer profile page." Scope narrowed to the security surface only. Preferences + broader profile polish deferred to BUILD_64 or a later addendum.

**Touches:** `lib/auth/`, `lib/security/`, `lib/messaging/` (login-notification template), `proxy.ts`, `app/(auth)/login/`, `app/settings/security/`, `app/settings/team/sessions/`, `app/tenant/account/security/`, `app/landlord/account/security/`, `app/supplier/account/security/`, `app/api/auth/`, `supabase/migrations/013_auth_security.sql`, `supabase/migrations/014_passkeys.sql`, Supabase Auth configuration in the dashboard, Resend templates, `public/.well-known/security.txt`

**Scope:** close the single-factor-auth gap that exists across all account types today. Deliver mandatory TOTP for agent accounts with step-up on trust-account-adjacent actions, session-management UI on both agent and user-portal surfaces, new-device login notifications, and a full WebAuthn/passkey layer with `localhost` + `app.pleks.co.za` environment isolation. Establish `auth_events` as the dedicated authentication audit table so BUILD_63 can wire its `tenant_portal_login` events into the same substrate (BUILD_63 adopts a dual-write pattern to `auth_events` + `audit_log` per BUILD_63 §9.2 — both tables serve different consumers and retention windows).

**Does not touch:** account preferences page (BUILD_64), marketing site auth (there is none — marketing apex is unauthenticated), Firm-tier SSO/SAML (future), hardware-key-only flows (supported but not marketed as required), bio-metric-only authentication without a paired credential.

---

## 1 · Problem statement

Pleks has no multi-factor authentication today. Every account across every role — agent, tenant, landlord, supplier, contractor — is protected by a single factor: either a password or a magic link delivered to the registered email. There is no step-up challenge on sensitive actions. There is no user-visible session history. There is no mechanism by which a tenant or agent can discover that someone logged into their account from an unfamiliar device. Passwords are stored in Supabase Auth without a leaked-password check. There is no `security.txt` advertising a responsible-disclosure channel.

Competitor reconnaissance (TPN RentBook, WeConnectU/RedRabbit, PropWorx) found no public evidence that any competitor advertises, surfaces, or enforces MFA. PropWorx's tenant portal documentation references temporary passwords emailed in plaintext. WeConnectU's CMS had a leaked content key visible in page titles as of April 2026. None of the three surface login history or session revocation to their users. This is a category-wide weakness.

The regulatory environment is actively tightening. The Information Regulator launched an eServices breach-reporting portal in April 2025 with a "reasonably sure, not fully investigated" trigger for notification. Pam Golding Properties reported a cyber incident involving unauthorised access to its CRM in March 2025, notified affected clients, the Regulator, and SAPS — a live reminder that even well-funded SA property businesses are being breached and that contact-detail exposure alone is sufficient to trigger a POPIA §22 notification obligation. Penalties run up to ZAR 10 million per contravention plus imprisonment for serious offences.

Pleks handles trust-account-adjacent data, deposit reconciliation, lease documents with Home Affairs ID numbers, bank account details, and POPIA-sensitive tenant personal information. The current auth posture is not defensible for our first regulated agency customer, and it is not defensible if we ever need to respond to an Information Regulator inquiry. This build closes that gap.

---

## 2 · Non-goals

- **Account preferences UI** (notification frequency, language, timezone) — future BUILD_64
- **Rich profile page** (avatar, bio, vanity URL) — future BUILD_64
- **SSO / SAML for Firm tier** — Phase 2 enterprise work; not required for first customer
- **Hardware-key-only agent flows** (YubiKeys are supported as WebAuthn authenticators by default but we do not require them)
- **SMS or WhatsApp as an MFA factor** — SIM-swap risk in SA is material; Supabase Phone MFA is deliberately not enabled
- **Biometric-only auth without a paired credential** — biometric is always the unlock for a stored credential (passkey or platform auth), never the credential itself
- **Automatic account lockout on N failed attempts** — rate-limiting handled at proxy level; aggressive lockout creates a denial-of-service vector against legitimate tenants
- **Central SIEM integration** — `auth_events` is the substrate; shipping to a SIEM is a Phase 3 ops task

---

## 3 · Design decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-AUTH-01 | Agents must enrol TOTP on a second device at onboarding. Passkey (when available) is primary; TOTP is recovery factor **and** the step-up challenge for trust-account actions. | Passkeys can be lost with a device. Supabase Auth has no native recovery codes; enrolling a second TOTP factor is the recommended workaround (up to 10 factors per user). Defensible as a Firm-tier marketing claim. |
| D-AUTH-02 | Production WebAuthn RP ID and origin: `app.pleks.co.za` only. Not changeable after Part B ships. | Passkeys are origin-bound. Any change invalidates every enrolled credential. Locked in permanently. |
| D-AUTH-03 | Dev WebAuthn RP ID: `localhost`. No intermediate staging environment for passkeys. Re-enrolment on deploy is part of the testing discipline. | `localhost` is a browser-blessed secure context. `*.vercel.app` is on the Public Suffix List and cannot safely host passkeys. Running a third custom-domain environment is not worth the DNS overhead for one QA loop. |
| D-AUTH-04 | Claims BUILD_62 slot (previously reserved for user-profile-surface-with-security). Does not renumber BUILD_63. | BUILD_63 has forward references in INDEX.md, BUILD_61, and a planned ADDENDUM_63A (DebiCheck comms). Renumbering creates cross-reference drift with no upside. |
| D-AUTH-05 | BUILD_62 structured as Part A (native Supabase hardening) + Part B (passkey layer). Part A independently shippable. | Part A closes the POPIA and trust-account gaps on native features alone. Part B is a UX upgrade that should not block Part A's release gate. |
| D-AUTH-06 | BUILD_62 authored against the post-BUILD_61 URL namespace: `app.pleks.co.za`, `/tenant/*`, `/landlord/*`, `/supplier/*`, central `/login` gateway. | BUILD_61 ships before BUILD_62. Authoring against legacy `/portal/*` URLs would require a rewrite. |
| D-AUTH-07 | Session-minting bridge for passkey auth: use `supabase.auth.admin.generateLink({type:'magiclink'})` server-side after WebAuthn verification, consume the token server-side, return the session to the client. Migration to Supabase Auth Hooks deferred to Phase 2 if that API stabilises. | `generateLink` is stable and well-documented. Auth Hooks are newer surface area. Pick the boring option for Phase 1. Reversible. |
| D-AUTH-08 | Discoverable credentials (resident keys) are the default on enrolment. AllowList fallback is supported for email-entered login flows. | Discoverable keys enable browser autofill ("Sign in with …") which is the killer-UX story. AllowList remains for older authenticators. Both at once is supported by SimpleWebAuthn with zero extra complexity. |
| D-AUTH-09 | Hardware keys (YubiKey, SoloKey, Titan, etc.) are supported by default via standard WebAuthn. Not required. Not marketed except on Firm-tier sales material. | Same code path as platform authenticators. Zero extra work. Optional hardware-key requirement is future Firm-tier policy. |
| D-AUTH-10 | `auth_events` is a dedicated table, not a re-use of `audit_log`. | Different retention (POPIA security events: 7 years; general audit may differ), different access pattern (per-user recency scans for session UI), different content (no `old_values`/`new_values`). `audit_log` stays focused on data mutation. |
| D-AUTH-11 | Step-up challenge freshness window: 5 minutes. A passkey or TOTP verification within the last 5 minutes satisfies a step-up requirement. | Long enough to handle multi-step flows (open refund screen → review → approve). Short enough that a forgotten-open-tab cannot quietly perform a sensitive action hours later. |
| D-AUTH-12 | Device-trust cookie (Part B §6.6 follow-on): the passkey **is** the device trust. No separate `device_trust` cookie. | A passkey bound to a device is a cryptographic device identity. A bearer cookie claiming "trusted device" is strictly weaker. Also avoids cookie-clear re-prompts for users who have a passkey. |
| D-AUTH-13 | TOTP is mandatory for any account that can reach `/dashboard` (agent-role accounts across all tiers including Owner). Optional for tenant / landlord / supplier accounts. | Agent accounts touch trust-account-adjacent data. Owner tier is single-user but the data sensitivity is the same. Tenant/landlord/supplier portals have narrower blast radius; forced MFA on every user friction-kills adoption. |
| D-AUTH-14 | Login-notification email fires on new-device login for every role on every tier, including Owner. | Free (Resend is already in the stack). Adds material security value for tenants and landlords who never enable MFA. Competitors do not do this. |

---

## 4 · Dependencies and ordering

Ships after:

- **BUILD_61** (route alignment). URL prefixes `/tenant/*`, `/landlord/*`, `/supplier/*`, central `/login`, `app.pleks.co.za` host. If BUILD_61 slips, BUILD_62 can be authored in parallel but cannot ship until BUILD_61 lands.
- **ADDENDUM_61B** (multi-role navigation). The `pleks_active_role` cookie mechanics. Step-up challenges need to know the active role context in order to return the user to the right workspace post-challenge.
- **`009_security.sql`** (RLS hardening, WITH CHECK audit). Already shipped. Provides the baseline cross-org isolation BUILD_62 assumes.

Can ship before:

- **BUILD_63** (tenant communication lifecycle). BUILD_63 references a `tenant_portal_login` event type; §5.6 of this spec creates `auth_events` as the table where that event type lives. BUILD_63 then references `auth_events` instead of defining its own table.

Does not block:

- **BUILD_58** (WhatsApp). Runs in parallel. WhatsApp is a comms channel, not an auth channel. We deliberately do not use WhatsApp for MFA.
- **Searchworx API integration** (30-day parallel track per founder). Independent workstream.

---

## 5 · Part A — Native Supabase Hardening

Ships in weeks 1–2 of the 30-day plan. Closes the POPIA and trust-account gaps on native features alone. Every feature in Part A uses either Supabase Auth primitives, existing infrastructure (Resend, `audit_log`, `consent_log`), or one new migration (`013_auth_security.sql`).

### 5.1 Tier 0 — Supabase Auth configuration

One-time configuration changes in the Supabase dashboard. No code required. Apply to production project first, then mirror on any development project.

| Setting | Path in dashboard | Value | Rationale |
|---------|-------------------|-------|-----------|
| Leaked password protection (HIBP) | Authentication → Policies → Password protection | **On** | Rejects new passwords that appear in Have I Been Pwned breach corpora. Free. |
| Minimum password length | Authentication → Policies | **10** | 8 is the NIST floor; 10 catches most trivial passwords without being user-hostile. |
| Password strength requirements | Authentication → Policies | **Lower, upper, digit required** | Symbol requirement is research-backed-against (forces predictable substitutions). Skip it. |
| JWT expiry | Authentication → Sessions | **3600** (1 hour) | Access token lifetime. Refresh token rotation remains on. |
| Refresh token rotation | Authentication → Sessions | **On** | Already default. Confirm. |
| Refresh token reuse interval | Authentication → Sessions | **10 seconds** | Default. Confirm. |
| Agent session maximum | Custom cookie `pleks_auth_ttl` on `/dashboard` paths | **7 days** | Overrides Supabase refresh lifetime for agent-role accounts. Enforced by our proxy, not Supabase. |
| Tenant / landlord / supplier session maximum | Same cookie mechanism, on `/tenant/*`, `/landlord/*`, `/supplier/*` | **30 days** | Lower-blast-radius roles get longer sessions to reduce friction. |
| Inactivity auto-logout | Cookie sliding expiry | **30 days** | Any role inactive for 30 days → force re-auth. |
| Confirm email on signup | Authentication → Email | **On** for tenants/applicants, **On** for agents | Already on. Confirm. |

Verification: after applying, run a test that (a) tries to register with a known-breached password like `Password1!` and gets rejected, and (b) inspects a fresh access token and confirms a 1-hour expiry.

### 5.2 Migration `013_auth_security.sql`

New tables. Applied as a forward-only migration per the amend-forward rule. No modifications to 001–012.

```sql
-- supabase/migrations/013_auth_security.sql
-- BUILD_62 Part A: authentication security substrate

-- 5.2.1 auth_events — dedicated authentication audit table
CREATE TABLE auth_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organisations(id),   -- nullable: pre-role-selection events
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  event_type        text NOT NULL CHECK (event_type IN (
                      'login_success',
                      'login_failure',
                      'logout',
                      'password_changed',
                      'email_changed',
                      'totp_enrolled',
                      'totp_unenrolled',
                      'totp_verified',
                      'totp_failed',
                      'passkey_enrolled',
                      'passkey_unenrolled',
                      'passkey_verified',
                      'passkey_failed',
                      'step_up_challenged',
                      'step_up_verified',
                      'step_up_failed',
                      'session_revoked',
                      'new_device_detected',
                      'recovery_used',
                      'role_switched',           -- mirrors ADDENDUM_61B audit entry
                      'tenant_portal_login',     -- consumed by BUILD_63
                      'landlord_portal_login',
                      'supplier_portal_login',
                      'agent_portal_login'
                    )),
  auth_method       text CHECK (auth_method IN (
                      'password', 'magic_link', 'totp', 'passkey', 'recovery_code', 'oauth', 'admin'
                    )),
  active_role       text,                                  -- tenant/landlord/supplier/agent role at event time
  aal               text CHECK (aal IN ('aal1','aal2')),   -- Supabase assurance level, if applicable
  ip_hash           text,                                  -- sha256(ip + daily_salt), NEVER raw IP
  ip_country        text,                                  -- ISO 3166-1 alpha-2, resolved at event time
  ip_city           text,                                  -- city-level only, never lat/lng
  ip_asn            integer,                               -- for risk signals
  user_agent_hash   text,                                  -- sha256(UA string), full UA retained in device_fingerprints
  device_label      text,                                  -- "Chrome on macOS" — user-friendly, derived from UA
  device_fingerprint uuid REFERENCES device_fingerprints(id),  -- forward ref; see 5.2.3
  session_id        text,                                  -- Supabase access_token JTI or passkey session ID
  success           boolean NOT NULL,
  failure_reason    text,                                  -- non-null iff success=false
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Append-only: explicitly block UPDATE and DELETE at policy level
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_events_select_self" ON auth_events
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "auth_events_select_org_admin" ON auth_events
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'property_manager')
        AND deleted_at IS NULL
    )
  );
CREATE POLICY "auth_events_insert_service" ON auth_events
  FOR INSERT WITH CHECK (false);  -- service-role only, via gateway
-- NO UPDATE policy → updates rejected
-- NO DELETE policy → deletes rejected
-- Retention: 7 years (POPIA security-compromise evidence window). Cron in §5.8 purges older rows.

CREATE INDEX idx_auth_events_user_created ON auth_events(user_id, created_at DESC);
CREATE INDEX idx_auth_events_org_created ON auth_events(org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX idx_auth_events_type_created ON auth_events(event_type, created_at DESC);
CREATE INDEX idx_auth_events_device ON auth_events(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- 5.2.2 login_notifications_sent — dedup for new-device email alerts
CREATE TABLE login_notifications_sent (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id),
  device_fingerprint  uuid NOT NULL REFERENCES device_fingerprints(id),
  last_notified_at    timestamptz NOT NULL DEFAULT now(),
  notification_count  integer NOT NULL DEFAULT 1,
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE login_notifications_sent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "login_notifications_self" ON login_notifications_sent
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "login_notifications_insert_service" ON login_notifications_sent
  FOR INSERT WITH CHECK (false);
CREATE POLICY "login_notifications_update_service" ON login_notifications_sent
  FOR UPDATE USING (false) WITH CHECK (false);

CREATE INDEX idx_login_notifications_user ON login_notifications_sent(user_id);

-- 5.2.3 device_fingerprints — stable identity for "known device" tracking
CREATE TABLE device_fingerprints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  fingerprint_hash  text NOT NULL,                -- sha256(user_agent + accept_language + resolved_tz)
  user_agent        text NOT NULL,
  label             text NOT NULL,                -- "Chrome on macOS — Cape Town", user-editable
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_ip_country   text,
  last_ip_city      text,
  revoked_at        timestamptz,                  -- null = active; set = user revoked; sessions rejected
  UNIQUE(user_id, fingerprint_hash)
);

ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_fingerprints_self_select" ON device_fingerprints
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "device_fingerprints_self_update" ON device_fingerprints
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());  -- user may edit label or revoke
CREATE POLICY "device_fingerprints_insert_service" ON device_fingerprints
  FOR INSERT WITH CHECK (false);
CREATE POLICY "device_fingerprints_no_delete" ON device_fingerprints
  FOR DELETE USING (false);  -- preserve for audit; revocation is soft

CREATE INDEX idx_device_fingerprints_user ON device_fingerprints(user_id);

-- 5.2.4 step_up_challenges — ephemeral step-up tokens
CREATE TABLE step_up_challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  action         text NOT NULL CHECK (action IN (
                   'trust_account_write',
                   'deposit_refund_approval',
                   'bank_detail_change',
                   'team_role_change',
                   'subscription_change',
                   'tenant_data_deletion',
                   'ownership_transfer',
                   'security_settings_change',
                   'passkey_unenroll',
                   'totp_unenroll',
                   'bulk_export'
                 )),
  resource_id    uuid,                             -- the record being acted on, if applicable
  required_aal   text NOT NULL DEFAULT 'aal2' CHECK (required_aal IN ('aal2')),
  challenge_token text NOT NULL UNIQUE,            -- random 32-byte hex, used as form field
  verified_at    timestamptz,                      -- null until verified
  consumed_at    timestamptz,                      -- null until action is performed using this token
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE step_up_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "step_up_challenges_self" ON step_up_challenges
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "step_up_challenges_insert_service" ON step_up_challenges
  FOR INSERT WITH CHECK (false);
CREATE POLICY "step_up_challenges_update_service" ON step_up_challenges
  FOR UPDATE USING (false) WITH CHECK (false);

CREATE INDEX idx_step_up_challenges_user_expires ON step_up_challenges(user_id, expires_at);

-- Cron cleanup via pg_cron every 15 minutes — delete where expires_at < now() - interval '1 hour'
-- (small grace so a failed step-up can be debugged from auth_events before the challenge row is gone)

-- 5.2.5 RLS helper: is_mfa_verified(window_minutes)
-- Returns true if the current user has verified a second factor within the window.
-- Used by code paths (not by RLS — RLS can't easily read session claims).
CREATE OR REPLACE FUNCTION is_mfa_fresh(window_minutes int DEFAULT 5)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth_events
    WHERE user_id = auth.uid()
      AND event_type IN ('totp_verified','passkey_verified','step_up_verified')
      AND success = true
      AND created_at > (now() - make_interval(mins => window_minutes))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5.2.6 auth_events retention purge helper
CREATE OR REPLACE FUNCTION purge_old_auth_events()
RETURNS void AS $$
  DELETE FROM auth_events
  WHERE created_at < (now() - interval '7 years');
$$ LANGUAGE sql SECURITY DEFINER;

-- Schedule via pg_cron monthly:
-- SELECT cron.schedule('purge-auth-events', '0 3 1 * *', 'SELECT purge_old_auth_events();');
```

Cross-org isolation note: `auth_events` is intentionally user-scoped rather than org-scoped for SELECT. A user with memberships in multiple orgs sees all of their own auth events from a single surface. The org-admin SELECT policy additionally allows an org owner to see auth events of all users within their org (for the `/settings/team/sessions` view). This is correct: an org owner is the data controller for employees who log into their org's workspace and is entitled to see when and from where those logins occurred.

### 5.3 Agent-side mandatory TOTP

Enforced for any user with a `user_orgs` record in an agent role (`owner`, `property_manager`, `agent`, `accountant`, `maintenance_manager`). Not enforced for tenants, landlords, or suppliers — see §5.7 for their optional path.

#### 5.3.1 Enrolment flow

Triggered in three contexts:

1. **Fresh agent signup** (existing owner onboarding at `/onboarding`, new staff accepting an invite at `/invite/[token]`). TOTP enrolment added as a mandatory step between account creation and first access to `/dashboard`.
2. **Existing agent without TOTP, first login after BUILD_62 release.** Middleware at `/dashboard` detects absent TOTP factor, redirects to `/settings/security/enrol-totp` with a `required=true` flag. User cannot reach `/dashboard` until both TOTP factors are enrolled.
3. **Voluntary re-enrolment** from `/settings/security`. User may remove and re-enrol if they change authenticator apps. Unenrolment is a step-up-gated action (D-AUTH-11).

#### 5.3.2 Two-factor-at-onboarding requirement

D-AUTH-01 requires that agents enrol **two** TOTP factors at onboarding — on two different devices. Rationale: Supabase Auth has no native recovery codes; losing a phone without a backup factor means admin-side account recovery which is slow, error-prone, and a denial-of-service vector. Two factors on two devices is the native workaround.

Enrolment UI at `/settings/security/enrol-totp`:

```
┌─────────────────────────────────────────────────────────────┐
│  Set up two-factor authentication                            │
│                                                               │
│  You need to set up TWO authenticator devices. This is your  │
│  recovery path if one device is lost.                        │
│                                                               │
│  Step 1 of 2 — Primary device                                │
│  ────────────────────────────────                            │
│  [QR CODE]                                                    │
│                                                               │
│  Scan this QR code with an authenticator app like            │
│  Google Authenticator, Authy, or 1Password.                  │
│                                                               │
│  Or enter this code manually:                                │
│  JBSWY3DPEHPK3PXP                                            │
│                                                               │
│  Enter the 6-digit code from your app:                       │
│  [ _ _ _ _ _ _ ]  [Verify]                                   │
│                                                               │
│  Friendly name for this device (optional):                   │
│  [ My iPhone ]                                                │
└─────────────────────────────────────────────────────────────┘
```

After verifying factor 1, the same UI appears for Step 2 of 2 (secondary device). Completion requires both verifications to succeed. No `/dashboard` access granted until both are done.

If the user only has one device available, they can click "I only have one device right now" which accepts the single factor but flags the account as `mfa_recovery_pending = true` on `user_profiles`. The user sees a persistent amber banner on every page — "Add a second authenticator device to protect your account against lost phones" → link to `/settings/security/enrol-totp`. After 14 days of `mfa_recovery_pending = true`, the banner upgrades to a modal-on-dashboard-load that must be dismissed, which does not block but friction-reminds.

#### 5.3.3 Login challenge flow

On every login attempt to `/login` from an agent account:

1. User submits email + password (or completes magic-link round-trip).
2. Supabase Auth returns `aal1` session.
3. Client calls `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. If `nextLevel === 'aal2'` and `currentLevel === 'aal1'`, render the MFA challenge page at `/login/mfa`.
4. User enters 6-digit code from their authenticator app.
5. `supabase.auth.mfa.challengeAndVerify({ factorId, code })` is called. On success, the session is promoted to `aal2`.
6. Middleware now permits `/dashboard` access.
7. Insert `auth_events` row: `event_type='totp_verified', success=true, aal='aal2'`.

Error paths:

- Wrong code → `event_type='totp_failed', success=false, failure_reason='invalid_code'`. Rate limit: 5 failures per user per 15 minutes → return 429 to proxy, user sees "Too many attempts. Try again in 15 minutes." Lockout is not account-lockout; it is factor-lockout — user can still complete auth with their second factor from a different device.
- Second factor required (user has no verified TOTP factor) → redirect to `/settings/security/enrol-totp?mandatory=true`.

#### 5.3.4 Remove-factor flow (step-up gated)

Removing a TOTP factor is a step-up action (D-AUTH-11). User must prove `aal2` within the last 5 minutes before the unenrol button is enabled. If fewer than two factors would remain after removal and the account is an agent account, unenrol is blocked entirely — show message "Agent accounts require two authenticator devices. Add a replacement before removing this one."

### 5.4 Step-up authentication for sensitive actions

The AAL model (D-AUTH-11) is the engine. A step-up action is any action listed in §5.2.4's `step_up_challenges.action` CHECK enum.

#### 5.4.1 Actions that require step-up

| Action | Examples | Required recent auth |
|--------|----------|----------------------|
| `trust_account_write` | Record a manual trust ledger entry, adjust trust balance | TOTP or passkey, ≤5 min old |
| `deposit_refund_approval` | Click "Approve refund" on a deposit case | TOTP or passkey, ≤5 min old |
| `bank_detail_change` | Update org bank account (trust or business), update landlord payout bank | TOTP or passkey, ≤5 min old |
| `team_role_change` | Change another user's `user_orgs.role`, invite with agent-level role, transfer ownership | TOTP or passkey, ≤5 min old |
| `subscription_change` | Upgrade / downgrade tier, cancel subscription, update billing card | TOTP or passkey, ≤5 min old |
| `tenant_data_deletion` | Any POPIA deletion request, any soft-delete of a tenant record | TOTP or passkey, ≤5 min old |
| `ownership_transfer` | BUILD_56 ownership-transfer flow | TOTP or passkey, ≤5 min old |
| `security_settings_change` | Modify own MFA factors, device list, passkeys | TOTP or passkey, ≤5 min old |
| `passkey_unenroll` | Remove a passkey | TOTP or different passkey, ≤5 min old |
| `totp_unenroll` | Remove a TOTP factor | TOTP or passkey, ≤5 min old |
| `bulk_export` | Any export that touches >100 tenant records | TOTP or passkey, ≤5 min old |

#### 5.4.2 Step-up challenge flow

Server-side action (e.g. approving a deposit refund):

```ts
// app/actions/deposits/approve-refund.ts
'use server'
import { gateway } from '@/lib/supabase/gateway'
import { requireStepUp } from '@/lib/auth/step-up'

export async function approveRefund(caseId: string, stepUpToken: string | null) {
  const gw = await gateway()
  if (!gw) return { error: 'Not authenticated' }

  // Verify step-up
  const stepUp = await requireStepUp({
    userId: gw.userId,
    action: 'deposit_refund_approval',
    resourceId: caseId,
    providedToken: stepUpToken
  })
  if (!stepUp.verified) {
    // Returns the challenge_token the UI must consume via /login/step-up modal
    return { stepUpRequired: true, challengeToken: stepUp.challengeToken }
  }

  // Proceed with refund…
  const { db, orgId } = gw
  // …
}
```

`requireStepUp` lives in `lib/auth/step-up.ts`:

1. If `providedToken` is null: insert a new `step_up_challenges` row with a fresh `challenge_token` and 5-minute expiry. Return `{verified: false, challengeToken}`.
2. If `providedToken` is supplied: load the row. Check `user_id = current user`, `action = expected action`, `expires_at > now()`, `consumed_at IS NULL`. Check that `verified_at IS NOT NULL` and `now() - verified_at < 5 minutes`. If all pass: set `consumed_at = now()`, return `{verified: true}`. Otherwise return `{verified: false}`.

#### 5.4.3 Step-up UI modal

When a server action returns `stepUpRequired: true`, the client opens a modal at any route via a global `<StepUpModal />` component mounted in the agent root layout:

```
┌─────────────────────────────────────────────────────────────┐
│  Confirm it's you                                            │
│                                                               │
│  You're about to approve a deposit refund of R 4 500.        │
│  Enter the code from your authenticator app to continue.     │
│                                                               │
│  [ _ _ _ _ _ _ ]                                             │
│                                                               │
│  [Cancel]                                [Confirm →]         │
└─────────────────────────────────────────────────────────────┘
```

On submit: POST to `/api/auth/step-up` with `{challengeToken, code}`. Server validates the TOTP code against Supabase Auth factor, sets `step_up_challenges.verified_at = now()`, returns 200. Client re-calls the original server action with the now-verified `challengeToken`. Second call succeeds.

For Part B (passkey) users, the modal shows "Use passkey" as the primary CTA and "Use authenticator code" as a secondary link. Passkey flow uses a WebAuthn authentication ceremony scoped to `action: 'step_up'`; details in §6.5.

#### 5.4.4 Step-up exceptions

- **Fresh login does NOT grant step-up freshness.** A user who logs in via TOTP can immediately perform a step-up action because their `totp_verified` event is <5 minutes old. This is correct — they have proven `aal2` very recently.
- **Passkey login grants step-up freshness.** Same reasoning: `passkey_verified` counts as a fresh AAL2 event.
- **Magic-link login does NOT grant step-up freshness**, because magic-link is `aal1` only. A magic-linked agent can reach `/dashboard` (since their existing TOTP factor still satisfies the `nextLevel` check — wait, actually it doesn't: magic link + TOTP verification both need to happen). Clarification: agent accounts logging via magic link still must complete the TOTP challenge at `/login/mfa` before reaching `/dashboard`. Magic link alone does not satisfy the MFA requirement for agents.
- **Step-up challenge is single-use.** Once `consumed_at` is set, the token cannot be reused. A second sensitive action in the same flow requires a second step-up. This is strict and correct.

### 5.5 Session-management UI

Two surfaces. Users see their own. Org admins additionally see their team.

#### 5.5.1 Agent self-view: `/settings/security/sessions`

Surface the user's own authentication activity. Data source: `auth_events` filtered to `user_id = auth.uid()`.

Layout:

```
┌─────────────────────────────────────────────────────────────┐
│  Your sign-in activity                                       │
│  ───────────────────────                                     │
│                                                               │
│  Active sessions                                              │
│  ─────────────                                                │
│  ● Chrome on macOS — Cape Town, ZA                           │
│    Current session · Signed in 3 hours ago                   │
│    [This is me]                                              │
│                                                               │
│  ○ Safari on iPhone — Cape Town, ZA                          │
│    Signed in yesterday                                       │
│    [Revoke this session]                                     │
│                                                               │
│  [Revoke all other sessions]                                 │
│                                                               │
│  Recent activity (last 30 days)                              │
│  ────────────────────────────                                │
│  Today 09:14  Signed in         Chrome · macOS · Cape Town   │
│  Yesterday    Signed in         Safari · iPhone · Cape Town  │
│  3 Apr 16:02  Password changed  Chrome · macOS · Cape Town   │
│  2 Apr 11:30  Signed in         Chrome · macOS · Cape Town   │
│  1 Apr 08:45  Passkey used      Chrome · macOS · Cape Town   │
│  …                                                           │
│                                                               │
│  [Load more]                                                 │
│                                                               │
│  Not you? Contact us at security@pleks.co.za                 │
└─────────────────────────────────────────────────────────────┘
```

Active sessions are distinct from recent activity. "Active session" means a refresh token that has been used within the past 24 hours on a specific `device_fingerprint`. "Recent activity" is the append-only event stream.

Revoke-session action:

1. User clicks "Revoke this session" on a row.
2. POST to `/api/auth/revoke-session` with `{device_fingerprint_id}`.
3. Server calls `supabase.auth.admin.signOut(sessionId, 'global')` for any session tied to that fingerprint. (Supabase scope: 'global' revokes all refresh tokens for the user; 'local' revokes only the current session. For per-device revocation we need to identify which `session_id` belongs to the fingerprint — track in `auth_events.session_id`.)
4. Mark `device_fingerprints.revoked_at = now()`.
5. Insert `auth_events` with `event_type='session_revoked'`.

"Revoke all other sessions" revokes everything except the current session. Uses `signOut(currentSession, 'others')`.

#### 5.5.2 Org-admin team-view: `/settings/team/sessions`

Visible only to `user_orgs.role IN ('owner','property_manager')`. Lists every user in the org with their most recent login and currently-active sessions. Admin can revoke any team member's sessions (requires step-up — `team_role_change` action is close enough, or add `admin_session_revoke` action).

#### 5.5.3 Tenant / landlord / supplier self-view

Same substrate, scoped to the user's own events. Routes:

- `/tenant/account/security` — tenant self-view + optional TOTP + optional passkey
- `/landlord/account/security` — same for landlords
- `/supplier/account/security` — same for suppliers

These pages land in the existing portal layouts (BUILD_49 tenant portal, BUILD_46 landlord portal, BUILD_19 supplier portal renamed in BUILD_61). No new layout work — one new page component per role prefix.

Mobile consideration: the tenant portal is used heavily on budget Androids. The security page must render as a clean list on 375px viewports with 44px minimum touch targets. Session revocation confirmation is a native-feeling `<AlertDialog>` from shadcn/ui, not a custom modal.

### 5.6 Login-notification emails

Triggered on any event where `auth_events.event_type = 'login_success' AND device_fingerprint IS NEW OR NOT SEEN IN 30 DAYS`.

#### 5.6.1 Detection logic

```ts
// lib/auth/new-device-check.ts
export async function maybeNotifyNewDevice({
  userId, deviceFingerprintId, eventId
}: {
  userId: string;
  deviceFingerprintId: string;
  eventId: string;
}) {
  const gw = await serviceGateway();

  // Has this user ever been notified about this device?
  const { data: existing } = await gw.db
    .from('login_notifications_sent')
    .select('id, last_notified_at, notification_count')
    .eq('user_id', userId)
    .eq('device_fingerprint', deviceFingerprintId)
    .maybeSingle();

  if (existing) {
    // If last notification was >30 days ago, re-notify (device presumed forgotten / reassigned)
    const daysSince = (Date.now() - new Date(existing.last_notified_at).getTime()) / 86400000;
    if (daysSince < 30) return;  // dedup
    // else continue and update counter
  }

  // Fetch user email + event details
  const { data: user } = await gw.db.auth.admin.getUserById(userId);
  const { data: event } = await gw.db
    .from('auth_events')
    .select('created_at, device_label, ip_city, ip_country, auth_method')
    .eq('id', eventId)
    .single();

  await sendLoginNotificationEmail({
    to: user.email,
    userName: user.user_metadata?.full_name ?? 'there',
    deviceLabel: event.device_label,
    city: event.ip_city,
    country: event.ip_country,
    method: event.auth_method,
    timeAgo: 'just now',
    revokeUrl: `https://app.pleks.co.za/settings/security/sessions?revoke=${deviceFingerprintId}`
  });

  await gw.db.from('login_notifications_sent').upsert({
    user_id: userId,
    device_fingerprint: deviceFingerprintId,
    last_notified_at: new Date().toISOString(),
    notification_count: (existing?.notification_count ?? 0) + 1
  }, { onConflict: 'user_id,device_fingerprint' });

  // Emit auth_events entry for observability
  await gw.db.from('auth_events').insert({
    user_id: userId,
    org_id: null,
    event_type: 'new_device_detected',
    success: true,
    device_fingerprint: deviceFingerprintId,
    metadata: { notification_sent: true, previous_notifications: existing?.notification_count ?? 0 }
  });
}
```

Hook this into the login-success path after `auth_events` insert, before returning the session to the client. Runs asynchronously — do not block the login redirect on email send.

#### 5.6.2 Email template

New Resend template: `login-notification.tsx` in `lib/messaging/emails/`.

Subject: `New sign-in to your Pleks account`

Body (paraphrased, actual React Email component):

```
Hi {{userName}},

Your Pleks account was just accessed from a device we don't recognise.

  When:     {{timeAgo}}
  Where:    {{city}}, {{country}}
  Device:   {{deviceLabel}}
  Method:   {{method}} ("password", "magic link", "passkey", …)

If this was you, you can safely ignore this email.

If this wasn't you, [revoke this session and secure your account]({{revokeUrl}}).

Questions? Reply to this email, or reach us at security@pleks.co.za.

— Pleks
```

Mobile-friendly plain-text fallback auto-generated by React Email.

#### 5.6.3 Suppression cases

- Do not notify on the device fingerprint that completed the TOTP enrolment flow for a fresh account. That device is self-evidently known.
- Do not notify if the user is actively on the email-confirmation flow of a fresh signup (their first login is not a "new device" in any meaningful sense).
- Do not notify during admin-initiated sessions (`auth_method = 'admin'` — used for support impersonation in future; not in scope for Phase 1 but the metadata field is reserved).

### 5.7 Optional TOTP + optional passkey for tenants / landlords / suppliers

Offered in settings at `/tenant/account/security`, `/landlord/account/security`, `/supplier/account/security`. Not prompted during onboarding. Not required to use the portal.

UI pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  Extra protection                                             │
│  ───────────────                                             │
│                                                               │
│  Add a second sign-in check for your account.               │
│                                                               │
│  ○ Authenticator app (TOTP)                                  │
│    Use Google Authenticator, Authy, or 1Password.            │
│    [Set up]                                                   │
│                                                               │
│  ○ Passkey (recommended)                                     │
│    Sign in with your fingerprint or face recognition.        │
│    [Set up]                                                   │
└─────────────────────────────────────────────────────────────┘
```

No mandatory-enrol flow. Users who opt in do so deliberately. Enrolment triggers a step-up-like protection: once TOTP or passkey is set up, subsequent security-settings changes require step-up (D-AUTH-11).

### 5.8 `security.txt` and responsible-disclosure channel

Create `public/.well-known/security.txt`:

```
Contact: mailto:security@pleks.co.za
Contact: https://app.pleks.co.za/security-contact
Expires: 2027-04-19T00:00:00.000Z
Encryption: https://app.pleks.co.za/.well-known/pleks-security-pgp.asc
Preferred-Languages: en
Canonical: https://app.pleks.co.za/.well-known/security.txt
Policy: https://app.pleks.co.za/security
```

Expiry: set to one year out, refresh via calendar reminder. Annual maintenance is the expected burden and is worth it for the signal value.

Backing email address: `security@pleks.co.za` routed to a dedicated triage inbox (can be a Resend inbound or a simple alias into the founder's primary inbox with label filtering). Inbox monitored at least weekly.

Optional: PGP key at `/.well-known/pleks-security-pgp.asc`. Worth doing; adds credibility. Use a fresh key, not a personal key.

Marketing copy hook: `/security` page summarises the auth posture (mandatory agent MFA, passkey-primary, step-up on trust actions, session-management, login notifications) and explicitly compares to competitor posture. Not hyperbolic — factual. See §8 follow-on work.

---

## 6 · Part B — Passkey Layer

Ships in weeks 3–4 of the 30-day plan. Built on top of Part A. All Part A mechanisms (MFA challenge, step-up, session UI, login notifications, auth_events) continue to work unchanged; passkey is an additional factor that can substitute for TOTP in most flows and can serve as primary login on supported devices.

### 6.1 Architecture

WebAuthn is **not natively available** as a Supabase Auth factor as of April 2026 (Supabase docs list `totp` and `phone` as the supported factor types; `webauthn` is roadmap). Part B implements passkeys as a custom layer on top of Supabase Auth using the [SimpleWebAuthn](https://simplewebauthn.dev/) library on both client and server.

High-level flow:

1. User completes a primary-factor auth (password, magic-link, or — post-enrolment — a passkey authentication ceremony).
2. Server verifies the primary factor.
3. Server mints a Supabase session via `supabase.auth.admin.generateLink({type:'magiclink'})` → consume the token server-side → return access + refresh tokens to the client.
4. Session is an ordinary Supabase session from that point forward. RLS, middleware, AAL machinery all work unchanged.

For the AAL story specifically: a passkey authentication ceremony that completes successfully is treated as `aal2` in our code paths (recorded in `auth_events.aal='aal2'`, satisfies `is_mfa_fresh()` helper, satisfies step-up freshness check). Supabase's native `getAuthenticatorAssuranceLevel()` API does not know about our custom passkeys — it will return `aal1` because no native MFA factor was used. This is the key asymmetry CC needs to handle: our in-house helpers (`requireStepUp`, `isMfaFresh`) must check `auth_events` for recent passkey verifications in addition to calling Supabase's AAL API.

### 6.2 Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@simplewebauthn/server": "^10.0.0",
    "@simplewebauthn/browser": "^10.0.0"
  }
}
```

Both are MIT-licensed, actively maintained, widely used (Okta, 1Password, Passage use SimpleWebAuthn or its patterns). Zero per-use cost.

### 6.3 Migration `014_passkeys.sql`

```sql
-- supabase/migrations/014_passkeys.sql
-- BUILD_62 Part B: passkey (WebAuthn) layer

CREATE TABLE user_passkeys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id       bytea NOT NULL UNIQUE,             -- raw credential ID from authenticator
  public_key          bytea NOT NULL,                    -- COSE-encoded public key
  counter             bigint NOT NULL DEFAULT 0,         -- WebAuthn sign count for cloning detection
  transports          text[] NOT NULL DEFAULT '{}',      -- 'usb','nfc','ble','internal','hybrid'
  device_type         text NOT NULL CHECK (device_type IN ('singleDevice','multiDevice')),
                                                         -- 'multiDevice' indicates a syncable passkey
                                                         -- (iCloud keychain, Google Password Manager)
  backup_eligible     boolean NOT NULL DEFAULT false,
  backup_state        boolean NOT NULL DEFAULT false,    -- BS flag from authenticator data
  label               text NOT NULL,                     -- "iPhone", "YubiKey 5C", user-editable
  aaguid              uuid,                              -- authenticator attestation GUID (type hint)
  rp_id               text NOT NULL,                     -- 'app.pleks.co.za' or 'localhost'
  origin              text NOT NULL,                     -- 'https://app.pleks.co.za' or 'http://localhost:3000'
  last_used_at        timestamptz,
  last_used_ip_hash   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);

ALTER TABLE user_passkeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_passkeys_self_select" ON user_passkeys
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_passkeys_self_update" ON user_passkeys
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());  -- label edit + revoke only
CREATE POLICY "user_passkeys_insert_service" ON user_passkeys
  FOR INSERT WITH CHECK (false);
CREATE POLICY "user_passkeys_no_delete" ON user_passkeys
  FOR DELETE USING (false);

CREATE INDEX idx_user_passkeys_user ON user_passkeys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_passkeys_credential ON user_passkeys(credential_id);
CREATE INDEX idx_user_passkeys_rp ON user_passkeys(rp_id);    -- environment-scoped lookups

-- Ephemeral challenges for registration and authentication ceremonies
CREATE TABLE passkey_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
                                                     -- nullable for discoverable-login challenges
  challenge       bytea NOT NULL,                    -- raw random 32 bytes
  ceremony_type   text NOT NULL CHECK (ceremony_type IN ('registration','authentication','step_up')),
  action          text,                              -- for ceremony_type='step_up': action being confirmed
  rp_id           text NOT NULL,
  origin          text NOT NULL,
  client_ip_hash  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at     timestamptz
);

ALTER TABLE passkey_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passkey_challenges_no_client_access" ON passkey_challenges
  FOR SELECT USING (false);
-- All access via service-role gateway

CREATE INDEX idx_passkey_challenges_expires ON passkey_challenges(expires_at);

-- Cron cleanup via pg_cron every 15 minutes — delete where expires_at < now() - interval '1 hour'
```

Design notes:

- `rp_id` and `origin` are stored per-credential so we can filter out dev-environment credentials in production queries and vice versa. `localhost` credentials simply don't appear in `app.pleks.co.za` lookups, and `app.pleks.co.za` credentials are invisible in `localhost` dev.
- `counter` monotonically increases with each use. If the authenticator reports a counter <= stored, we reject the authentication — this is the cloning-detection invariant from the WebAuthn spec. For multi-device syncable passkeys (`device_type = 'multiDevice'`, iCloud/Google sync), counter may always be 0; we honour the spec's guidance and skip counter enforcement for `device_type = 'multiDevice'`.
- `revoked_at` is soft-delete. A revoked credential is not considered for future authentications but its record survives for audit.

### 6.4 Registration ceremony (passkey enrolment)

Triggered from `/settings/security` (any role). User must be authenticated with at least `aal1` to begin enrolment. Agents must be `aal2` (step-up-gated, per D-AUTH-11 `security_settings_change`).

#### 6.4.1 Server routes

- `POST /api/auth/passkeys/registration-options` — returns options to kick off the ceremony
- `POST /api/auth/passkeys/registration-verify` — verifies the authenticator response and persists the credential

#### 6.4.2 Registration-options endpoint

```ts
// app/api/auth/passkeys/registration-options/route.ts
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/auth/passkeys/rp-config';
import { gatewaySSR } from '@/lib/supabase/gateway';

export async function POST(req: Request) {
  const gw = await gatewaySSR();
  if (!gw) return new Response('Unauthenticated', { status: 401 });

  const rp = getRpConfig(req);  // returns {rpId, origin, rpName} based on hostname

  // Load existing credentials to prevent re-registering the same authenticator
  const { data: existing } = await gw.db
    .from('user_passkeys')
    .select('credential_id, transports')
    .eq('user_id', gw.userId)
    .eq('rp_id', rp.rpId)
    .is('revoked_at', null);

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: gw.userEmail,
    userDisplayName: gw.userDisplayName,
    userID: new TextEncoder().encode(gw.userId),
    timeout: 60_000,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',        // discoverable when possible (D-AUTH-08)
      userVerification: 'preferred',
      authenticatorAttachment: undefined  // allow both platform and cross-platform
    },
    excludeCredentials: existing?.map(c => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransport[]
    })) ?? []
  });

  // Persist challenge for verification step
  await gw.db.from('passkey_challenges').insert({
    user_id: gw.userId,
    challenge: Buffer.from(options.challenge, 'base64url'),
    ceremony_type: 'registration',
    rp_id: rp.rpId,
    origin: rp.origin,
    client_ip_hash: await hashIp(req)
  });

  return Response.json(options);
}
```

#### 6.4.3 Registration-verify endpoint

```ts
// app/api/auth/passkeys/registration-verify/route.ts
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/auth/passkeys/rp-config';

export async function POST(req: Request) {
  const gw = await gatewaySSR();
  if (!gw) return new Response('Unauthenticated', { status: 401 });

  const body = await req.json();
  const { response, label } = body;  // response = RegistrationResponseJSON from browser
  const rp = getRpConfig(req);

  // Find the most recent outstanding challenge
  const { data: challenge } = await gw.db
    .from('passkey_challenges')
    .select('*')
    .eq('user_id', gw.userId)
    .eq('ceremony_type', 'registration')
    .eq('rp_id', rp.rpId)
    .is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) return new Response('No valid challenge', { status: 400 });

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge.challenge.toString('base64url'),
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpId,
    requireUserVerification: true
  });

  if (!verification.verified || !verification.registrationInfo) {
    await logAuthEvent({ userId: gw.userId, type: 'passkey_enrolled', success: false });
    return new Response('Verification failed', { status: 400 });
  }

  const info = verification.registrationInfo;

  await gw.db.from('user_passkeys').insert({
    user_id: gw.userId,
    credential_id: Buffer.from(info.credential.id, 'base64url'),
    public_key: Buffer.from(info.credential.publicKey),
    counter: info.credential.counter,
    transports: response.response.transports ?? [],
    device_type: info.credentialDeviceType,
    backup_eligible: info.credentialBackedUp,
    backup_state: info.credentialBackedUp,
    label: label ?? deriveLabel(req),
    aaguid: info.aaguid,
    rp_id: rp.rpId,
    origin: rp.origin
  });

  await gw.db.from('passkey_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id);

  await logAuthEvent({
    userId: gw.userId,
    type: 'passkey_enrolled',
    success: true,
    metadata: { label, device_type: info.credentialDeviceType }
  });

  return Response.json({ ok: true });
}
```

#### 6.4.4 Client hook

`lib/auth/passkeys/useEnrolPasskey.ts`:

```ts
import { startRegistration } from '@simplewebauthn/browser';

export function useEnrolPasskey() {
  const [state, setState] = useState<'idle'|'in_progress'|'success'|'error'>('idle');

  async function enrol(label?: string) {
    setState('in_progress');
    try {
      const optionsRes = await fetch('/api/auth/passkeys/registration-options', {
        method: 'POST'
      });
      if (!optionsRes.ok) throw new Error('options');
      const options = await optionsRes.json();

      const registration = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/passkeys/registration-verify', {
        method: 'POST',
        body: JSON.stringify({ response: registration, label })
      });
      if (!verifyRes.ok) throw new Error('verify');
      setState('success');
    } catch (e) {
      setState('error');
      throw e;
    }
  }

  return { enrol, state };
}
```

#### 6.4.5 Enrolment UX

Entry points:

1. **After first successful magic-link or password login** on a WebAuthn-capable device — one-time prompt: "Enable faster sign-in on this device?" One "Yes, set up" / "Not now" choice. "Not now" is remembered for 30 days.
2. **From `/settings/security`** — explicit enrol action, can add multiple passkeys (one per device).
3. **From onboarding flow** for new agent accounts — suggested after the two-TOTP enrolment completes.

Detection gate: before offering enrolment, the client checks `window.PublicKeyCredential !== undefined && await PublicKeyCredential.isConditionalMediationAvailable()`. If the capabilities are missing, the enrol CTA simply doesn't appear. Budget Android 7/8 devices will never see the prompt.

### 6.5 Authentication ceremony (passkey login)

Two modes, both supported:

- **Discoverable (autofill) mode.** User arrives at `/login`, sees the email field with `autocomplete="webauthn"`, and the browser surfaces available passkeys without the user typing an email. One tap → authenticated.
- **AllowList mode.** User types email and clicks "Sign in with passkey". Server returns the allowlist of credential IDs for that user; browser prompts for the specific credential.

#### 6.5.1 Server routes

- `POST /api/auth/passkeys/auth-options` — returns options (discoverable or allowList)
- `POST /api/auth/passkeys/auth-verify` — verifies response and mints Supabase session

#### 6.5.2 Auth-options endpoint

```ts
// app/api/auth/passkeys/auth-options/route.ts
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/auth/passkeys/rp-config';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email } = body;  // optional — if omitted, discoverable flow
  const rp = getRpConfig(req);
  const serviceDb = getServiceClient();

  let allowCredentials: {id: string; transports?: AuthenticatorTransport[]}[] | undefined;
  let userId: string | undefined;

  if (email) {
    // AllowList flow — look up user and their credentials
    const { data: user } = await serviceDb.auth.admin
      .listUsers({ filter: `email.eq.${email}`, page: 1, perPage: 1 });
    userId = user?.users?.[0]?.id;
    if (userId) {
      const { data: creds } = await serviceDb
        .from('user_passkeys')
        .select('credential_id, transports')
        .eq('user_id', userId)
        .eq('rp_id', rp.rpId)
        .is('revoked_at', null);
      allowCredentials = creds?.map(c => ({
        id: Buffer.from(c.credential_id).toString('base64url'),
        transports: c.transports as AuthenticatorTransport[]
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    timeout: 60_000,
    userVerification: 'preferred',
    allowCredentials
  });

  await serviceDb.from('passkey_challenges').insert({
    user_id: userId ?? null,
    challenge: Buffer.from(options.challenge, 'base64url'),
    ceremony_type: 'authentication',
    rp_id: rp.rpId,
    origin: rp.origin,
    client_ip_hash: await hashIp(req)
  });

  return Response.json(options);
}
```

#### 6.5.3 Auth-verify endpoint

```ts
// app/api/auth/passkeys/auth-verify/route.ts
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { getRpConfig } from '@/lib/auth/passkeys/rp-config';

export async function POST(req: Request) {
  const body = await req.json();
  const { response } = body;
  const rp = getRpConfig(req);
  const serviceDb = getServiceClient();

  // Locate the credential by credential ID
  const credentialId = Buffer.from(response.id, 'base64url');
  const { data: credential } = await serviceDb
    .from('user_passkeys')
    .select('*')
    .eq('credential_id', credentialId)
    .eq('rp_id', rp.rpId)
    .is('revoked_at', null)
    .maybeSingle();

  if (!credential) {
    return new Response('Unknown credential', { status: 400 });
  }

  const { data: challenge } = await serviceDb
    .from('passkey_challenges')
    .select('*')
    .eq('ceremony_type', 'authentication')
    .eq('rp_id', rp.rpId)
    .is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) return new Response('No valid challenge', { status: 400 });

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge.toString('base64url'),
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpId,
    credential: {
      id: credential.credential_id.toString('base64url'),
      publicKey: credential.public_key,
      counter: credential.counter,
      transports: credential.transports as AuthenticatorTransport[]
    },
    requireUserVerification: true
  });

  if (!verification.verified) {
    await logAuthEvent({
      userId: credential.user_id,
      type: 'passkey_failed',
      success: false,
      failure_reason: 'verification_failed'
    });
    return new Response('Verification failed', { status: 400 });
  }

  // Counter enforcement — skip for multi-device (syncable) passkeys
  if (credential.device_type === 'singleDevice' &&
      verification.authenticationInfo.newCounter <= credential.counter) {
    await logAuthEvent({
      userId: credential.user_id,
      type: 'passkey_failed',
      success: false,
      failure_reason: 'counter_regression',
      metadata: { stored: credential.counter, presented: verification.authenticationInfo.newCounter }
    });
    return new Response('Possible credential cloning detected', { status: 400 });
  }

  await serviceDb.from('user_passkeys')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
      last_used_ip_hash: await hashIp(req)
    })
    .eq('id', credential.id);

  await serviceDb.from('passkey_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', challenge.id);

  // MINT SUPABASE SESSION — §6.5.4
  const session = await mintSupabaseSessionForUser(credential.user_id);

  await logAuthEvent({
    userId: credential.user_id,
    type: 'passkey_verified',
    success: true,
    aal: 'aal2',
    auth_method: 'passkey',
    session_id: session.access_token_jti
  });

  return Response.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at
  });
}
```

#### 6.5.4 Session-minting bridge

Per D-AUTH-07, we use `supabase.auth.admin.generateLink` as the bridge:

```ts
// lib/auth/passkeys/mint-session.ts
export async function mintSupabaseSessionForUser(userId: string) {
  const serviceDb = getServiceClient();

  // 1. Fetch user email (generateLink requires it)
  const { data: user } = await serviceDb.auth.admin.getUserById(userId);
  if (!user) throw new Error('User not found');

  // 2. Generate a magic link, but don't email it — consume the token server-side
  const { data: link } = await serviceDb.auth.admin.generateLink({
    type: 'magiclink',
    email: user.user.email!
  });

  // 3. Extract the hashed OTP token from the action link
  // link.properties.hashed_token
  const hashedToken = link.properties.hashed_token;

  // 4. Call verifyOtp server-side to mint the session
  const { data: session, error } = await serviceDb.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink'
  });

  if (error || !session.session) throw new Error('Session mint failed');

  return {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_at: session.session.expires_at,
    access_token_jti: extractJti(session.session.access_token)
  };
}
```

Client-side, on receiving `{access_token, refresh_token}` from `auth-verify`:

```ts
const { error } = await supabase.auth.setSession({
  access_token: data.access_token,
  refresh_token: data.refresh_token
});
```

From this point forward the session is a normal Supabase session. The user is authenticated across all subsequent requests via the standard cookie mechanisms. RLS sees `auth.uid()` resolve to the correct user.

Caveat CC must handle: `generateLink` does not trigger an email because we never deliver the link — we consume the `hashed_token` immediately. Nevertheless, watch Supabase docs for future changes to this behaviour. If Supabase stops returning `hashed_token` from `generateLink`, switch to Auth Hooks (D-AUTH-07 reversibility). A runtime check in CI should verify the `hashed_token` field is present on a canary call.

#### 6.5.5 Client hook for login

`lib/auth/passkeys/usePasskeyLogin.ts`:

```ts
import { startAuthentication } from '@simplewebauthn/browser';

export function usePasskeyLogin() {
  async function login(email?: string) {
    const optionsRes = await fetch('/api/auth/passkeys/auth-options', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    const options = await optionsRes.json();

    const authResponse = await startAuthentication({
      optionsJSON: options,
      useBrowserAutofill: !email   // discoverable mode if no email
    });

    const verifyRes = await fetch('/api/auth/passkeys/auth-verify', {
      method: 'POST',
      body: JSON.stringify({ response: authResponse })
    });
    if (!verifyRes.ok) throw new Error('auth_failed');

    const { access_token, refresh_token } = await verifyRes.json();
    const supabase = createClient();
    await supabase.auth.setSession({ access_token, refresh_token });

    // Router push to appropriate workspace (active-role cookie machinery handles this)
    window.location.href = '/';  // root landing — ADDENDUM_61B resolves role
  }

  return { login };
}
```

#### 6.5.6 Login UX at `/login`

The central `/login` page (BUILD_61 gateway) gains a new passkey option:

```
┌─────────────────────────────────────────────────────────────┐
│  Sign in to Pleks                                            │
│  ────────────────                                            │
│                                                               │
│  Email                                                        │
│  [ alice@example.com                            ]            │
│                                                               │
│  [ Continue →                                   ]            │
│                                                               │
│  ─── or ───                                                  │
│                                                               │
│  [ 🔑  Sign in with passkey                    ]            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

The email input has `autocomplete="username webauthn"`. On capable browsers, focusing the input surfaces available discoverable passkeys in the autofill menu. Selecting one kicks off `usePasskeyLogin()` directly — the user never clicks a button.

For users who type an email and press Continue, the server checks whether that email has any registered passkeys at the current `rp_id`. If yes, the next page prompts "Sign in with passkey?" with fallback "Use password / magic link". If no, the standard password / magic-link UX applies.

### 6.6 Device management UI

New section on `/settings/security` and the per-role account-security pages:

```
┌─────────────────────────────────────────────────────────────┐
│  Passkeys                                                     │
│  ────────                                                     │
│                                                               │
│  Your passkeys let you sign in without a password.          │
│                                                               │
│  🔑  My iPhone                             Last used today   │
│      Added 12 April 2026                                     │
│      [Rename]  [Remove]                                      │
│                                                               │
│  🔑  MacBook Pro                           Last used 3 days  │
│      Added 8 April 2026                                      │
│      [Rename]  [Remove]                                      │
│                                                               │
│  🔑  YubiKey 5C                            Last used 2 weeks │
│      Added 15 March 2026                                     │
│      [Rename]  [Remove]                                      │
│                                                               │
│  [+ Add a passkey]                                           │
└─────────────────────────────────────────────────────────────┘
```

Remove action requires step-up (D-AUTH-11 `passkey_unenroll`). On confirm: set `user_passkeys.revoked_at = now()`. Soft-delete preserves audit trail. If the removed passkey was the only passkey AND it was a multi-device passkey on a shared authenticator, surface a warning: "Removing this will sign you out of all synced devices." This warning uses `device_type` to guide copy.

### 6.7 Recovery flows

**Agent with two TOTP factors + zero/any passkeys:** recovery path is via the second TOTP device. D-AUTH-01 ensures this always exists for agents.

**Agent with zero TOTP factors (pre-migration state):** on first login after BUILD_62 ships, middleware blocks `/dashboard` and forces `/settings/security/enrol-totp?mandatory=true`. This is the backstop.

**Agent who has lost both TOTP devices:** admin recovery. Flow:

1. Agent emails `security@pleks.co.za` from their registered email with a government-issued ID scan.
2. Internal admin verifies identity using `supabase.auth.admin` tools.
3. Admin removes the TOTP factors via `supabase.auth.admin.mfa.deleteFactor()`.
4. On next login, user re-enrols two TOTP factors from scratch.
5. `auth_events` captures the admin intervention with `event_type='recovery_used', auth_method='admin', metadata={admin_user_id, justification}`.

There is intentionally no self-service path for this. The friction is the security control — if two devices plus government ID verification is achievable by an attacker, the account is already compromised by other means.

**Tenant / landlord / supplier with optional TOTP or passkey, lost everything:** magic link to registered email remains the baseline. User requests a magic link, it arrives, they click it, they reach their portal. From there they can unenrol any stale factors (step-up gates prevent a hostile actor in an open session from doing this because they wouldn't have magic-link access to the email). This is acceptable because lower-blast-radius roles can accept email as the recovery root.

**Tenant whose registered email is compromised:** the attacker can issue magic links and step-up-gate removals of MFA factors. Mitigation: login-notification email goes to the same compromised email, but if the attacker controls it they can delete the notification. Additional mitigation: audit the agent's `/settings/team/sessions` view — an unusual login for a tenant might be spotted by the agent and trigger a conversation. Not bulletproof; no consumer account-recovery system is. Acceptable for Phase 1.

### 6.8 Capability detection & fallback

Every passkey entry point performs capability detection:

```ts
// lib/auth/passkeys/capability.ts
export async function canUsePasskeys(): Promise<{
  available: boolean;
  discoverable: boolean;
  platform: boolean;
}> {
  if (typeof window === 'undefined') return { available: false, discoverable: false, platform: false };
  if (!window.PublicKeyCredential) return { available: false, discoverable: false, platform: false };

  const [discoverable, platform] = await Promise.all([
    PublicKeyCredential.isConditionalMediationAvailable?.() ?? Promise.resolve(false),
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? Promise.resolve(false)
  ]);

  return { available: true, discoverable, platform };
}
```

Behaviour by capability:

| Capability | UI behaviour |
|-----------|--------------|
| `available=true`, `discoverable=true`, `platform=true` | Full passkey UX: autofill on login, enrol prompt offered, sign-in with passkey button visible |
| `available=true`, `discoverable=false`, `platform=true` | AllowList mode: email-then-passkey; no autofill |
| `available=true`, `discoverable=false`, `platform=false` | Cross-platform only (e.g. hardware keys via USB). Hide "Sign in with passkey" as a primary CTA; keep as a secondary option in settings. |
| `available=false` | All passkey UI elements hidden. Standard password/magic-link flow only. |

### 6.9 Environment configuration

Per D-AUTH-02 and D-AUTH-03. Two environments, no staging for passkeys.

```ts
// lib/auth/passkeys/rp-config.ts
export function getRpConfig(req: Request): { rpId: string; origin: string; rpName: string } {
  const url = new URL(req.url);
  const host = url.host;

  if (host === 'app.pleks.co.za') {
    return {
      rpId: 'app.pleks.co.za',
      origin: 'https://app.pleks.co.za',
      rpName: 'Pleks'
    };
  }

  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return {
      rpId: 'localhost',
      origin: `http://${host}`,
      rpName: 'Pleks (dev)'
    };
  }

  throw new Error(`Refusing to serve passkeys on unknown host: ${host}`);
}
```

Hard failure on any other host is intentional. If CC spins up a preview deploy on `*.vercel.app`, passkey routes return 500. This prevents accidental credential enrolment against an unstable origin.

Environment variables to set:

```
# .env.production
NEXT_PUBLIC_RP_ID=app.pleks.co.za
NEXT_PUBLIC_EXPECTED_ORIGIN=https://app.pleks.co.za

# .env.local
NEXT_PUBLIC_RP_ID=localhost
NEXT_PUBLIC_EXPECTED_ORIGIN=http://localhost:3000
```

(Browser-side config mirrors server-side for symmetry. Server-side is authoritative via `getRpConfig`.)

Deployment guardrails:

- `package.json` `predeploy` hook: `node scripts/verify-rp-config.mjs` — fails the deploy if `NEXT_PUBLIC_RP_ID` is set to `localhost` when `NEXT_PUBLIC_EXPECTED_ORIGIN` looks like production, or vice versa.
- Category 6 or 11 of the security audit (`scripts/security/audit.mjs`) gains a new assertion: `GET /api/auth/passkeys/registration-options` returns a response whose RP ID matches the expected production value.

### 6.10 Testing matrix

Four-OS × three-browser matrix. Not all combinations are required on every release — minimum viable coverage for sign-off is the bolded rows.

| OS | Browser | Platform authenticator | Autofill (discoverable) | Cross-platform (hardware key) |
|----|---------|------------------------|-------------------------|------------------------------|
| **macOS 14+** | **Chrome 120+** | ✅ Touch ID | ✅ | ✅ USB |
| **macOS 14+** | **Safari 17+** | ✅ Touch ID / iCloud Keychain | ✅ | ✅ USB |
| macOS 14+ | Firefox 120+ | ✅ Touch ID | ⚠ limited | ✅ USB |
| **iOS 17+** | **Safari (mobile)** | ✅ Face ID / iCloud Keychain | ✅ | ⚠ NFC |
| iOS 17+ | Chrome (mobile) | ✅ (via WebKit) | ✅ | ⚠ NFC |
| **Windows 11** | **Chrome 120+** | ✅ Windows Hello | ✅ | ✅ USB |
| Windows 11 | Edge 120+ | ✅ Windows Hello | ✅ | ✅ USB |
| Windows 11 | Firefox 120+ | ✅ Windows Hello | ⚠ limited | ✅ USB |
| **Android 14+** | **Chrome (mobile)** | ✅ Google Password Manager / fingerprint | ✅ | ⚠ USB-C / NFC |
| Android 14+ | Samsung Internet | ✅ | ✅ | ⚠ |
| Android 9–13 | Chrome | ✅ (limited — platform only) | ⚠ varies by vendor | ❌ |
| Android ≤8 | Chrome | ❌ | ❌ | ❌ |

Test scenarios per bolded combination:

1. Fresh enrolment from `/settings/security`.
2. Login via discoverable/autofill at `/login`.
3. Login via email → allowlist flow at `/login`.
4. Step-up challenge using passkey (approve a deposit refund in test org).
5. Rename a passkey, revoke a passkey (step-up gated).
6. Sign out and sign back in; confirm passkey still works (no re-enrolment needed).
7. Clear cookies; confirm passkey still works (credential lives in authenticator, not in cookies).
8. Counter enforcement: use a hardware key twice; confirm counter increments in DB; attempt a replay → rejected.
9. Multi-device passkey: enrol on iPhone → log in on macOS Safari (iCloud sync); confirm same `credential_id` is recognised, counter enforcement skipped due to `device_type='multiDevice'`.
10. Login-notification email: log in from a never-seen device; confirm email is sent and `login_notifications_sent` row created.

Known-good accepted edge case: **Firefox with autofill is partially supported.** If discoverable doesn't autofill on Firefox, the allowList flow must work. This is documented in-app help text: "On Firefox, type your email first, then click Sign in with passkey."

Known-rejected: **Android ≤8 devices cannot enrol passkeys.** This is a silent capability-miss — the enrol CTA doesn't appear. Tenants on these devices continue with magic links forever; no feature regression.

---

## 7 · Environment and deployment

### 7.1 Dev environment (`localhost`)

```bash
# one-time setup
npm install @simplewebauthn/server @simplewebauthn/browser

# set env
echo "NEXT_PUBLIC_RP_ID=localhost" >> .env.local
echo "NEXT_PUBLIC_EXPECTED_ORIGIN=http://localhost:3000" >> .env.local

# apply migrations
# Supabase migrations 013 and 014 via CLI or dashboard

# dev
npm run dev
```

Browser-side: WebAuthn requires a "secure context". `localhost` satisfies this without TLS. `127.0.0.1` also works but `localhost` is the canonical choice. Do not use `0.0.0.0` or a LAN IP — those are not secure contexts.

### 7.2 Production environment (`app.pleks.co.za`)

```bash
# Vercel environment variables
NEXT_PUBLIC_RP_ID=app.pleks.co.za
NEXT_PUBLIC_EXPECTED_ORIGIN=https://app.pleks.co.za
```

Migrations 013 and 014 applied to production Supabase.

Supabase Dashboard settings per §5.1 applied to production project.

### 7.3 Preview deploys

Preview deploys on `*.vercel.app` must not serve passkey routes. `getRpConfig` throws for unrecognised hosts — this is the enforcement. Preview deploys are fine for every other flow (layout testing, content changes, etc.); passkey routes return 500 on a preview URL, which is the correct failure mode.

If passkey-specific UI regressions need preview testing, test on `localhost` instead.

### 7.4 First-deploy release flow

Post-ADDENDUM_00D, deployment is automated through semantic-release + Vercel. Do not push directly to `main` or tag manually. The sequence on first deploy:

1. **All BUILD_62 code changes land via PRs** titled with conventional-commit format. Part A lands as `feat(auth): native MFA hardening (BUILD_62 Part A)` or split across smaller `feat:`/`fix:` PRs. Part B lands as `feat(auth): passkey layer (BUILD_62 Part B)`.
2. **Each PR merges to `main`** via squash-merge. CI jobs gate the merge (`Lint & Typecheck`, `Security (static Supabase checks)`, `Dependency CVE scan (Trivy)`, `PR title (Conventional Commits)`).
3. **Merge to `main` triggers `release.yml`.** Semantic-release reads conventional commits since the last tag, cuts `vX.Y.0` (feat → minor bump), creates a GitHub Release with auto-generated notes.
4. **Vercel auto-deploys from `main`** after the tag lands. This is the production deploy.
5. **Apply migrations 013 and 014 to production Supabase.** Do this AFTER the Vercel deploy is green (code that reads `auth_events` is live; the table now exists to serve it). Migrations apply via Supabase CLI or dashboard.
6. **Configure Supabase Auth dashboard policies** per §5.1 (leaked-password protection, password policy, session caps). These are runtime-settable and do not require a deploy.
7. **Schedule `pg_cron` jobs** per §5.2 (`purge-auth-events` monthly, `purge-expired-challenges` every 15 min).
8. **Smoke test on production** per the checklist below.
9. **Rollback if anything breaks.** Vercel's "Instant Rollback" redeploys a previous tag in seconds. Migration rollback is per-migration via their `DOWN` sections in 013/014.

**Do not:** commit directly to `main` (branch protection prevents this anyway), tag manually (`git tag v1.2.3 && git push --tags` — semantic-release owns tagging), run `npm run build` on CI expecting signal (Vercel handles it), or skip the conventional-commit format (the `PR title` CI check rejects non-conforming titles).

**Do:** write descriptive PR titles. Split large PRs into smaller `feat:`/`fix:` bumps when possible — this makes the release notes readable. For BUILD_62 specifically: split TOTP + session UI into one PR, login notifications into another, passkey enrolment into a third, passkey auth flow into a fourth. Each produces a separate semver bump and clean release notes.

### 7.5 First-deploy checklist

- [ ] Supabase Dashboard Auth policies configured per §5.1
- [ ] Migration 013 applied to production
- [ ] Migration 014 applied to production
- [ ] `pg_cron` jobs scheduled for `purge-auth-events` (monthly) and `purge-expired-challenges` (every 15 min)
- [ ] `NEXT_PUBLIC_RP_ID` and `NEXT_PUBLIC_EXPECTED_ORIGIN` set in Vercel production env vars
- [ ] `security@pleks.co.za` email alias live and monitored
- [ ] `public/.well-known/security.txt` deployed; `curl https://app.pleks.co.za/.well-known/security.txt` returns the expected content
- [ ] Resend template `login-notification.tsx` deployed
- [ ] All agent-role users onboarded-or-blocked: middleware redirects any pre-BUILD_62 agent without TOTP factors to `/settings/security/enrol-totp?mandatory=true` on next login
- [ ] `npm run security` passes with zero critical findings
- [ ] Smoke test: enrol passkey on production from founder's own device, log in, perform step-up-gated action, revoke passkey

---

## 8 · Acceptance criteria

### 8.1 Part A — Native hardening

**Supabase Auth configuration**
- [ ] Leaked password protection (HIBP) enabled in production
- [ ] Password policy: ≥10 chars, lower/upper/digit required
- [ ] New signup with breached password (`Password1!`) rejected
- [ ] Access-token expiry 1 hour; refresh token rotation on
- [ ] Agent session `pleks_auth_ttl` cookie caps at 7 days
- [ ] Tenant/landlord/supplier session caps at 30 days

**Migration 013**
- [ ] `auth_events` table created with all 24 event types in CHECK constraint (plus `'role_switched'` added for ADDENDUM_61B dual-write consumption — see ADDENDUM_61B security considerations §4)
- [ ] `auth_events` has no UPDATE or DELETE policy (append-only enforced)
- [ ] `login_notifications_sent` table created with unique `(user_id, device_fingerprint)`
- [ ] `device_fingerprints` table created, soft-delete only (no DELETE policy)
- [ ] `step_up_challenges` table created with 5-minute default expiry
- [ ] `is_mfa_fresh(int)` helper function callable and returns correct boolean
- [ ] `pg_cron` jobs scheduled for `purge_old_auth_events` (monthly) and expired-challenges cleanup (15 min)
- [ ] RLS policies verified: user can SELECT own events; org admins can SELECT org events; nobody can INSERT/UPDATE/DELETE from client

**Mandatory agent TOTP**
- [ ] New agent signup forces enrolment of two TOTP factors before `/dashboard` access
- [ ] Existing agent without TOTP on first post-deploy login redirected to `/settings/security/enrol-totp?mandatory=true`
- [ ] User with `mfa_recovery_pending=true` sees persistent amber banner; escalates to modal after 14 days
- [ ] Login challenge at `/login/mfa` accepts valid TOTP code, rejects invalid with rate limit (5 per 15 min)
- [ ] Successful TOTP verify inserts `auth_events` with `event_type='totp_verified', aal='aal2'`
- [ ] Failed TOTP verify inserts `auth_events` with `event_type='totp_failed', success=false`
- [ ] Removing TOTP requires step-up; cannot remove last factor if agent and <2 would remain

**Step-up auth**
- [ ] `requireStepUp()` helper returns `{stepUpRequired: true, challengeToken}` on first call for a sensitive action
- [ ] Step-up modal renders globally; accepts TOTP code; on success sets `step_up_challenges.verified_at`
- [ ] Re-calling the server action with `challengeToken` now passes; `consumed_at` is set
- [ ] Reusing a consumed challenge token is rejected
- [ ] Expired challenge (>5 min) is rejected
- [ ] Passkey verification satisfies step-up freshness window (post Part B deploy)
- [ ] Magic-link login alone does NOT satisfy step-up freshness

**Session management UI**
- [ ] `/settings/security/sessions` lists current user's active sessions and recent events
- [ ] Revoke-session action terminates the relevant refresh token and sets `device_fingerprints.revoked_at`
- [ ] Revoke-all-other-sessions leaves the current session intact
- [ ] `/settings/team/sessions` visible only to `user_orgs.role IN ('owner','property_manager')`
- [ ] Org admin can revoke any team member's session; action requires step-up
- [ ] `/tenant/account/security`, `/landlord/account/security`, `/supplier/account/security` each render self-scoped session view
- [ ] All session UIs responsive at 375px

**Login-notification emails**
- [ ] New device (never seen OR not seen in 30 days) triggers `login-notification` email
- [ ] Email contains device label, city, country, method, timestamp, revoke link
- [ ] Same device within 30 days does not re-notify
- [ ] Fresh-account initial TOTP-enrolment device is suppressed from notification
- [ ] Admin-initiated sessions do not trigger notification
- [ ] `login_notifications_sent` row inserted per (user, device) pair; counter increments on re-notification
- [ ] `auth_events` entry `new_device_detected` written when notification is sent

**security.txt**
- [ ] `GET https://app.pleks.co.za/.well-known/security.txt` returns expected content
- [ ] `security@pleks.co.za` alias receives test email and routes to triage inbox
- [ ] `/security` marketing page published (may be minimal — v1 is acceptable)

### 8.2 Part B — Passkey layer

**Migration 014**
- [ ] `user_passkeys` created with unique `credential_id`
- [ ] `passkey_challenges` created with 5-minute default expiry
- [ ] RLS policies verified: user can SELECT own passkeys, can UPDATE (label/revoke); no client INSERT/DELETE
- [ ] `pg_cron` job schedules for `passkey_challenges` cleanup

**Environment config**
- [ ] `getRpConfig()` returns `app.pleks.co.za` for production host
- [ ] `getRpConfig()` returns `localhost` for dev hosts
- [ ] `getRpConfig()` throws for `*.vercel.app` or any unknown host
- [ ] `scripts/verify-rp-config.mjs` is a `predeploy` hook and fails deploy on mismatched env vars

**Enrolment**
- [ ] Capability detection hides enrol CTA on WebAuthn-incapable devices
- [ ] Enrol flow from `/settings/security` completes successfully on macOS Safari, macOS Chrome, iOS Safari, Windows Chrome, Android Chrome
- [ ] Enrolment ceremony persists `user_passkeys` row with correct `rp_id`, `origin`, `device_type`, `counter`
- [ ] `exclude_credentials` prevents re-enrolling the same authenticator
- [ ] `auth_events` entry `passkey_enrolled` written on success
- [ ] Failed enrolment writes `auth_events` entry `passkey_enrolled` with `success=false`

**Authentication**
- [ ] Discoverable (autofill) login works at `/login` when user has at least one discoverable passkey
- [ ] AllowList login works when user types email
- [ ] Session is minted via `mintSupabaseSessionForUser` and `setSession` is called client-side
- [ ] RLS queries post-login return the correct user's data (`auth.uid()` resolves correctly)
- [ ] `auth_events` entry `passkey_verified` written with `aal='aal2', auth_method='passkey'`
- [ ] Counter regression on `device_type='singleDevice'` credential is rejected
- [ ] Counter unchanged for `device_type='multiDevice'` is accepted
- [ ] Discoverable mode works even when only platform authenticators exist

**Step-up via passkey**
- [ ] Step-up modal offers "Use passkey" as primary when user has passkeys enrolled
- [ ] Passkey step-up ceremony completes; sets `step_up_challenges.verified_at`
- [ ] `auth_events` entry `step_up_verified` written with `auth_method='passkey'`

**Device management**
- [ ] `/settings/security` passkey list renders all non-revoked passkeys for current rp_id only
- [ ] Rename action updates `label`; does not require step-up
- [ ] Remove action requires step-up; sets `revoked_at`; credential no longer accepted for future auth
- [ ] Removing a multi-device passkey surfaces the "signs you out of all synced devices" warning

**Recovery**
- [ ] Agent recovery flow documented in runbook at `brief/legal/RUNBOOK_AUTH_RECOVERY.md` (new file)
- [ ] Admin MFA factor removal via Supabase admin tooling inserts `auth_events` entry `recovery_used` with admin user ID in metadata
- [ ] Tenant/landlord/supplier can recover via magic link if all MFA factors lost

**Security audit**
- [ ] `npm run security` passes with zero critical findings
- [ ] Category 7 RLS audit covers `auth_events`, `device_fingerprints`, `login_notifications_sent`, `step_up_challenges`, `user_passkeys`, `passkey_challenges`
- [ ] Category 8 API route test covers `/api/auth/passkeys/registration-options`, `/registration-verify`, `/auth-options`, `/auth-verify`, `/api/auth/step-up`, `/api/auth/revoke-session`
- [ ] Category 11 secrets exposure test confirms no service-role key leak in passkey route responses

### 8.3 Cross-cutting

- [ ] `npm run check` (typecheck + lint) passes with zero errors and zero warnings
- [ ] Smoke test on production: founder enrols two TOTP factors and one passkey on own account, performs test step-up, revokes test session, verifies login-notification email arrives
- [ ] BUILD_63 (comms) authoring confirmed to adopt the dual-write reconciliation documented in BUILD_63 §9.2: portal session creation writes BOTH an `auth_events` row (consumed by BUILD_62 step-up + new-device logic) AND an `audit_log` row (consumed by BUILD_63 Tribunal export + POPIA export), linked by `session_id`. The `auth_events` CHECK constraint in migration 013 includes `'tenant_portal_login'` for BUILD_63 to insert into. If BUILD_63 ships before BUILD_62 (not the planned order), BUILD_63's `auth_events` write no-ops gracefully per BUILD_63 §9.2 pre-BUILD_62 behaviour.
- [ ] INDEX.md updated to reflect BUILD_62 status and section
- [ ] This document referenced from BUILD_DEPENDENCY_MAP.md as a dependency of BUILD_63

### 8.4 CI verification (post-ADDENDUM_00D)

On the BUILD_62 PRs, verify in CI:

- [ ] `Lint & Typecheck` passes
- [ ] `Security (static Supabase checks)` — if `CI_SUPABASE_URL` / `CI_SUPABASE_SERVICE_ROLE_KEY` secrets are configured, this runs Category 7 RLS audit against the CI Supabase project and catches any policy gap on the new `auth_events`, `device_fingerprints`, `login_notifications_sent`, `step_up_challenges`, `user_passkeys`, `passkey_challenges` tables. If secrets are absent, job prints "skipped" and passes.
- [ ] `Dependency CVE scan (Trivy)` passes (no new HIGH/CRITICAL from any new transitive deps — the passkey layer pulls `@simplewebauthn/server` and `@simplewebauthn/browser`; verify no blocker CVEs before merge)
- [ ] `PR title (Conventional Commits)` passes
- [ ] Vercel preview deploy succeeds and renders `/settings/security` without runtime errors

The `Security (static Supabase checks)` check is the most valuable gate for BUILD_62 — new tables + new RLS policies are exactly what the CI subset is designed to catch. If this PR is the first time `CI_SUPABASE_URL` is actually being used in anger, verify the dev/CI Supabase project has migrations 013 and 014 applied before the CI run.

---

## 9 · Open decisions

1. **Per-org MFA policy granularity.** WorkOS-style model: Firm-tier org admin can toggle "require MFA for all agents in this org". Platform-wide policy is simpler. Proposed default for Phase 1: platform-wide (mandatory for all agent accounts, period). Revisit when first Firm-tier customer requests stricter policy.

2. **Tenant MFA threshold triggers.** Should tenant MFA be automatically mandated on leases above a rent threshold, or where deposits above R X are held? Proposed default: never mandate on tenants; always optional. Revisit if actual incident data suggests the threshold carries meaningful risk.

3. **Bulk-export alerting.** §5.4.1 includes `bulk_export` as a step-up action. A related feature is alerting the org owner when an agent performs >100-record exports in 10 minutes. Out of scope for BUILD_62 unless founder wants it included. Lean: defer to a future addendum (mentioned in §10 follow-ons).

4. **Hash-chained audit log.** `auth_events` is immutable-by-policy. Adding a `prev_hash` column where each row contains SHA-256 of the previous row's content (plus the chain tip stored separately) makes the log immutable-by-cryptography. Adds complexity. Defer unless a Tribunal case requires it.

5. **Hardware-key-only Firm-tier policy.** Firm-tier orgs could opt their agents into "hardware key required — platform authenticators not accepted for this org." Small percentage of the market; meaningful enterprise differentiator. Defer to Phase 2.

6. **Rate-limiting on passkey routes.** The per-user rate limit on `/api/auth/passkeys/auth-verify` should be ~20 per hour to prevent brute-force credential enumeration. Implement via existing proxy rate limiter. Acceptance criterion added above.

7. **Admin impersonation surface.** A future `auth_method='admin'` flow is reserved in the CHECK constraint for support-impersonation. Out of scope for BUILD_62. When built, will require an additional dedicated spec with explicit POPIA §11 processing-purpose logging.

---

## 10 · Follow-on work (not this build)

- **BUILD_64 — Account preferences + richer profile.** Email notification preferences, language, timezone, avatar upload, display name, organisation profile surface. Depends on BUILD_62 (security settings live alongside preferences).
- **ADDENDUM_62A — Hash-chained auth_events.** Optional cryptographic immutability.
- **ADDENDUM_62B — Bulk-export anomaly alerting.** Agent performs >100-record export in 10 min → org-owner email alert.
- **ADDENDUM_62C — Risk signals.** New-country, new-ASN, off-hours login forcing step-up challenge even on known devices. Deterministic rules over `auth_events`.
- **ADDENDUM_62D — Access-audit events.** Log data *views* (not just mutations) for tenant profile, lease, financial records, comm exports. Larger schema shift; separate spec.
- **ADDENDUM_62E — Passkey on older Android (progressive enhancement).** Revisit when Google Play Services coverage improves for pre-Android 9 devices, if the cohort is material.
- **Marketing — `/security` page and comparison one-pager.** Factual comparison: mandatory agent MFA, passkey-primary, step-up on trust actions, session-management, HIBP, login notifications. Explicitly name TPN / WeConnect / PropWorx category-wide gaps. Content task, minimal engineering.
- **BUILD_63 schema delta reduction.** When BUILD_63 is implemented, its `tenant_portal_login` substrate consumes `auth_events` instead of creating new tables. Reduces BUILD_63 migration size.
- **Phase 2 — Auth Hooks migration.** Move session-minting bridge off `generateLink` onto Supabase Auth Hooks if that API matures. Reversible (D-AUTH-07).

---

## 11 · Glossary

- **AAL** — Authenticator Assurance Level (NIST). `aal1` = single factor; `aal2` = two-factor. Supabase Auth exposes this as a JWT claim and a client-side API.
- **amr** — Authentication Methods Reference. JWT claim listing the auth methods used in the session, with timestamps. Useful for "how long ago did they MFA?" checks.
- **Credential ID** — Opaque binary identifier for a WebAuthn credential. Returned by the authenticator; stored in `user_passkeys.credential_id`.
- **Discoverable credential / resident key** — A passkey the authenticator can list without being told which user to look up. Enables browser autofill on the login page.
- **RP ID** — Relying Party ID. The domain a WebAuthn credential is scoped to. `app.pleks.co.za` or `localhost` in Pleks. Immutable per credential.
- **Step-up** — The requirement that certain sensitive actions require a fresh (≤5 min) second-factor verification, regardless of current session AAL.
- **TOTP** — Time-based One-Time Password (RFC 6238). Six-digit rotating code from an authenticator app.
- **WebAuthn** — W3C spec for passwordless public-key authentication. Implemented in all major browsers. Platform authenticators (Touch ID, Windows Hello, Android biometrics) and cross-platform authenticators (YubiKeys, hardware keys) both conform.

---

*End of BUILD_62_AUTHENTICATION_SECURITY.md*
