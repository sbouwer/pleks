-- ═══════════════════════════════════════════════════════════════════════════════
-- 010_platform_features.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Platform / portal / admin / billing infrastructure.
--
-- This file absorbs features that are NOT about property operations or
-- document generation:
--   • Tenant portal & maintenance portal access
--   • Bank feed integration (Yodlee)
--   • Receipt path
--   • Operating hours & emergency contacts
--   • Team member personal fields & roles
--   • Org custom role library
--   • Admin permission flag (BUILD_56)
--   • Ownership transfers (BUILD_56)
--   • Lease notes & commercial CPA fix (cross-cutting lease enhancement)
--
-- AMEND-FORWARD RULE: new platform-level features (billing, auth, portal,
-- messaging preferences, team management) should add a new §N section at
-- the bottom of this file, not a new migration file.
--
-- Fully idempotent — safe to re-run on any DB state.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §1  TENANT PORTAL  (was 010_tenant_portal.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1a. Link tenant records to Supabase auth users
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_tenants_auth_user_id
  ON tenants(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 1b. Maintenance request portal columns
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS reported_via text
    NOT NULL DEFAULT 'dashboard'
    CHECK (reported_via IN ('dashboard', 'portal', 'email', 'phone')),
  ADD COLUMN IF NOT EXISTS tenant_reported_urgency text
    CHECK (tenant_reported_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic')),
  ADD COLUMN IF NOT EXISTS ai_suggested_urgency text
    CHECK (ai_suggested_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic'));

-- 1c. Tenant portal tokens
CREATE TABLE IF NOT EXISTS tenant_portal_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  lease_id    uuid NOT NULL REFERENCES leases(id),
  token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked     boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_token
  ON tenant_portal_tokens(token)
  WHERE NOT revoked;

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_tenant
  ON tenant_portal_tokens(tenant_id);

ALTER TABLE tenant_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_tenant_portal_tokens" ON tenant_portal_tokens;
CREATE POLICY "org_tenant_portal_tokens" ON tenant_portal_tokens
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

-- 1d. Inspection reschedule requests
CREATE TABLE IF NOT EXISTS inspection_reschedule_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  inspection_id   uuid NOT NULL REFERENCES inspections(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  reason          text NOT NULL,
  proposed_dates  date[] NOT NULL,
  note            text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'declined', 'countered')),
  agent_response  text,
  resolved_date   date,
  resolved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_inspection
  ON inspection_reschedule_requests(inspection_id);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_tenant
  ON inspection_reschedule_requests(tenant_id);

ALTER TABLE inspection_reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_reschedule_requests" ON inspection_reschedule_requests;
CREATE POLICY "org_reschedule_requests" ON inspection_reschedule_requests
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

-- 1e. Maintenance delay events
CREATE TABLE IF NOT EXISTS maintenance_delay_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  maintenance_id    uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  delay_type        text NOT NULL CHECK (delay_type IN (
    'tenant_not_available', 'tenant_rescheduled', 'tenant_no_response',
    'tenant_denied_access', 'contractor_no_show', 'contractor_rescheduled',
    'contractor_no_response', 'contractor_returned_incomplete',
    'agent_pending_approval', 'agent_pending_quote_review',
    'agent_pending_landlord_approval', 'parts_on_order', 'weather', 'access_issue_other'
  )),
  attributed_to     text NOT NULL CHECK (attributed_to IN ('tenant', 'contractor', 'agent', 'external')),
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  original_date     date,
  rescheduled_to    date,
  note              text,
  recorded_by       uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_delay_events_request ON maintenance_delay_events(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_maint_delay_events_org     ON maintenance_delay_events(org_id);

ALTER TABLE maintenance_delay_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_delay_events" ON maintenance_delay_events;
CREATE POLICY "org_delay_events" ON maintenance_delay_events
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §2  BANK FEEDS  (was 011_bank_feeds.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE bank_statement_imports
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'upload'
  CHECK (import_source IN ('upload', 'yodlee', 'ofx', 'csv', 'qif'));

ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_stmt_lines_external_id
  ON bank_statement_lines(org_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS yodlee_user_id         text,
  ADD COLUMN IF NOT EXISTS yodlee_user_created_at timestamptz;

CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  bank_account_id             uuid REFERENCES bank_accounts(id),
  yodlee_provider_account_id  text NOT NULL,
  yodlee_account_id           text,
  yodlee_provider_id          text,
  bank_name                   text NOT NULL,
  account_mask                text,
  account_type                text,
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_synced_at              timestamptz,
  last_sync_status            text CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_error             text,
  last_sync_txn_count         integer DEFAULT 0,
  last_sync_matched_count     integer DEFAULT 0,
  next_sync_after             timestamptz,
  billing_active              boolean NOT NULL DEFAULT true,
  billing_started_at          timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  disconnected_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bank_feed_conn_org
  ON bank_feed_connections(org_id)
  WHERE status = 'active';

ALTER TABLE bank_feed_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_feed_conn_select ON bank_feed_connections;
CREATE POLICY bank_feed_conn_select ON bank_feed_connections
  FOR SELECT USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_insert ON bank_feed_connections;
CREATE POLICY bank_feed_conn_insert ON bank_feed_connections
  FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_update ON bank_feed_connections;
CREATE POLICY bank_feed_conn_update ON bank_feed_connections
  FOR UPDATE USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL LIMIT 1));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §3  RECEIPT PATH ON PAYMENTS  (was 012_receipt_path.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_path text;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §4  OPERATING HOURS & EMERGENCY CONTACT  (was 023_operating_hours.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS office_hours_monday           text,
  ADD COLUMN IF NOT EXISTS office_hours_tuesday          text,
  ADD COLUMN IF NOT EXISTS office_hours_wednesday        text,
  ADD COLUMN IF NOT EXISTS office_hours_thursday         text,
  ADD COLUMN IF NOT EXISTS office_hours_friday           text,
  ADD COLUMN IF NOT EXISTS office_hours_saturday         text,
  ADD COLUMN IF NOT EXISTS office_hours_sunday           text,
  ADD COLUMN IF NOT EXISTS office_hours_public_holidays  text,
  ADD COLUMN IF NOT EXISTS emergency_phone               text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name        text,
  ADD COLUMN IF NOT EXISTS emergency_instructions        text,
  ADD COLUMN IF NOT EXISTS emergency_email               text;

-- Remove legacy consolidated weekday column that was superseded by per-day columns.
-- Verified: the HoursForm (app/(dashboard)/settings/hours/HoursForm.tsx) reads
-- per-day columns only; office_hours_weekday has no consumers.
ALTER TABLE organisations DROP COLUMN IF EXISTS office_hours_weekday;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §5  AGENT PROFILE & MULTI-ROLE  (was 024_agent_profile.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Personal emergency contact per agent (Portfolio/Firm tier)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS emergency_phone         text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text;

-- Multi-role support: primary role kept in user_orgs.role for RLS compat
ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS additional_roles text[] NOT NULL DEFAULT '{}';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §6  TEAM MEMBER PERSONAL FIELDS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extend user_profiles for editable personal details.
-- full_name kept for backwards compat; first/last used in team modal.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS title      text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS mobile     text;

COMMENT ON COLUMN user_profiles.title      IS 'Salutation: Mr, Mrs, Ms, Dr, etc.';
COMMENT ON COLUMN user_profiles.first_name IS 'Given name — used to compose full_name';
COMMENT ON COLUMN user_profiles.last_name  IS 'Surname';
COMMENT ON COLUMN user_profiles.mobile     IS 'Personal mobile number';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §7  ORG CUSTOM ROLE LIBRARY
-- ═══════════════════════════════════════════════════════════════════════════════

-- Free-form role/job-title labels defined per org.
-- user_orgs.role stores either a system slug (owner, property_manager, …) or a
-- custom label from this list.  No permission logic is derived from the value —
-- it is purely a display/organisational label.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS custom_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN organisations.custom_roles IS
  'Org-defined reusable role labels shown in the team member role picker';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §8  ADMIN / USER PERMISSION FLAG  (BUILD_56)
-- ═══════════════════════════════════════════════════════════════════════════════

-- is_admin controls destructive actions (delete/archive, manage team).
-- role stays as a free-text display label — no permission logic derived from it.
-- Owner (role = 'owner') is always implicitly admin; is_admin only matters
-- for non-owner members.

ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_orgs.is_admin IS
  'Grants admin privileges (delete, archive, manage team) to non-owner members. '
  'Owner is always admin regardless of this flag.';

-- Drop the old CHECK constraint that limited role to 5 system slugs.
-- role is now a free-text display label (BUILD_55 custom roles).
ALTER TABLE user_orgs DROP CONSTRAINT IF EXISTS user_orgs_role_check;

-- Re-add a loose constraint: role must be a non-empty string.
ALTER TABLE user_orgs DROP CONSTRAINT IF EXISTS user_orgs_role_nonempty;
ALTER TABLE user_orgs ADD CONSTRAINT user_orgs_role_nonempty
  CHECK (role IS NOT NULL AND length(trim(role)) > 0);

-- Belt-and-suspenders: mark existing owners as is_admin = true.
-- Functionally redundant (owner always isAdmin), but makes audit queries easier.
UPDATE user_orgs SET is_admin = true WHERE role = 'owner' AND is_admin = false;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §9  OWNERSHIP TRANSFERS  (BUILD_56 Phase 1)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tracks pending ownership transfer requests.
-- Owner initiates → new owner receives email → clicks confirm → roles swap.
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id   uuid NOT NULL,
  token        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_token
  ON ownership_transfers(token)
  WHERE accepted_at IS NULL;

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_ownership_transfers" ON ownership_transfers;
CREATE POLICY "org_ownership_transfers" ON ownership_transfers
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §10  LEASE NOTES & COMMERCIAL CPA FIX  (was 014_lease_notes.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lease_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  note_type   text NOT NULL CHECK (note_type IN ('tenant', 'owner', 'general')),
  body        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_notes_lease ON lease_notes(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_notes_org   ON lease_notes(org_id);

ALTER TABLE lease_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org lease notes access" ON lease_notes;
CREATE POLICY "org lease notes access" ON lease_notes
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Commercial leases should never have cpa_applies = true.
UPDATE leases
  SET cpa_applies = false
  WHERE lease_type = 'commercial'
    AND cpa_applies = true;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §11  CRON JOB HEALTH TRACKING  (BUILD_60)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Health tracking table for all scheduled edge functions. Every job writes a
-- row on start and updates on finish. Admin dashboard health widget reads from
-- this table; turns amber if last successful run > 24h, red if > 48h.

CREATE TABLE IF NOT EXISTS cron_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name       text NOT NULL,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('running','completed','failed')),
  rows_processed integer,
  error_message  text,
  metadata       jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_started ON cron_runs(job_name, started_at DESC);



-- ═══════════════════════════════════════════════════════════════════════════════
-- §12  MARKETING SITE CONTENT  (BUILD_HOMEPAGE)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Simple key/value store for editable marketing copy. Admins edit via
-- /admin/site-content. Homepage reads via anon key (public SELECT policy).
-- No org_id — this is global site content, not tenant data.

CREATE TABLE IF NOT EXISTS site_content (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '',
  label      text NOT NULL DEFAULT '',
  section    text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_content_public_read" ON site_content;
CREATE POLICY "site_content_public_read" ON site_content
  FOR SELECT USING (true);

-- Seed default content
INSERT INTO site_content (key, label, section, sort_order, value) VALUES
  ('notice_text',         'Notice strip text',          'global',  1,  'Founding-agent cohort now open — 10 spots at R299/mo, locked for life.'),
  ('notice_link_label',   'Notice strip link label',    'global',  2,  'Reserve your spot →'),
  ('notice_link_href',    'Notice strip link URL',      'global',  3,  '/early-access'),
  ('hero_headline',       'Hero headline',              'hero',    1,  'SA Property Management, Built Right'),
  ('hero_sub',            'Hero subheadline',           'hero',    2,  'Built across all three sides of the property cycle: legal, development, management. Applicant-paid FitScore screening. Bank reconciliation that catches every payment. Tribunal-ready documentation by default.'),
  ('hero_cta_primary',    'Hero primary CTA label',     'hero',    3,  'Start free — 1 unit'),
  ('hero_cta_secondary',  'Hero secondary CTA label',   'hero',    4,  'Book a demo'),
  ('hero_meta_1_n',       'Hero stat 1 number',         'hero',    5,  'R 0'),
  ('hero_meta_1_l',       'Hero stat 1 label',          'hero',    6,  'Client money Pleks ever holds'),
  ('hero_meta_2_n',       'Hero stat 2 number',         'hero',    7,  '14 / 21'),
  ('hero_meta_2_l',       'Hero stat 2 label',          'hero',    8,  'Day deposit clock, tracked automatically'),
  ('hero_meta_3_n',       'Hero stat 3 number',         'hero',    9,  'Full cycle'),
  ('hero_meta_3_l',       'Hero stat 3 label',          'hero',    10, 'Legal, development, management. Hands on each.'),
  ('why_headline',        'Why Pleks headline',         'why',     1,  'We build around them.'),
  ('why_sub',             'Why Pleks subtext',          'why',     2,  'Three parts of your business where most platforms make you fit their workflow. Pleks fits yours.'),
  ('pillar_1_title',      'Pillar 1 title',             'why',     3,  'The applicant'),
  ('pillar_1_body',       'Pillar 1 body',              'why',     4,  'Applicants apply free. They pay for the credit check — R399 — only when you shortlist them. You see a FitScore, not a raw report.'),
  ('pillar_2_title',      'Pillar 2 title',             'why',     5,  'The tenant'),
  ('pillar_2_body',       'Pillar 2 body',              'why',     6,  'Bank reconciliation watches your trust account. Every payment logged against the unit, no matter how it arrives. When a payment misses, the arrears workflow starts on its own — letters drafted, not typed.'),
  ('pillar_3_title',      'Pillar 3 title',             'why',     7,  'The building'),
  ('pillar_3_body',       'Pillar 3 body',              'why',     8,  'Heritage buildings, sectional title, and freehold on the same erf. Inspections logged with GPS-stamped photos. Tribunal bundles in one click.'),
  ('story_headline',      'Story headline',             'story',   1,  'I did your job. Then I built the software I wished existed.'),
  ('story_body_1',        'Story paragraph 1',          'story',   2,  'I ran rental portfolios in Johannesburg and Cape Town from 2014 to 2025. I used the incumbent platforms, a Sage export, and a spreadsheet I emailed to my landlords on the 3rd of every month. I watched colleagues lose deposit disputes they should have won because the paper trail was in four systems.'),
  ('story_body_2',        'Story paragraph 2',          'story',   3,  'Pleks is the product that would have saved me those Tribunal appearances. Every design decision in here is a specific frustration I remember the month and the flat it happened in. If you''ve done this work, you''ll recognise it.'),
  ('pricing_headline',    'Pricing headline',           'pricing', 1,  'Transparent pricing. No credit-check fees.'),
  ('pricing_sub',         'Pricing subtext',            'pricing', 2,  'Priced per active lease, not per address or per seat. Vacancies cost you nothing. Your bill on the 1st is the bill on the 1st — and if it ever changes, your accountant knows 30 days before it does.')
ON CONFLICT (key) DO NOTHING;

-- Live content corrections (idempotent UPDATE — safe to re-run)
UPDATE site_content SET value = 'Priced per active lease, not per address or per seat. Vacancies cost you nothing. Your bill on the 1st is the bill on the 1st — and if it ever changes, you know 30 days before it does.' WHERE key = 'pricing_sub';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §13  TIER MODEL: add growth + bespoke tiers, bespoke pricing columns
--      (2026-04 pricing overhaul: Owner free · Steward · Growth · Portfolio ·
--       Firm · Bespoke — lease-count gated, no seat caps)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Widen tier CHECK to include growth and bespoke
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_tier_check
    CHECK (tier IN ('owner', 'steward', 'growth', 'portfolio', 'firm', 'bespoke'));

-- Widen trial_tier CHECK to match
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_trial_tier_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_trial_tier_check
    CHECK (trial_tier IS NULL OR trial_tier IN ('steward', 'growth', 'portfolio', 'firm', 'bespoke'));

-- Bespoke custom pricing overrides (NULL on all other tiers)
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS bespoke_min_monthly_cents integer,
  ADD COLUMN IF NOT EXISTS bespoke_per_lease_cents   integer;

COMMENT ON COLUMN subscriptions.bespoke_min_monthly_cents IS
  'Minimum monthly guaranteed spend for bespoke tier. NULL on all other tiers.';
COMMENT ON COLUMN subscriptions.bespoke_per_lease_cents IS
  'Per-lease cost for bespoke tier. Charged above the guaranteed minimum floor. NULL on all other tiers.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §14  BUILD_62 PART A — AUTHENTICATION SECURITY
--      auth_events (append-only audit), device_fingerprints, step_up_challenges,
--      login_notifications_sent, is_mfa_fresh(), purge_old_auth_events()
-- ═══════════════════════════════════════════════════════════════════════════════

-- mfa_recovery_pending: agent has only 1 TOTP factor (missing second backup device)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS mfa_recovery_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.mfa_recovery_pending IS
  'True when an agent account has fewer than 2 TOTP factors enrolled. Triggers amber banner / escalating modal.';

-- ── 5.2.3 device_fingerprints — created FIRST because auth_events FKs into it ──
CREATE TABLE IF NOT EXISTS device_fingerprints (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint_hash  text NOT NULL,
  user_agent        text NOT NULL,
  label             text NOT NULL,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_ip_country   text,
  last_ip_city      text,
  revoked_at        timestamptz,
  UNIQUE(user_id, fingerprint_hash)
);

ALTER TABLE device_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_fingerprints_self_select" ON device_fingerprints;
CREATE POLICY "device_fingerprints_self_select" ON device_fingerprints
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "device_fingerprints_self_update" ON device_fingerprints;
CREATE POLICY "device_fingerprints_self_update" ON device_fingerprints
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "device_fingerprints_insert_service" ON device_fingerprints;
CREATE POLICY "device_fingerprints_insert_service" ON device_fingerprints
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "device_fingerprints_no_delete" ON device_fingerprints;
CREATE POLICY "device_fingerprints_no_delete" ON device_fingerprints
  FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user ON device_fingerprints(user_id);

-- ── 5.2.1 auth_events — dedicated authentication audit table ──
CREATE TABLE IF NOT EXISTS auth_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES organisations(id),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
                      'role_switched',
                      'tenant_portal_login',
                      'landlord_portal_login',
                      'supplier_portal_login',
                      'agent_portal_login'
                    )),
  auth_method       text CHECK (auth_method IN (
                      'password', 'magic_link', 'totp', 'passkey', 'recovery_code', 'oauth', 'admin'
                    )),
  active_role       text,
  aal               text CHECK (aal IN ('aal1', 'aal2')),
  ip_hash           text,
  ip_country        text,
  ip_city           text,
  ip_asn            integer,
  user_agent_hash   text,
  device_label      text,
  device_fingerprint uuid REFERENCES device_fingerprints(id),
  session_id        text,
  success           boolean NOT NULL,
  failure_reason    text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Append-only: block UPDATE and DELETE at RLS level
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_events_select_self" ON auth_events;
CREATE POLICY "auth_events_select_self" ON auth_events
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "auth_events_select_org_admin" ON auth_events;
CREATE POLICY "auth_events_select_org_admin" ON auth_events
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'property_manager')
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "auth_events_insert_service" ON auth_events;
CREATE POLICY "auth_events_insert_service" ON auth_events
  FOR INSERT WITH CHECK (false);
-- NO UPDATE policy — updates rejected (append-only)
-- NO DELETE policy — deletes rejected (7-year POPIA retention)

CREATE INDEX IF NOT EXISTS idx_auth_events_user_created ON auth_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_org_created  ON auth_events(org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_events_type_created ON auth_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_device       ON auth_events(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- ── 5.2.2 login_notifications_sent — dedup for new-device email alerts ──
CREATE TABLE IF NOT EXISTS login_notifications_sent (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint  uuid NOT NULL REFERENCES device_fingerprints(id),
  last_notified_at    timestamptz NOT NULL DEFAULT now(),
  notification_count  integer NOT NULL DEFAULT 1,
  UNIQUE(user_id, device_fingerprint)
);

ALTER TABLE login_notifications_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_notifications_self" ON login_notifications_sent;
CREATE POLICY "login_notifications_self" ON login_notifications_sent
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "login_notifications_insert_service" ON login_notifications_sent;
CREATE POLICY "login_notifications_insert_service" ON login_notifications_sent
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "login_notifications_update_service" ON login_notifications_sent;
CREATE POLICY "login_notifications_update_service" ON login_notifications_sent
  FOR UPDATE USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_login_notifications_user ON login_notifications_sent(user_id);

-- ── 5.2.4 step_up_challenges — ephemeral step-up tokens ──
CREATE TABLE IF NOT EXISTS step_up_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          text NOT NULL CHECK (action IN (
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
  resource_id     uuid,
  required_aal    text NOT NULL DEFAULT 'aal2' CHECK (required_aal IN ('aal2')),
  challenge_token text NOT NULL UNIQUE,
  verified_at     timestamptz,
  consumed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

ALTER TABLE step_up_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "step_up_challenges_self" ON step_up_challenges;
CREATE POLICY "step_up_challenges_self" ON step_up_challenges
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "step_up_challenges_insert_service" ON step_up_challenges;
CREATE POLICY "step_up_challenges_insert_service" ON step_up_challenges
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "step_up_challenges_update_service" ON step_up_challenges;
CREATE POLICY "step_up_challenges_update_service" ON step_up_challenges
  FOR UPDATE USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_step_up_challenges_user_expires ON step_up_challenges(user_id, expires_at);

-- ── 5.2.5 is_mfa_fresh(window_minutes) — server-side freshness check ──
CREATE OR REPLACE FUNCTION is_mfa_fresh(window_minutes int DEFAULT 5)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth_events
    WHERE user_id = auth.uid()
      AND event_type IN ('totp_verified', 'passkey_verified', 'step_up_verified')
      AND success = true
      AND created_at > (now() - make_interval(mins => window_minutes))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── 5.2.6 purge_old_auth_events() — monthly cron ──
CREATE OR REPLACE FUNCTION purge_old_auth_events()
RETURNS void AS $$
  DELETE FROM auth_events
  WHERE created_at < (now() - interval '7 years');
$$ LANGUAGE sql SECURITY DEFINER;

-- Schedule via pg_cron monthly (run once after migration):
-- SELECT cron.schedule('purge-auth-events', '0 3 1 * *', 'SELECT purge_old_auth_events();');
-- SELECT cron.schedule('purge-expired-step-ups', '*/15 * * * *',
--   $$DELETE FROM step_up_challenges WHERE expires_at < now() - interval '1 hour'$$);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §15  BUILD_62 PART B — PASSKEY (WebAuthn) LAYER
--      user_passkeys, passkey_challenges
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_passkeys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id       bytea NOT NULL UNIQUE,
  public_key          bytea NOT NULL,
  counter             bigint NOT NULL DEFAULT 0,
  transports          text[] NOT NULL DEFAULT '{}',
  device_type         text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backup_eligible     boolean NOT NULL DEFAULT false,
  backup_state        boolean NOT NULL DEFAULT false,
  label               text NOT NULL,
  aaguid              uuid,
  rp_id               text NOT NULL,
  origin              text NOT NULL,
  last_used_at        timestamptz,
  last_used_ip_hash   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz
);

ALTER TABLE user_passkeys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_passkeys_self_select" ON user_passkeys;
CREATE POLICY "user_passkeys_self_select" ON user_passkeys
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_passkeys_self_update" ON user_passkeys;
CREATE POLICY "user_passkeys_self_update" ON user_passkeys
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_passkeys_insert_service" ON user_passkeys;
CREATE POLICY "user_passkeys_insert_service" ON user_passkeys
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "user_passkeys_no_delete" ON user_passkeys;
CREATE POLICY "user_passkeys_no_delete" ON user_passkeys
  FOR DELETE USING (false);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user ON user_passkeys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential ON user_passkeys(credential_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_rp ON user_passkeys(rp_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge       bytea NOT NULL,
  ceremony_type   text NOT NULL CHECK (ceremony_type IN ('registration', 'authentication', 'step_up')),
  action          text,
  rp_id           text NOT NULL,
  origin          text NOT NULL,
  client_ip_hash  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at     timestamptz
);

ALTER TABLE passkey_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "passkey_challenges_no_client_access" ON passkey_challenges;
CREATE POLICY "passkey_challenges_no_client_access" ON passkey_challenges
  FOR SELECT USING (false);
-- All access via service-role gateway

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires ON passkey_challenges(expires_at);

-- Schedule cleanup (run once after migration):
-- SELECT cron.schedule('purge-passkey-challenges', '*/15 * * * *',
--   $$DELETE FROM passkey_challenges WHERE expires_at < now() - interval '1 hour'$$);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §16  BUILD_00F: user feedback capture
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  submitter_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('landlord', 'tenant', 'supplier', 'agent')),
  category      text NOT NULL CHECK (category IN ('bug', 'feature', 'general', 'billing', 'ux', 'praise')),
  subject       text NOT NULL,
  body          text NOT NULL,
  rating        smallint CHECK (rating BETWEEN 1 AND 5),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_replies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL,
  is_admin_reply  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_submissions_org       ON feedback_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_submitter ON feedback_submissions(submitter_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_status    ON feedback_submissions(status);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_created   ON feedback_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_submission    ON feedback_replies(submission_id);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_author        ON feedback_replies(author_id);

ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_replies     ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_feedback_submissions_updated_at ON feedback_submissions;
CREATE TRIGGER trg_feedback_submissions_updated_at
  BEFORE UPDATE ON feedback_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- feedback_submissions: submitter can see and edit their own
DROP POLICY IF EXISTS "feedback_submissions_submitter_select" ON feedback_submissions;
CREATE POLICY "feedback_submissions_submitter_select" ON feedback_submissions
  FOR SELECT USING (submitter_id = (SELECT auth.uid()));

-- Insert covers all four user types: agents (user_orgs), tenants, landlords, contractors.
-- The API route uses service-role for inserts and validates org membership server-side,
-- but this policy ensures correctness if the route ever uses an anon client.
DROP POLICY IF EXISTS "feedback_submissions_submitter_insert" ON feedback_submissions;
CREATE POLICY "feedback_submissions_submitter_insert" ON feedback_submissions
  FOR INSERT WITH CHECK (
    submitter_id = (SELECT auth.uid())
    AND (
      org_id IN (SELECT org_id FROM user_orgs  WHERE user_id      = (SELECT auth.uid()) AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM tenants  WHERE auth_user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM landlords WHERE auth_user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM contractors WHERE auth_user_id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "feedback_submissions_submitter_update" ON feedback_submissions;
CREATE POLICY "feedback_submissions_submitter_update" ON feedback_submissions
  FOR UPDATE USING (submitter_id = (SELECT auth.uid()))
  WITH CHECK (submitter_id = (SELECT auth.uid()));

-- feedback_submissions: org admin — role='owner' OR is_admin flag (not role='admin', which doesn't exist)
DROP POLICY IF EXISTS "feedback_submissions_org_admin_select" ON feedback_submissions;
CREATE POLICY "feedback_submissions_org_admin_select" ON feedback_submissions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND (role = 'owner' OR is_admin = true)
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "feedback_submissions_org_admin_update" ON feedback_submissions;
CREATE POLICY "feedback_submissions_org_admin_update" ON feedback_submissions
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND (role = 'owner' OR is_admin = true)
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND (role = 'owner' OR is_admin = true)
        AND deleted_at IS NULL
    )
  );

-- feedback_submissions: platform admin sees all
DROP POLICY IF EXISTS "feedback_submissions_platform_admin_all" ON feedback_submissions;
CREATE POLICY "feedback_submissions_platform_admin_all" ON feedback_submissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = (SELECT auth.uid())
        AND o.settings->>'platform_admin' = 'true'
    )
  );

-- feedback_replies: submitter can read replies on their submissions and post non-admin replies
DROP POLICY IF EXISTS "feedback_replies_submitter_select" ON feedback_replies;
CREATE POLICY "feedback_replies_submitter_select" ON feedback_replies
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM feedback_submissions WHERE submitter_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "feedback_replies_submitter_insert" ON feedback_replies;
CREATE POLICY "feedback_replies_submitter_insert" ON feedback_replies
  FOR INSERT WITH CHECK (
    author_id = (SELECT auth.uid())
    AND is_admin_reply = false
    AND submission_id IN (
      SELECT id FROM feedback_submissions WHERE submitter_id = (SELECT auth.uid())
    )
  );

-- feedback_replies: platform admin can read and post admin replies on any submission
DROP POLICY IF EXISTS "feedback_replies_platform_admin_select" ON feedback_replies;
CREATE POLICY "feedback_replies_platform_admin_select" ON feedback_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = (SELECT auth.uid())
        AND o.settings->>'platform_admin' = 'true'
    )
  );

DROP POLICY IF EXISTS "feedback_replies_platform_admin_insert" ON feedback_replies;
CREATE POLICY "feedback_replies_platform_admin_insert" ON feedback_replies
  FOR INSERT WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = (SELECT auth.uid())
        AND o.settings->>'platform_admin' = 'true'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §17  BUILD_00H: AI usage tracking + platform cost aggregates
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── ai_usage — append-only log of every Anthropic API call, with org attribution ──

CREATE TABLE IF NOT EXISTS ai_usage (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid REFERENCES organisations(id),
  user_id              uuid REFERENCES auth.users(id),

  -- What was called
  purpose              text NOT NULL,
  model                text NOT NULL,

  -- Token counts + cost
  input_tokens         int NOT NULL DEFAULT 0,
  output_tokens        int NOT NULL DEFAULT 0,
  cache_read_tokens    int NOT NULL DEFAULT 0,
  cache_write_tokens   int NOT NULL DEFAULT 0,
  cost_cents           int NOT NULL DEFAULT 0,

  -- Quality signals
  latency_ms           int,
  success              boolean NOT NULL DEFAULT true,
  error_code           text,

  -- Context — NO PII, NO prompt/response text
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_created
  ON ai_usage(org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_purpose_created
  ON ai_usage(purpose, created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Org admin reads own org's AI usage
-- (Platform admin reads via service-role after requireAdminAuth() — no client-side RLS policy needed)
DROP POLICY IF EXISTS "ai_usage_org_admin_select" ON ai_usage;
CREATE POLICY "ai_usage_org_admin_select" ON ai_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_orgs uo
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.org_id = ai_usage.org_id
        AND uo.is_admin = true
        AND uo.deleted_at IS NULL
    )
  );

-- No client INSERT/UPDATE/DELETE — service role only via lib/ai/client.ts
DROP POLICY IF EXISTS "ai_usage_insert_deny" ON ai_usage;
CREATE POLICY "ai_usage_insert_deny" ON ai_usage
  FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "ai_usage_update_deny" ON ai_usage;
CREATE POLICY "ai_usage_update_deny" ON ai_usage
  FOR UPDATE USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "ai_usage_delete_deny" ON ai_usage;
CREATE POLICY "ai_usage_delete_deny" ON ai_usage
  FOR DELETE USING (false);

-- Purge rows older than 2 years (run via pg_cron on 2nd of each month)
CREATE OR REPLACE FUNCTION purge_old_ai_usage()
RETURNS void AS $$
  DELETE FROM ai_usage
  WHERE created_at < (now() - interval '2 years');
$$ LANGUAGE sql SECURITY DEFINER;

-- ── platform_cost_snapshots — one row per org per month, built by daily cron ──

CREATE TABLE IF NOT EXISTS platform_cost_snapshots (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                         uuid NOT NULL REFERENCES organisations(id),
  period                         date NOT NULL,

  -- Directly attributable
  email_count                    int NOT NULL DEFAULT 0,
  email_cost_cents               int NOT NULL DEFAULT 0,
  wa_count                       int NOT NULL DEFAULT 0,
  wa_cost_cents                  int NOT NULL DEFAULT 0,
  sms_count                      int NOT NULL DEFAULT 0,
  sms_cost_cents                 int NOT NULL DEFAULT 0,
  ai_call_count                  int NOT NULL DEFAULT 0,
  ai_input_tokens                bigint NOT NULL DEFAULT 0,
  ai_output_tokens               bigint NOT NULL DEFAULT 0,
  ai_cost_cents                  int NOT NULL DEFAULT 0,

  -- Shared infrastructure — activity-weighted proration
  allocated_vercel_cents         int NOT NULL DEFAULT 0,
  allocated_supabase_cents       int NOT NULL DEFAULT 0,

  -- Fixed overhead — spread evenly across active orgs
  allocated_fixed_overhead_cents int NOT NULL DEFAULT 0,

  -- Composite total
  total_cost_cents               int NOT NULL DEFAULT 0,

  -- Revenue (from subscription_charges when available) and derived margin
  revenue_cents                  int NOT NULL DEFAULT 0,
  gross_margin_cents             int NOT NULL DEFAULT 0,

  -- Activity signals for churn detection and proration
  last_user_login_at             timestamptz,
  active_leases                  int NOT NULL DEFAULT 0,
  cron_invocations_for_org       int NOT NULL DEFAULT 0,

  frozen                         boolean NOT NULL DEFAULT false,
  updated_at                     timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, period)
);

CREATE INDEX IF NOT EXISTS idx_pcs_period
  ON platform_cost_snapshots(period DESC);
CREATE INDEX IF NOT EXISTS idx_pcs_org_period
  ON platform_cost_snapshots(org_id, period DESC);
CREATE INDEX IF NOT EXISTS idx_pcs_margin_period
  ON platform_cost_snapshots(period DESC, gross_margin_cents ASC);

ALTER TABLE platform_cost_snapshots ENABLE ROW LEVEL SECURITY;

-- All client SELECT denied — admin dashboard reads via service-role after requireAdminAuth()
-- No client writes — service role only via cron
DROP POLICY IF EXISTS "pcs_insert_deny" ON platform_cost_snapshots;
CREATE POLICY "pcs_insert_deny" ON platform_cost_snapshots
  FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "pcs_update_deny" ON platform_cost_snapshots;
CREATE POLICY "pcs_update_deny" ON platform_cost_snapshots
  FOR UPDATE USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "pcs_delete_deny" ON platform_cost_snapshots;
CREATE POLICY "pcs_delete_deny" ON platform_cost_snapshots
  FOR DELETE USING (false);

-- Purge snapshots older than 36 months
CREATE OR REPLACE FUNCTION purge_old_cost_snapshots()
RETURNS void AS $$
  DELETE FROM platform_cost_snapshots
  WHERE period < (now() - interval '36 months')::date;
$$ LANGUAGE sql SECURITY DEFINER;

-- Aggregate helper for cost snapshot builder — avoids PostgREST 1,000-row default limit.
-- Returns one row per org for the given period; called from lib/observability/cost.ts.
CREATE OR REPLACE FUNCTION get_ai_usage_agg_by_org(p_start timestamptz, p_end timestamptz)
RETURNS TABLE (
  org_id        uuid,
  call_count    bigint,
  input_tokens  bigint,
  output_tokens bigint,
  cost_cents    bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    org_id,
    count(*)              AS call_count,
    sum(input_tokens)     AS input_tokens,
    sum(output_tokens)    AS output_tokens,
    sum(cost_cents)       AS cost_cents
  FROM ai_usage
  WHERE created_at >= p_start
    AND created_at <  p_end
    AND success = true
    AND org_id IS NOT NULL
  GROUP BY org_id;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §18  Admin drill-down: AI usage aggregated by purpose for a single org
-- ═══════════════════════════════════════════════════════════════════════════════

-- Per-org, per-purpose aggregate helper for the admin cost drill-down page.
-- Avoids PostgREST 1,000-row default that would silently truncate high-volume orgs.
CREATE OR REPLACE FUNCTION get_ai_usage_agg_by_purpose(
  p_org_id uuid,
  p_start  timestamptz
)
RETURNS TABLE (
  purpose    text,
  cost_cents bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    purpose,
    sum(cost_cents) AS cost_cents
  FROM ai_usage
  WHERE org_id     = p_org_id
    AND created_at >= p_start
    AND success    = true
  GROUP BY purpose
  ORDER BY sum(cost_cents) DESC;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §19  Tier model: expand subscriptions CHECK to include growth + bespoke tiers
-- ═══════════════════════════════════════════════════════════════════════════════
-- The 2026-04 pricing overhaul introduced a 6-tier model
-- (owner / steward / growth / portfolio / firm / bespoke).
-- The original CHECK only allowed (owner / steward / portfolio / firm) — growth
-- and bespoke were missing, so any subscription insert for those tiers would
-- fail at the DB level.
-- No data migration needed — existing rows use 'owner' which remains valid.

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('owner', 'steward', 'growth', 'portfolio', 'firm', 'bespoke'));

-- trial_tier: allow trialling the growth tier as well
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_trial_tier_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_trial_tier_check
  CHECK (trial_tier IS NULL OR trial_tier IN ('steward', 'growth', 'portfolio', 'firm'));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §20  BUILD_63: Tenant communication lifecycle — audit trail + delivery events
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds audit-grade fields to communication_log, a delivery-events table fed by
-- Resend / Africa's Talking webhooks, a mandatory-comm retry queue, and a
-- platform-level WhatsApp template variant catalog.

-- ── Audit-grade fields on communication_log ────────────────────────────────
ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS body_full             text,
  ADD COLUMN IF NOT EXISTS template_version_hash text,
  ADD COLUMN IF NOT EXISTS tone_variant          text
    CHECK (tone_variant IN ('friendly','professional','firm','n/a')),
  ADD COLUMN IF NOT EXISTS trigger_event_type    text,
  ADD COLUMN IF NOT EXISTS trigger_event_id      uuid,
  ADD COLUMN IF NOT EXISTS attempt_number        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_attempt_log_id  uuid REFERENCES communication_log(id),
  ADD COLUMN IF NOT EXISTS failed_reason_code    text;

CREATE INDEX IF NOT EXISTS idx_comm_log_trigger
  ON communication_log(trigger_event_type, trigger_event_id);

CREATE INDEX IF NOT EXISTS idx_comm_log_mandatory
  ON communication_log(org_id, template_key)
  WHERE template_key IN (
    'arrears.letter_of_demand','arrears.final_notice',
    'lease.renewal_notice','lease.expiry_reminder','lease.terminated',
    'deposit.return_schedule','deposit.returned',
    'inspection.move_in_report','inspection.dispute_window',
    'maintenance.emergency'
  );

-- ── Delivery events (provider webhooks + portal view events) ──────────────
CREATE TABLE IF NOT EXISTS communication_delivery_events (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organisations(id),
  communication_log_id uuid        NOT NULL REFERENCES communication_log(id),
  event_type           text        NOT NULL CHECK (event_type IN (
                         'queued','sent','delivered','opened','clicked',
                         'bounced_hard','bounced_soft','complained',
                         'unsubscribed','failed','page_view','portal_view'
                       )),
  provider             text        NOT NULL CHECK (provider IN (
                         'resend','africastalking_sms','africastalking_whatsapp','pleks_portal'
                       )),
  provider_event_id    text,
  occurred_at          timestamptz NOT NULL,
  raw_payload          jsonb,
  received_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_delivery_log
  ON communication_delivery_events(communication_log_id);
CREATE INDEX IF NOT EXISTS idx_comm_delivery_org
  ON communication_delivery_events(org_id, occurred_at DESC);

ALTER TABLE communication_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_delivery_read" ON communication_delivery_events;
CREATE POLICY "org_delivery_read" ON communication_delivery_events
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ));

-- ── Mandatory-comm retry queue ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mandatory_comm_retries (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organisations(id),
  communication_log_id uuid        NOT NULL REFERENCES communication_log(id),
  template_key         text        NOT NULL,
  recipient_snapshot   jsonb       NOT NULL,
  attempt_count        integer     NOT NULL DEFAULT 1,
  next_attempt_at      timestamptz NOT NULL,
  last_failure_reason  text,
  surrendered_at       timestamptz,
  surrender_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mandatory_retries_due
  ON mandatory_comm_retries(next_attempt_at)
  WHERE surrendered_at IS NULL;

ALTER TABLE mandatory_comm_retries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_mandatory_retries_read" ON mandatory_comm_retries;
CREATE POLICY "org_mandatory_retries_read" ON mandatory_comm_retries
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ));

-- ── Platform-email retry queue (ADDENDUM_CRON_RELIABILITY C-1 buckle) ─────────
-- Subscription/billing lifecycle emails go to the AGENCY ADMIN, not a tenant, so they can't use the
-- tenant-shaped mandatory_comm_retries (whose attempt-3 delivery-fallback assumes a tenant). This is the
-- parallel queue: sendPlatformEmail enqueues on a transient send failure; the hourly mandatory-retry cron
-- drains it (re-sends T+1h/6h/24h via the stored body_html), surrendering to the cron digest after.
CREATE TABLE IF NOT EXISTS platform_email_retries (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organisations(id),
  template_key         text        NOT NULL,
  communication_log_id uuid,
  to_email             text        NOT NULL,
  to_name              text,
  subject              text        NOT NULL,
  body_html            text        NOT NULL,
  attempt_count        integer     NOT NULL DEFAULT 1,
  next_attempt_at      timestamptz NOT NULL,
  last_error           text,
  surrendered_at       timestamptz,
  surrender_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_email_retries_due
  ON platform_email_retries(next_attempt_at)
  WHERE surrendered_at IS NULL;

ALTER TABLE platform_email_retries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_platform_email_retries_read" ON platform_email_retries;
CREATE POLICY "org_platform_email_retries_read" ON platform_email_retries
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ));

-- ── Login rate-limit (ADDENDUM_AUTH_HARDENING — server-sign-in keystone) ──────
-- Durable, DB-backed per-IP + per-email login throttle (the in-memory forgot-password limiter is leaky on
-- Vercel multi-instance). identifier is "ip:<addr>" or "email:<sha256 hex>" (never plaintext email — POPIA).
-- Service-role only (the login server action is the sole reader/writer); no client policy.
CREATE TABLE IF NOT EXISTS login_rate_limits (
  identifier           text        PRIMARY KEY,
  window_start         timestamptz NOT NULL DEFAULT now(),
  attempts_in_window   integer     NOT NULL DEFAULT 0,
  consecutive_failures integer     NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_rate_limits_locked ON login_rate_limits(locked_until) WHERE locked_until IS NOT NULL;
ALTER TABLE login_rate_limits ENABLE ROW LEVEL SECURITY;

-- ── WhatsApp Meta template variant catalog (platform-level, no org_id) ────
CREATE TABLE IF NOT EXISTS whatsapp_template_variants (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key         text        NOT NULL,
  tone_variant         text        NOT NULL CHECK (tone_variant IN ('friendly','professional','firm','n/a')),
  meta_template_name   text        NOT NULL,
  language_code        text        NOT NULL DEFAULT 'en_ZA',
  meta_approval_status text        NOT NULL DEFAULT 'pending'
                         CHECK (meta_approval_status IN ('pending','approved','rejected','paused')),
  approved_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, tone_variant, language_code)
);

CREATE INDEX IF NOT EXISTS idx_wa_variants_key
  ON whatsapp_template_variants(template_key, tone_variant)
  WHERE meta_approval_status = 'approved';

-- No RLS needed: platform-level reference table, service-role managed,
-- readable by authenticated users via service client in router.

-- ── auth_events: portal-token login support (BUILD_63 §9.2) ───────────────────
-- tenant_portal_login / landlord_portal_login events have no auth.users row —
-- user_id must be nullable for these paths. tenant_id provides the identity link.
-- token_link added to auth_method CHECK for magic-link / portal-token flows.
ALTER TABLE auth_events ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE auth_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_auth_events_tenant ON auth_events(tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE auth_events DROP CONSTRAINT IF EXISTS auth_events_auth_method_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_auth_method_check
  CHECK (auth_method IN (
    'password', 'magic_link', 'totp', 'passkey', 'recovery_code', 'oauth', 'admin', 'token_link'
  ));

-- ══════════════════════════════════════════════════════════════════════════════
-- §BUILD_LEGAL: External links registry — admin-editable, daily cron health check
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS external_links (
  key             text        PRIMARY KEY,
  url             text        NOT NULL,
  label           text        NOT NULL,
  category        text        NOT NULL DEFAULT 'other'
                    CHECK (category IN ('regulatory', 'browser_help', 'service_policy', 'infrastructure', 'other')),
  is_healthy      boolean     NOT NULL DEFAULT true,
  last_status     int,
  last_checked_at timestamptz,
  last_ok_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ADDENDUM_CRON_RELIABILITY C-2: debounce link-health alerts. check-links increments this on a failed run and
-- resets it to 0 on a healthy one; the alert fires only once N consecutive checks have failed (kills transient
-- network blips + bot-block flaps that produced the false-positive 404s).
ALTER TABLE external_links ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

ALTER TABLE external_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "external_links_read" ON external_links;
CREATE POLICY "external_links_read" ON external_links
  FOR SELECT USING (true);

DROP TRIGGER IF EXISTS trg_external_links_updated_at ON external_links;
CREATE TRIGGER trg_external_links_updated_at
  BEFORE UPDATE ON external_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO external_links (key, url, label, category) VALUES
  ('informationRegulator', 'https://inforegulator.org.za',        'Information Regulator of SA',  'regulatory'),
  ('sahrc',                'https://www.sahrc.org.za',             'SA Human Rights Commission',   'regulatory'),
  ('chromeCookieHelp',     'https://support.google.com/chrome/answer/95647',
                           'Chrome — manage cookies',              'browser_help'),
  ('firefoxCookieHelp',    'https://support.mozilla.org/kb/clear-cookies-and-site-data-firefox',
                           'Firefox — manage cookies',             'browser_help'),
  ('safariCookieHelp',     'https://support.apple.com/guide/safari/manage-cookies-sfri11471',
                           'Safari — manage cookies',              'browser_help'),
  ('edgeCookieHelp',       'https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09',
                           'Edge — manage cookies',                'browser_help'),
  ('payfastPrivacy',       'https://payfast.io/privacy-policy/',   'PayFast Privacy Policy',       'service_policy'),
  ('statusPage',           'https://status.pleks.co.za',           'Pleks Status Page',            'infrastructure')
ON CONFLICT (key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §21  BUILD_63 Phase 8: mandatory_comm_retries — manual dispatch tracking
-- ═══════════════════════════════════════════════════════════════════════════════
-- Surrendered comms surface on the agent dashboard. The agent prints and
-- dispatches physically; these columns record that action for audit continuity.

ALTER TABLE mandatory_comm_retries
  ADD COLUMN IF NOT EXISTS manually_dispatched_at  timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_notes          text,
  ADD COLUMN IF NOT EXISTS dispatched_by           uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_mandatory_retries_surrendered_undispatched
  ON mandatory_comm_retries(org_id, surrendered_at)
  WHERE surrendered_at IS NOT NULL AND manually_dispatched_at IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §22  ADDENDUM_57G: Subscription Pause & Dormancy Policy
--      State machine: trialing → active ↔ past_due → paused → cancelled → purged
--      "Your Data, Always" doctrine: reads/exports/audit/crons always fire;
--      net-new business creation is the only commercially-gated capability.
-- ═══════════════════════════════════════════════════════════════════════════════

-- §X.1 — Status CHECK widening (adds paused + purged; removes legacy grace_period)
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing','active','past_due','paused','cancelled','purged'));

-- §X.2 — Pause & cancellation lifecycle columns
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since        timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at             timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason          text,
  ADD COLUMN IF NOT EXISTS resumed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS purge_eligible_at     timestamptz,
  ADD COLUMN IF NOT EXISTS purge_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS purged_at             timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_purge
  ON subscriptions(status, purge_eligible_at)
  WHERE status IN ('cancelled','paused');

-- §X.3 — Owner-free dormancy tracking on organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS dormancy_warning_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS dormancy_final_sent_at   timestamptz;

-- §X.4  BUILD_57G dormancy: RPC helpers that join into auth.users
--        The JS client cannot reach auth schema directly; SECURITY DEFINER
--        runs with the definer's privileges. Locked to service_role only.
--        search_path pinned to prevent SECURITY DEFINER schema-hijack.

CREATE OR REPLACE FUNCTION find_dormant_org_candidates(cutoff_iso timestamptz)
RETURNS TABLE (
  id                 uuid,
  name               text,
  email              text,
  phone              text,
  address            text,
  brand_accent_color text,
  last_member_login  timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    o.id, o.name, o.email, o.phone, o.address,
    o.brand_accent_color,
    MAX(au.last_sign_in_at) AS last_member_login
  FROM organisations o
  LEFT JOIN user_orgs uo ON uo.org_id = o.id AND uo.deleted_at IS NULL
  LEFT JOIN auth.users au ON au.id = uo.user_id
  WHERE o.dormancy_warning_sent_at IS NULL
    AND o.created_at < cutoff_iso
    AND o.deleted_at IS NULL
    AND o.id <> '00000000-0000-0000-0000-000000000001'::uuid  -- Excludes BUILD_65 POPIA-purged tombstone
  GROUP BY o.id
  HAVING MAX(au.last_sign_in_at) IS NULL
      OR MAX(au.last_sign_in_at) < cutoff_iso;
$$;

REVOKE EXECUTE ON FUNCTION find_dormant_org_candidates(timestamptz) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION find_dormant_org_candidates(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION find_dormancy_final_candidates(cutoff_iso timestamptz)
RETURNS TABLE (
  id                       uuid,
  name                     text,
  email                    text,
  phone                    text,
  address                  text,
  brand_accent_color       text,
  dormancy_warning_sent_at timestamptz,
  last_member_login        timestamptz
)
LANGUAGE sql SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    o.id, o.name, o.email, o.phone, o.address,
    o.brand_accent_color,
    o.dormancy_warning_sent_at,
    MAX(au.last_sign_in_at) AS last_member_login
  FROM organisations o
  LEFT JOIN user_orgs uo ON uo.org_id = o.id AND uo.deleted_at IS NULL
  LEFT JOIN auth.users au ON au.id = uo.user_id
  WHERE o.dormancy_warning_sent_at IS NOT NULL
    AND o.dormancy_final_sent_at IS NULL
    AND o.dormancy_warning_sent_at < cutoff_iso
    AND o.deleted_at IS NULL
    AND o.id <> '00000000-0000-0000-0000-000000000001'::uuid  -- Excludes BUILD_65 POPIA-purged tombstone
  GROUP BY o.id
  HAVING MAX(au.last_sign_in_at) IS NULL
      OR MAX(au.last_sign_in_at) <= o.dormancy_warning_sent_at;
$$;

REVOKE EXECUTE ON FUNCTION find_dormancy_final_candidates(timestamptz) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION find_dormancy_final_candidates(timestamptz) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §23  ADDENDUM_57G Step 8: purgeOrg() primitive — claim slot + cascade delete
-- ═══════════════════════════════════════════════════════════════════════════════
--  purge_started_at tracks that a purge is in progress (claim slot).
--  claim_purge_slot() atomically sets organisations.deleted_at to prevent
--  concurrent double-purge; returns the org id on success, empty on conflict.
--  purge_org_cascade() repoints retention-protected rows to the sentinel org,
--  deletes everything else via a retry-on-FK loop (ordering-free), then
--  marks subscriptions purged and anonymises the org row.
--  Safety: sentinel (…0001) and decoy (…0003) orgs cannot be purged.
-- ═══════════════════════════════════════════════════════════════════════════════

-- §X.4 — audit_log.changed_by: drop strict FK; re-add as ON DELETE SET NULL
--         Every user deletion currently breaks the purge chain.
--         Actor identity is denormalised in actor_name (ADDENDUM_45A), so
--         audit semantics survive losing the FK pointer.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_changed_by_fkey;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changed_by uuid;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND contype  = 'f'
      AND conname  = 'audit_log_changed_by_users_fk'
  ) THEN
    ALTER TABLE audit_log
      ADD CONSTRAINT audit_log_changed_by_users_fk
      FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- §X.5 — claim_purge_slot: atomically marks org as "purge reserved"
--         Sets organisations.deleted_at = now(); returns org id on success or
--         empty set if already claimed/purged (deleted_at IS NOT NULL).
--         Downstream queries must filter WHERE deleted_at IS NULL to exclude
--         reserved/purged orgs from future processing.
CREATE OR REPLACE FUNCTION claim_purge_slot(p_org_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    UPDATE organisations
       SET deleted_at = now()
     WHERE id          = p_org_id
       AND deleted_at IS NULL
    RETURNING id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_purge_slot(uuid) TO service_role;

-- §X.6 — purge_org_cascade: retention-aware transactional purge
--         1. Repoints retention-protected tables to sentinel (…0001)
--         2. Deletes all other org-scoped public tables via retry-on-FK loop
--            (loop re-runs until all tables delete cleanly — handles FK order
--            automatically without requiring a manually maintained cascade list)
--         3. Marks subscription(s) purged
--         4. Anonymises the org row (row is kept — subscriptions FK to it)
--         5. Inserts a PURGE audit entry on the sentinel org
CREATE OR REPLACE FUNCTION purge_org_cascade(p_org_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sentinel  uuid    := '00000000-0000-0000-0000-000000000001';
  v_decoy     uuid    := '00000000-0000-0000-0000-000000000003';
  v_tables    text[];
  v_table     text;
  v_errors    int;
  v_prev      int     := -1;
BEGIN
  -- Safety: refuse to purge the sentinel or decoy orgs
  IF p_org_id = v_sentinel OR p_org_id = v_decoy THEN
    RAISE EXCEPTION 'purge_org_cascade: refusing to purge sentinel/decoy org %', p_org_id;
  END IF;

  -- Step 1: Repoint retention-protected rows to sentinel
  UPDATE audit_log                    SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE trust_transactions           SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE trust_reconciliation_periods SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE consent_log                  SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE auth_events                  SET org_id = v_sentinel WHERE org_id = p_org_id;
  UPDATE tos_acceptances              SET org_id = v_sentinel WHERE org_id = p_org_id;

  -- Step 2: Auto-discover all remaining public tables with org_id
  SELECT array_agg(c.table_name ORDER BY c.table_name)
  INTO   v_tables
  FROM   information_schema.columns c
  WHERE  c.table_schema = 'public'
    AND  c.column_name  = 'org_id'
    AND  c.table_name  NOT IN (
           'audit_log','trust_transactions','trust_reconciliation_periods',
           'consent_log','auth_events','tos_acceptances',  -- retention-protected (step 1)
           'organisations','subscriptions'                 -- handled separately (steps 3+4)
         );

  -- Step 3: Retry-on-FK loop — naturally orders leaf-to-root over passes
  LOOP
    v_errors := 0;
    FOREACH v_table IN ARRAY COALESCE(v_tables, '{}') LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE org_id = $1', v_table)
          USING p_org_id;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        v_errors := v_errors + 1;
      END;
    END LOOP;
    EXIT WHEN v_errors = 0;
    IF v_errors = v_prev THEN
      RAISE EXCEPTION 'purge_org_cascade: FK cycle for org %, % tables unreachable',
        p_org_id, v_errors;
    END IF;
    v_prev := v_errors;
  END LOOP;

  -- Step 4: Mark subscription(s) purged
  UPDATE subscriptions
     SET status    = 'purged',
         purged_at = now()
   WHERE org_id = p_org_id;

  -- Step 5: Anonymise org row (keep it — subscriptions.org_id FKs to organisations.id)
  UPDATE organisations
     SET name               = '[purged]',
         email              = NULL,
         phone              = NULL,
         address_line1      = NULL,
         city               = NULL,
         settings           = '{}'::jsonb,
         brand_logo_url     = NULL,
         brand_accent_color = NULL,
         deleted_at         = now()   -- idempotent: claim_purge_slot may have set this already
   WHERE id = p_org_id;

  -- Step 6: Single audit entry on the sentinel org
  INSERT INTO audit_log (org_id, table_name, record_id, action, new_values)
  VALUES (
    v_sentinel,
    'organisations',
    p_org_id::text,
    'PURGE',
    jsonb_build_object(
      'original_org_id', p_org_id,
      'reason',          p_reason,
      'purged_at',       now()
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purge_org_cascade(uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §X.7  ADDENDUM_57G Step 9: two-step cancellation + PENDING_CANCELLATION state
-- ═══════════════════════════════════════════════════════════════════════════════
--  Adds an intermediate state between active and cancelled. The 12-month purge
--  clock starts only on confirmation, not on initial click.  Unconfirmed requests
--  expire after 24 hours (daily cron reverts status → previous state).
--  organisations.deleted_at is NOT touched here — it remains reserved for purge.
--  subscriptions.cancelled_at is the confirmation timestamp.

-- Widen status CHECK
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing','active','past_due','paused','pending_cancellation','cancelled','purged'));

-- pending_cancellation_since: set when user clicks Cancel; cleared on confirm or expiry
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pending_cancellation_since timestamptz;

-- cancellation_terms_version: snapshot of the governing ToS at confirmation time
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancellation_terms_version text;

-- Index for the daily expiry sweep
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_cancellation
  ON subscriptions (pending_cancellation_since)
  WHERE status = 'pending_cancellation';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §X.8  Gate 2: ToS version archival — tos_acceptances table
-- ═══════════════════════════════════════════════════════════════════════════════
--  Records which ToS version each org accepted and when. Append-only (immutable
--  trigger). org_id uses ON DELETE RESTRICT — purgeOrg() must repoint to sentinel
--  before deleting the org row (enforced by purge_org_cascade step 1 above).
--  Retention: 10 years (POPIA s17 accountability). Added to RETENTION_PROTECTED_TABLES.

CREATE TABLE IF NOT EXISTS tos_acceptances (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid        NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  user_id              uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email_snapshot  text        NOT NULL,
  user_id_snapshot     uuid        NOT NULL,
  terms_version        text        NOT NULL,
  privacy_version      text        NOT NULL,
  accepted_at          timestamptz NOT NULL DEFAULT now(),
  ip_address           inet,
  user_agent           text,
  acceptance_hash      text        NOT NULL,
  context              text        NOT NULL DEFAULT 'signup'
                                   CHECK (context IN (
                                     'signup',
                                     'version_update',
                                     'reactivation',
                                     'ownership_transfer'
                                   ))
);

-- One signup acceptance per org/user/version combination
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tos_signup
  ON tos_acceptances (org_id, user_id_snapshot, terms_version)
  WHERE context = 'signup';

CREATE INDEX IF NOT EXISTS idx_tos_acc_org ON tos_acceptances(org_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_tos_acc_ver ON tos_acceptances(terms_version);

-- Append-only: block UPDATE and DELETE
CREATE OR REPLACE FUNCTION prevent_tos_acceptance_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tos_acceptances rows are immutable';
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_tos_acceptance_update ON tos_acceptances;
CREATE TRIGGER trg_prevent_tos_acceptance_update
  BEFORE UPDATE OR DELETE ON tos_acceptances
  FOR EACH ROW EXECUTE FUNCTION prevent_tos_acceptance_mutation();

ALTER TABLE tos_acceptances ENABLE ROW LEVEL SECURITY;
-- No client-role policies: service role only (bypasses RLS).
-- Admin portal reads via service client with compliance_access_log entry.

-- ═══════════════════════════════════════════════════════════════════════════════
-- §24  BUILD_67: Rules engine — per-rule per-org execution log
-- ═══════════════════════════════════════════════════════════════════════════════

-- Stores every rule evaluation regardless of outcome — the observability layer
-- for the autonomous intelligence engine. Retention: 90 days (operational, not
-- a Compliance Record). Service role only — no agent-facing RLS policies.

CREATE TABLE IF NOT EXISTS rule_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      text        NOT NULL,
  org_id       uuid        REFERENCES organisations(id) ON DELETE SET NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  condition    text        NOT NULL
               CHECK (condition IN ('met', 'not_met', 'error')),
  outcome      text        NOT NULL
               CHECK (outcome IN (
                 'actioned',
                 'no_op',
                 'cooldown',
                 'tier_gated',
                 'sub_gated',
                 'error'
               )),
  payload      jsonb,
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rule_runs_rule_org
  ON rule_runs (rule_id, org_id, evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_runs_recent
  ON rule_runs (evaluated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_runs_outcome
  ON rule_runs (outcome, evaluated_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §25  ADDENDUM_14F: auth_events.event_type CHECK extension
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds consent verification + ADDENDUM_14E special-information event types.
-- NOTE: user_id is nullable since BUILD_63 §9.2 (ALTER COLUMN user_id DROP NOT NULL).
-- Token-based applicant/director flows write to auth_events with user_id=NULL.
-- These event types are written by /api/consent/send-code and /api/consent/verify-code.

ALTER TABLE auth_events DROP CONSTRAINT IF EXISTS auth_events_event_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_event_type_check
  CHECK (event_type IN (
    'login_success', 'login_failure', 'logout',
    'password_changed', 'email_changed',
    'totp_enrolled', 'totp_unenrolled', 'totp_verified', 'totp_failed',
    'passkey_enrolled', 'passkey_unenrolled', 'passkey_verified', 'passkey_failed',
    'step_up_challenged', 'step_up_verified', 'step_up_failed',
    'session_revoked', 'new_device_detected', 'recovery_used',
    'role_switched',
    'tenant_portal_login', 'landlord_portal_login',
    'supplier_portal_login', 'agent_portal_login',
    'consent_code_sent', 'consent_code_verified',
    'consent_verification_failed', 'consent_verification_locked_out',
    'consent_email_link_sent', 'consent_email_link_verified',
    'consent_special_information_given', 'consent_special_information_revoked'
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §26  ADDENDUM_14A: organisation_payment_tokens + property-intelligence bucket
-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores PayFast Tokenisation tokens (subscription_type=2) for saved-card
-- one-click pulls. One active token per org at a time; deleted_at soft-deletes.
-- Storage bucket: property-intelligence — org-scoped PDFs from vendor pulls.

CREATE TABLE IF NOT EXISTS organisation_payment_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  payfast_token text       NOT NULL,
  last_4       text,
  card_brand   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_org_payment_tokens_org ON organisation_payment_tokens(org_id)
  WHERE deleted_at IS NULL;

ALTER TABLE organisation_payment_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_payment_tokens_read"   ON organisation_payment_tokens;
DROP POLICY IF EXISTS "org_payment_tokens_delete"  ON organisation_payment_tokens;

CREATE POLICY "org_payment_tokens_read" ON organisation_payment_tokens
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));

-- Soft-delete only (set deleted_at); no hard DELETE from client
CREATE POLICY "org_payment_tokens_delete" ON organisation_payment_tokens
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));

-- Storage bucket: property-intelligence
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-intelligence',
  'property-intelligence',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'pi_org_read'
  ) THEN
    CREATE POLICY "pi_org_read" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'property-intelligence'
        AND (storage.foldername(name))[1] IN (
          SELECT org_id::text FROM user_orgs WHERE user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §27  BUILD_65: POPIA CUSTOMER-FACING SURFACE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Data-subject-request workflow, immutable versioned privacy policy,
-- retention-aware erasure cascade, export bundle artefacts.
--
-- See brief/build/BUILD_65_POPIA_CUSTOMER_SURFACE.md for the full spec.
-- See brief/legal/PROCESSING_PURPOSES.md for the POPIA register.
--
-- Invariant (D-POPIA-01): Pleks is Operator for agency-operated data,
-- Responsible Party for platform account data. This schema models the
-- routing and resolution of subject rights across both controllers.

-- ─── privacy_policy_versions ─────────────────────────────────────────────────
-- Immutable versioned privacy policy. consent_log.consent_version references
-- the `version` text column by soft text-equality (no hard FK — missing
-- version degrades to "text not available" fallback, not cascade deletion).

CREATE TABLE IF NOT EXISTS privacy_policy_versions (
  version                 text PRIMARY KEY,  -- e.g. '2026.1', '2026.2-material'
  title                   text NOT NULL,
  body_markdown           text NOT NULL,
  body_html               text NOT NULL,     -- pre-rendered to avoid runtime pandoc
  change_type             text NOT NULL DEFAULT 'minor'
                          CHECK (change_type IN ('minor', 'material')),
  change_summary          text,              -- what changed vs previous version
  effective_from          date NOT NULL,
  superseded_at           date,              -- NULL = currently effective
  is_current              boolean NOT NULL DEFAULT false,
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Only one current version at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_privacy_policy_single_current
  ON privacy_policy_versions(is_current)
  WHERE is_current = true;

ALTER TABLE privacy_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "privacy_policy_public_select" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_public_select" ON privacy_policy_versions
  FOR SELECT USING (true);  -- public read (policy is public by POPIA s18)

DROP POLICY IF EXISTS "privacy_policy_platform_admin_insert" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_platform_admin_insert" ON privacy_policy_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.deleted_at IS NULL
        AND (o.settings->>'platform_admin')::boolean = true
    )
  );

-- UPDATE allowed only to flip superseded_at + is_current; body is immutable
DROP POLICY IF EXISTS "privacy_policy_platform_admin_update_supersede" ON privacy_policy_versions;
CREATE POLICY "privacy_policy_platform_admin_update_supersede" ON privacy_policy_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = (SELECT auth.uid())
        AND uo.deleted_at IS NULL
        AND (o.settings->>'platform_admin')::boolean = true
    )
  );
-- Immutability of body enforced via trigger (below)

-- ─── data_subject_requests ───────────────────────────────────────────────────
-- Every POPIA right exercised (and the Pleks nuke request type).
-- Agency-gated resolution within 30-day SLA.

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),

  -- Subject identification
  subject_user_id         uuid REFERENCES auth.users(id),  -- NULL if non-user
  subject_email           text NOT NULL,
  subject_full_name       text,                            -- captured at submission
  subject_id_last4        text,                            -- optional, for identity verification
  subject_role_context    text CHECK (subject_role_context IN
                          ('tenant', 'landlord', 'supplier', 'applicant',
                           'reference', 'emergency_contact', 'household_member',
                           'platform_account', 'other')),

  -- Request details
  request_type            text NOT NULL CHECK (request_type IN
                          ('access', 'correction', 'erasure', 'objection',
                           'restriction', 'portability', 'consent_withdrawal',
                           'nuke')),
  request_scope           jsonb DEFAULT '{}'::jsonb,
  -- Shape varies per request_type, e.g.:
  -- correction: { field_path, current_value, requested_value, supporting_docs[] }
  -- objection:  { processing_purpose_keys[], reason }
  -- consent_withdrawal: { consent_type, consent_log_id }
  -- nuke: { acknowledged_carveouts: [{ category, retained_until, reason }] }

  subject_narrative       text,              -- free-text from subject explaining request
  supporting_documents    jsonb DEFAULT '[]'::jsonb,  -- [{ storage_path, filename, uploaded_at }]

  -- Lifecycle
  status                  text NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'verifying_identity',
                                            'under_review', 'approved',
                                            'rejected', 'completed',
                                            'cancelled')),
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  submitted_via           text NOT NULL DEFAULT 'portal'
                          CHECK (submitted_via IN ('portal', 'email', 'platform_admin_route', 'agency_initiated')),
  sla_deadline            date NOT NULL DEFAULT (now() + interval '30 days')::date,

  -- Resolution
  assigned_to             uuid REFERENCES auth.users(id),  -- agency staff
  resolution_notes        text,              -- why approved/rejected, carve-outs applied
  resolution_legal_basis  text,              -- s24(1)(b) obligation, s11(1)(c) legitimate interest, etc.
  resolved_at             timestamptz,
  resolved_by             uuid REFERENCES auth.users(id),

  -- Artefact linkage
  export_id               uuid,              -- FK added after popia_exports is created
  erasure_records_affected jsonb,            -- summary of what was deleted/restricted

  -- Communications
  notified_subject_at     timestamptz,       -- when resolution email sent
  notified_subject_template text,            -- which React Email template used

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsr_org_status
  ON data_subject_requests(org_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsr_sla_overdue
  ON data_subject_requests(org_id, sla_deadline)
  WHERE status IN ('new', 'verifying_identity', 'under_review');
CREATE INDEX IF NOT EXISTS idx_dsr_subject
  ON data_subject_requests(subject_user_id, submitted_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dsr_subject_email
  ON data_subject_requests(lower(subject_email), submitted_at DESC);

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Subject sees their own requests (matched by auth.uid() or email)
DROP POLICY IF EXISTS "dsr_subject_select_own" ON data_subject_requests;
CREATE POLICY "dsr_subject_select_own" ON data_subject_requests
  FOR SELECT USING (
    subject_user_id = (SELECT auth.uid())
    OR lower(subject_email) = lower(((SELECT auth.jwt()) ->> 'email'))  -- JWT claim, not auth.users (anon/authenticated lack SELECT on it; the auth.users read breaks nested RLS during storage INSERT...RETURNING). (SELECT …) so the planner evals once per query (initplan), not per row.
  );

-- Org staff see their org's requests
DROP POLICY IF EXISTS "dsr_org_select" ON data_subject_requests;
CREATE POLICY "dsr_org_select" ON data_subject_requests
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Subject creates own request
DROP POLICY IF EXISTS "dsr_subject_insert" ON data_subject_requests;
CREATE POLICY "dsr_subject_insert" ON data_subject_requests
  FOR INSERT WITH CHECK (
    subject_user_id = (SELECT auth.uid())
    OR lower(subject_email) = lower(((SELECT auth.jwt()) ->> 'email'))  -- JWT claim, not auth.users (anon/authenticated lack SELECT on it; the auth.users read breaks nested RLS during storage INSERT...RETURNING). (SELECT …) so the planner evals once per query (initplan), not per row.
  );

-- Org staff update their org's requests (status, assignment, resolution)
DROP POLICY IF EXISTS "dsr_org_update" ON data_subject_requests;
CREATE POLICY "dsr_org_update" ON data_subject_requests
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- No DELETE — requests are immutable history (resolution writes resolved_at, doesn't remove the row)

-- ─── popia_exports ───────────────────────────────────────────────────────────
-- Structurally similar to trust_audit_exports (BUILD_64). Manifest-hash tamper
-- evidence; regenerateable with immutable history.

CREATE TABLE IF NOT EXISTS popia_exports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid REFERENCES organisations(id),
  -- org_id NULL when this is a Pleks-RP platform-account export
  -- (not an Operator export for a specific agency)
  controller_role         text NOT NULL
                          CHECK (controller_role IN ('pleks_rp', 'agency_operator')),

  -- Subject identification (same pattern as data_subject_requests)
  subject_user_id         uuid REFERENCES auth.users(id),
  subject_email           text NOT NULL,

  -- Request linkage
  request_id              uuid REFERENCES data_subject_requests(id),
  export_type             text NOT NULL
                          CHECK (export_type IN ('access', 'portability', 'nuke_predelivery')),

  -- Artefacts (all in popia-exports Storage bucket)
  pdf_storage_path        text NOT NULL,
  json_storage_path       text NOT NULL,
  zip_storage_path        text,              -- nullable if no supporting files
  manifest_hash           text NOT NULL,     -- SHA-256 of concatenated artefact bytes
  manifest_summary        jsonb NOT NULL,    -- { artefact_paths, byte_counts, category_counts }

  -- Lifecycle
  generated_at            timestamptz NOT NULL DEFAULT now(),
  generated_by            uuid NOT NULL REFERENCES auth.users(id),
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  downloaded_at           timestamptz,       -- first download timestamp
  download_count          integer NOT NULL DEFAULT 0,

  -- Regeneration lineage (per D-POPIA-12)
  regeneration_of         uuid REFERENCES popia_exports(id),
  regeneration_reason     text,

  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popia_exports_subject
  ON popia_exports(subject_user_id, generated_at DESC)
  WHERE subject_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_popia_exports_request
  ON popia_exports(request_id)
  WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_popia_exports_org
  ON popia_exports(org_id, generated_at DESC)
  WHERE org_id IS NOT NULL;

ALTER TABLE popia_exports ENABLE ROW LEVEL SECURITY;

-- Subject reads own exports
DROP POLICY IF EXISTS "popia_exports_subject_select" ON popia_exports;
CREATE POLICY "popia_exports_subject_select" ON popia_exports
  FOR SELECT USING (
    subject_user_id = (SELECT auth.uid())
    OR lower(subject_email) = lower(((SELECT auth.jwt()) ->> 'email'))  -- JWT claim, not auth.users (anon/authenticated lack SELECT on it; the auth.users read breaks nested RLS during storage INSERT...RETURNING). (SELECT …) so the planner evals once per query (initplan), not per row.
  );

-- Org staff read their org's exports
DROP POLICY IF EXISTS "popia_exports_org_select" ON popia_exports;
CREATE POLICY "popia_exports_org_select" ON popia_exports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- INSERT via service role only (export generation is server-side)
-- No client INSERT policy.

-- UPDATE only to record download (downloaded_at, download_count)
DROP POLICY IF EXISTS "popia_exports_subject_update_download" ON popia_exports;
CREATE POLICY "popia_exports_subject_update_download" ON popia_exports
  FOR UPDATE USING (
    subject_user_id = (SELECT auth.uid())
    OR lower(subject_email) = lower(((SELECT auth.jwt()) ->> 'email'))  -- JWT claim, not auth.users (anon/authenticated lack SELECT on it; the auth.users read breaks nested RLS during storage INSERT...RETURNING). (SELECT …) so the planner evals once per query (initplan), not per row.
  );
-- Write permissions to individual columns enforced by explicit UPDATE statement shape in lib/popia/export.ts

-- No DELETE

-- Add FK from data_subject_requests.export_id now that popia_exports exists
ALTER TABLE data_subject_requests
  DROP CONSTRAINT IF EXISTS data_subject_requests_export_id_fkey;
ALTER TABLE data_subject_requests
  ADD CONSTRAINT data_subject_requests_export_id_fkey
  FOREIGN KEY (export_id) REFERENCES popia_exports(id) ON DELETE SET NULL;

-- ─── retention_policies_snapshot ─────────────────────────────────────────────
-- Per-org snapshot of retention defaults at a point in time. Enables
-- per-org future customisation without losing the historical what-was-the-rule
-- audit trail. For Phase 1, every active org has one row matching the
-- platform defaults (D-POPIA-02). Tier 2 may add per-org overrides.

CREATE TABLE IF NOT EXISTS retention_policies_snapshot (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  effective_from          date NOT NULL DEFAULT current_date,
  superseded_at           date,
  policies                jsonb NOT NULL,
  -- Shape: { category: { retention_months: int, legal_basis: text, regulatory_source: text, erasable_during_retention: bool } }
  -- Categories match D-POPIA-02 table
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_retention_policies_org_current
  ON retention_policies_snapshot(org_id)
  WHERE superseded_at IS NULL;

ALTER TABLE retention_policies_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retention_policies_org_select" ON retention_policies_snapshot;
CREATE POLICY "retention_policies_org_select" ON retention_policies_snapshot
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Subject-facing read via SECURITY DEFINER helper (subject isn't in user_orgs for that agency)
-- See lib/popia/retention.ts getRetentionForSubject()

-- INSERT / UPDATE via service role only (platform admin manages)

-- ─── retention_purge_runs ────────────────────────────────────────────────────
-- Daily retention cron writes one row per purge execution per org, with
-- structured counts of records affected per category. Full audit trail for
-- the regulatory claim "we enforce retention automatically."

CREATE TABLE IF NOT EXISTS retention_purge_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  run_started_at          timestamptz NOT NULL DEFAULT now(),
  run_completed_at        timestamptz,
  records_by_category     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Shape: { category: { evaluated: n, deleted: n, skipped_carveout: n } }
  errors                  jsonb DEFAULT '[]'::jsonb,
  status                  text NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_purge_runs_org_started
  ON retention_purge_runs(org_id, run_started_at DESC);

ALTER TABLE retention_purge_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purge_runs_org_select" ON retention_purge_runs;
CREATE POLICY "purge_runs_org_select" ON retention_purge_runs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- Service-role-only INSERT/UPDATE

-- ─── Trigger: immutable policy body ──────────────────────────────────────────
-- Once a privacy_policy_versions row is created, body_markdown and body_html
-- cannot change. Only is_current and superseded_at may flip.

CREATE OR REPLACE FUNCTION check_policy_version_immutable()
RETURNS trigger AS $$
BEGIN
  IF OLD.body_markdown IS DISTINCT FROM NEW.body_markdown
     OR OLD.body_html IS DISTINCT FROM NEW.body_html
     OR OLD.change_type IS DISTINCT FROM NEW.change_type
     OR OLD.effective_from IS DISTINCT FROM NEW.effective_from
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.title IS DISTINCT FROM NEW.title
     OR OLD.change_summary IS DISTINCT FROM NEW.change_summary
  THEN
    RAISE EXCEPTION 'POPIA_POLICY_IMMUTABLE: Policy content is immutable once created. Create a new version instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_policy_version_immutable ON privacy_policy_versions;
CREATE TRIGGER trg_policy_version_immutable
  BEFORE UPDATE ON privacy_policy_versions
  FOR EACH ROW EXECUTE FUNCTION check_policy_version_immutable();

-- ─── Trigger: data_subject_requests.updated_at ───────────────────────────────
DROP TRIGGER IF EXISTS trg_dsr_updated_at ON data_subject_requests;
CREATE TRIGGER trg_dsr_updated_at
  BEFORE UPDATE ON data_subject_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Storage bucket: popia-exports ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'popia-exports', 'popia-exports', false, 52428800,
  ARRAY['application/pdf', 'application/json', 'application/zip',
        'image/jpeg', 'image/png', 'message/rfc822']
)
ON CONFLICT (id) DO NOTHING;

-- Path convention: {org_id}/{subject_user_id or _email_hash}/{export_id}/{filename}
-- Platform-account exports (org_id NULL): platform/{subject_user_id}/{export_id}/{filename}

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'popia_exports_subject_read'
  ) THEN
    CREATE POLICY "popia_exports_subject_read" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'popia-exports'
        AND EXISTS (
          SELECT 1 FROM popia_exports pe
          WHERE (pe.pdf_storage_path = storage.objects.name
                 OR pe.json_storage_path = storage.objects.name
                 OR pe.zip_storage_path = storage.objects.name)
            AND (
              pe.subject_user_id = (SELECT auth.uid())
              -- Read the email from the JWT claim, NOT a sub-SELECT on auth.users: storage uploads do
              -- INSERT ... RETURNING *, which evaluates every SELECT policy on the new row, and Postgres plans
              -- this sub-SELECT as an InitPlan regardless of the bucket_id guard. anon/authenticated can't read
              -- auth.users → "permission denied for table users" broke uploads to EVERY bucket. (drift-fix 2026-06-22)
              OR lower(pe.subject_email) = lower((auth.jwt() ->> 'email'))
            )
            AND pe.expires_at > now()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'popia_exports_org_read'
  ) THEN
    CREATE POLICY "popia_exports_org_read" ON storage.objects
      FOR SELECT USING (
        bucket_id = 'popia-exports'
        AND EXISTS (
          SELECT 1 FROM popia_exports pe
          WHERE (pe.pdf_storage_path = storage.objects.name
                 OR pe.json_storage_path = storage.objects.name
                 OR pe.zip_storage_path = storage.objects.name)
            AND pe.org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
        )
      );
  END IF;
END $$;

-- ─── Seed default retention policies per org (D-POPIA-02 defaults) ───────────
-- Synced with PLATFORM_DEFAULTS in lib/popia/retention.ts — that constant is
-- the source of truth; keep this JSONB in lockstep with it.

CREATE OR REPLACE FUNCTION seed_default_retention_policies(org_uuid uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO retention_policies_snapshot (org_id, effective_from, policies)
  VALUES (
    org_uuid,
    current_date,
    '{
      "trust_account_records":   {"retention_months": 60,    "legal_basis": "legal_obligation",    "regulatory_source": "PPRA s54A",                                                                           "erasable_during_retention": false},
      "lease_documents":         {"retention_months": 60,    "legal_basis": "legal_obligation",    "regulatory_source": "Prescription Act 68 of 1969 + PPRA practice",                                         "erasable_during_retention": false},
      "inspection_photos":       {"retention_months": 36,    "legal_basis": "legal_obligation",    "regulatory_source": "Rental Housing Act 50 of 1999 s5(3)",                                                 "erasable_during_retention": false},
      "inspection_reports":      {"retention_months": 36,    "legal_basis": "legal_obligation",    "regulatory_source": "Rental Housing Act 50 of 1999 s5(3)",                                                 "erasable_during_retention": false},
      "rent_ledger":             {"retention_months": 60,    "legal_basis": "legal_obligation",    "regulatory_source": "Tax Administration Act 28 of 2011 s29 + PPRA",                                        "erasable_during_retention": false},
      "communications":          {"retention_months": 60,    "legal_basis": "legitimate_interest", "regulatory_source": "PPRA practice — aligned with trust-record retention",                                 "erasable_during_retention": false},
      "rejected_applications":   {"retention_months": 12,    "legal_basis": "legitimate_interest", "regulatory_source": "POPIA s14 minimisation principle",                                                    "erasable_during_retention": false},
      "credit_checks":           {"retention_months": 12,    "legal_basis": "consent",             "regulatory_source": "POPIA s11(1)(a) + credit bureau consent form",                                        "erasable_during_retention": false},
      "consent_log":             {"retention_months": 99999, "legal_basis": "legal_obligation",    "regulatory_source": "POPIA s17 (accountability principle)",                                                "erasable_during_retention": false, "never_erasable": true},
      "audit_log":               {"retention_months": 84,    "legal_basis": "legal_obligation",    "regulatory_source": "SA business records retention standard",                                              "erasable_during_retention": false},
      "maintenance_records":     {"retention_months": 36,    "legal_basis": "legitimate_interest", "regulatory_source": "RHT evidentiary practice",                                                            "erasable_during_retention": false},
      "platform_account":        {"retention_months": 0,     "legal_basis": "consent",             "regulatory_source": "POPIA s14 minimisation — account data deleted 30 days post closure",                 "erasable_during_retention": true}
    }'::jsonb
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ─── Auto-seed retention policies on org creation ─────────────────────────────

CREATE OR REPLACE FUNCTION trigger_seed_retention_policies()
RETURNS trigger AS $$
BEGIN
  -- Skip sentinel org (ADDENDUM_57G purge sentinel)
  IF NEW.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RETURN NEW;
  END IF;
  PERFORM seed_default_retention_policies(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_org_seed_retention ON organisations;
CREATE TRIGGER trg_org_seed_retention
  AFTER INSERT ON organisations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_seed_retention_policies();

-- ─── One-shot backfill for active orgs ───────────────────────────────────────
-- Idempotent: NOT IN skips orgs that already have an active snapshot;
-- ON CONFLICT DO NOTHING in the helper provides a second safety net.

DO $$
DECLARE
  org_row record;
BEGIN
  FOR org_row IN
    SELECT id FROM organisations
    WHERE deleted_at IS NULL
      AND id != '00000000-0000-0000-0000-000000000001'::uuid
      AND id NOT IN (SELECT org_id FROM retention_policies_snapshot WHERE superseded_at IS NULL)
  LOOP
    PERFORM seed_default_retention_policies(org_row.id);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §28  ADDENDUM_14H Phase D: per-org FitScore narrative feature flag
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per D2 decision (2026-05-21): per-org flag defaulting true. Enables soft-launch
-- (flip to false for specific orgs to opt out) and future per-org narrative control.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS fitscore_narrative_enabled boolean NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §29  ADDENDUM_14H Phase G: user_capabilities — capability-grant model
-- ═══════════════════════════════════════════════════════════════════════════════
-- Capability-grant model on top of the existing role hierarchy (Review #4 decision).
-- Three capabilities: can_generate_popia_s23, can_run_fitscore_replay,
-- can_view_sensitive_identity_data. Org-scoped: a user can hold a capability in
-- one org but not another. Only owner / property_manager roles are eligible grantees.
-- Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.7.
-- NOTE (Phase G.2(a), kept-not-dropped): can_run_fitscore_replay is intentionally not yet
-- wired — the only replay surface today is the admin route /admin/popia-requests/[applicationId],
-- which gates on requireAdminAuth() (admin routes can't call agent-side gateway()). The capability
-- is RESERVED for a future agency-side surface: a per-org Information Officer running a replay from
-- the dashboard. Retain the enum value; do not treat "no callers" as dead.

CREATE TABLE IF NOT EXISTS user_capabilities (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  capability_name text        NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  granted_by      uuid        REFERENCES auth.users(id),
  CONSTRAINT user_capabilities_name_check CHECK (
    capability_name IN (
      'can_generate_popia_s23',
      'can_run_fitscore_replay',
      'can_view_sensitive_identity_data'
    )
  ),
  CONSTRAINT user_capabilities_unique UNIQUE (user_id, org_id, capability_name)
);

CREATE INDEX IF NOT EXISTS idx_user_capabilities_user_org
  ON user_capabilities(user_id, org_id);

ALTER TABLE user_capabilities ENABLE ROW LEVEL SECURITY;

-- Agents can read their own capabilities (needed for dashboard capability checks)
DROP POLICY IF EXISTS "agents read own capabilities" ON user_capabilities;
CREATE POLICY "agents read own capabilities" ON user_capabilities
  FOR SELECT
  USING (user_id = (SELECT auth.uid()));

-- Org owners and property managers can manage capabilities within their org
DROP POLICY IF EXISTS "owners manage org capabilities" ON user_capabilities;
CREATE POLICY "owners manage org capabilities" ON user_capabilities
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'property_manager')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
        AND role IN ('owner', 'property_manager')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §30  BUILD_AUTH_RESOLVER: onboarding_state + one-active-membership invariant
-- ═══════════════════════════════════════════════════════════════════════════════
-- Spec: ADDENDUM_AUTH_RESOLVER §8.1 + §4.5 (amended by ADDENDUM_AUTH_RESOLVER_AMENDMENTS_2026-05-27)
-- Amendment 4: onboarding_state is TEXT CHECK enum (not jsonb); onboarding_progress is JSONB sidecar.
-- Amendment 1: I-4 trigger restructured around per-table is_*_active() predicates.

-- ── §30.1  onboarding columns ───────────────────────────────────────────────

-- Drop old jsonb column if it exists (was wrong type from first draft)
ALTER TABLE user_profiles DROP COLUMN IF EXISTS onboarding_state;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_onboarding_state_check;
DROP INDEX IF EXISTS idx_user_profiles_onboarding_pending;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_state TEXT
    CHECK (onboarding_state IN (
      'pending_profile',
      'pending_org',
      'pending_invite',
      'complete'
    ));

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS user_profiles_onboarding_state_idx
  ON user_profiles(onboarding_state)
  WHERE onboarding_state != 'complete';

COMMENT ON COLUMN user_profiles.onboarding_state IS
  'Coarse onboarding lifecycle. Resolver-read. Four values, see CHECK constraint.';

COMMENT ON COLUMN user_profiles.onboarding_progress IS
  'Wizard-internal step progress, free-form JSONB. Wizard-read only. Reset to {} on complete.';

-- Backfill: existing users with an active membership → complete; others → pending_profile
UPDATE user_profiles up
SET onboarding_state    = 'complete',
    onboarding_progress = '{}'::jsonb
WHERE onboarding_state IS NULL
  AND (
    EXISTS (SELECT 1 FROM user_orgs uo      WHERE uo.user_id      = up.id AND uo.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM user_orgs_tenants uot WHERE uot.user_id  = up.id)
    OR EXISTS (SELECT 1 FROM landlords l    WHERE l.auth_user_id  = up.id AND l.deleted_at IS NULL AND l.portal_access_enabled = true)
  );

UPDATE user_profiles
SET onboarding_state    = 'pending_profile',
    onboarding_progress = '{}'::jsonb
WHERE onboarding_state IS NULL;

-- ── §30.2  auth_events event_type extension + pre-auth nullable user_id ────
-- Add resolver_decision and email_existence_check to the allowed set.
-- Drop and re-add the CHECK constraint (Postgres has no ADD CONSTRAINT IF NOT EXISTS for CHECK).
ALTER TABLE auth_events DROP CONSTRAINT IF EXISTS auth_events_event_type_check;
ALTER TABLE auth_events ADD CONSTRAINT auth_events_event_type_check
  CHECK (event_type IN (
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
    'role_switched',
    'tenant_portal_login',
    'landlord_portal_login',
    'supplier_portal_login',
    'agent_portal_login',
    'resolver_decision',
    'email_existence_check',
    'membership_claimed',
    'membership_claim_blocked_by_invariant'
  ));

-- Pre-auth events (email_existence_check, resolver_decision for unauthenticated paths)
-- have no associated auth.users row yet. Allow NULL user_id for those rows.
-- Post-auth events keep the FK when user_id is non-null (nullable FK is still enforced when set).
ALTER TABLE auth_events ALTER COLUMN user_id DROP NOT NULL;

-- ── §30.3  honeytoken_emails — canary addresses for enumeration detection ───
CREATE TABLE IF NOT EXISTS honeytoken_emails (
  email text PRIMARY KEY
);

ALTER TABLE honeytoken_emails ENABLE ROW LEVEL SECURITY;

-- Service client only — no direct user access
DROP POLICY IF EXISTS "honeytoken_emails_no_public_access" ON honeytoken_emails;
CREATE POLICY "honeytoken_emails_no_public_access" ON honeytoken_emails
  FOR ALL USING (false);

-- ── §30.4  Per-table active-state predicates (Amendment 1) ─────────────────
-- Centralise "is this row active?" per table. Future lifecycle changes extend
-- these helpers only — the trigger structure remains stable.

CREATE OR REPLACE FUNCTION is_user_org_active(row_data user_orgs)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN row_data.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION is_tenant_membership_active(row_data user_orgs_tenants)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- user_orgs_tenants has no soft-delete column; presence = active.
  -- If a deleted_at or suspended_at column is added later, extend this predicate.
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION is_landlord_membership_active(row_data landlords)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN row_data.deleted_at IS NULL
    AND row_data.portal_access_enabled = TRUE
    AND row_data.auth_user_id IS NOT NULL;
END;
$$;

-- ── §30.5  Cross-table active-count helper ──────────────────────────────────
-- Called by per-table triggers to count active memberships excluding the row
-- currently being inserted/updated (avoiding self-count on UPDATE paths).

CREATE OR REPLACE FUNCTION count_active_memberships_for_user(
  p_user_id        UUID,
  p_excluded_table TEXT,
  p_excluded_id    UUID
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total INT := 0;
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM user_orgs uo
  WHERE uo.user_id = p_user_id
    AND is_user_org_active(uo)
    AND NOT (p_excluded_table = 'user_orgs' AND uo.id = p_excluded_id);
  v_total := v_total + v_count;

  SELECT COUNT(*) INTO v_count FROM user_orgs_tenants uot
  WHERE uot.user_id = p_user_id
    AND is_tenant_membership_active(uot)
    AND NOT (p_excluded_table = 'user_orgs_tenants' AND uot.id = p_excluded_id);
  v_total := v_total + v_count;

  SELECT COUNT(*) INTO v_count FROM landlords l
  WHERE l.auth_user_id = p_user_id
    AND is_landlord_membership_active(l)
    AND NOT (p_excluded_table = 'landlords' AND l.id = p_excluded_id);
  v_total := v_total + v_count;

  -- When ADDENDUM_19B ships, add the supplier_contacts block here.
  RETURN v_total;
END;
$$;

-- ── §30.6  Per-table trigger functions ──────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_user_orgs_single_active() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_user_org_active(NEW) THEN RETURN NEW; END IF;
  IF count_active_memberships_for_user(NEW.user_id, 'user_orgs', NEW.id) > 0 THEN
    RAISE EXCEPTION 'SovereignMembershipViolation: user_id % already has an active membership elsewhere', NEW.user_id
      USING ERRCODE = 'P0001',
            DETAIL  = 'one-email-one-active-membership invariant (ADDENDUM_AUTH_RESOLVER I-4)',
            HINT    = 'sever existing membership before creating new one';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_orgs_single_membership ON user_orgs;
DROP TRIGGER IF EXISTS trg_enforce_single_membership ON user_orgs;
CREATE TRIGGER user_orgs_single_membership
  BEFORE INSERT OR UPDATE ON user_orgs
  FOR EACH ROW EXECUTE FUNCTION enforce_user_orgs_single_active();

CREATE OR REPLACE FUNCTION enforce_user_orgs_tenants_single_active() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_tenant_membership_active(NEW) THEN RETURN NEW; END IF;
  IF count_active_memberships_for_user(NEW.user_id, 'user_orgs_tenants', NEW.id) > 0 THEN
    RAISE EXCEPTION 'SovereignMembershipViolation: user_id % already has an active membership elsewhere', NEW.user_id
      USING ERRCODE = 'P0001',
            DETAIL  = 'one-email-one-active-membership invariant (ADDENDUM_AUTH_RESOLVER I-4)',
            HINT    = 'sever existing membership before creating new one';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_orgs_tenants_single_membership ON user_orgs_tenants;
DROP TRIGGER IF EXISTS trg_enforce_single_membership ON user_orgs_tenants;
CREATE TRIGGER user_orgs_tenants_single_membership
  BEFORE INSERT OR UPDATE ON user_orgs_tenants
  FOR EACH ROW EXECUTE FUNCTION enforce_user_orgs_tenants_single_active();

CREATE OR REPLACE FUNCTION enforce_landlords_single_active() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_landlord_membership_active(NEW) THEN RETURN NEW; END IF;
  IF count_active_memberships_for_user(NEW.auth_user_id, 'landlords', NEW.id) > 0 THEN
    RAISE EXCEPTION 'SovereignMembershipViolation: auth_user_id % already has an active membership elsewhere', NEW.auth_user_id
      USING ERRCODE = 'P0001',
            DETAIL  = 'one-email-one-active-membership invariant (ADDENDUM_AUTH_RESOLVER I-4)',
            HINT    = 'sever existing membership before creating new one';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS landlords_single_membership ON landlords;
DROP TRIGGER IF EXISTS trg_enforce_single_membership ON landlords;
CREATE TRIGGER landlords_single_membership
  BEFORE INSERT OR UPDATE ON landlords
  FOR EACH ROW EXECUTE FUNCTION enforce_landlords_single_active();

-- ═══════════════════════════════════════════════════════════════════════════════
-- §31  ADDENDUM_ACTIVATION_2026-05-28 §B+§C: welcome_seen + activation_delegations
-- ═══════════════════════════════════════════════════════════════════════════════
-- Spec: ADDENDUM_ACTIVATION_2026-05-28.md §B (Welcome interstitial) + §C (delegation model)

-- ── §31.1  user_profiles.welcome_seen — per-user first-run gate ──────────────
-- Tracks whether the /welcome interstitial has been completed by this user.
-- Per-user, NOT per-org: founder + each invited agent-class member each see it once.
-- Set to true when the user clicks "Continue to Pleks" at the end of the Welcome flow.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS welcome_seen BOOLEAN NOT NULL DEFAULT false;

-- ── §31.2  activation_delegations — owner → member advisory task pointers ────
-- Owner can delegate specific activation checklist items to org members.
-- §B reads this for delegation previews at Welcome; §C owns writes (Owner "delegate" action).
-- Delegable items: operational setup only. Legal items (information_officer, trust_account,
-- billing) are non-delegable and enforced by the §C server action allowlist.
CREATE TABLE IF NOT EXISTS activation_delegations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  item_key      text NOT NULL,
  delegated_to  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegated_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delegated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, item_key)
);

CREATE INDEX IF NOT EXISTS activation_delegations_org_delegated_to_idx
  ON activation_delegations(org_id, delegated_to);

ALTER TABLE activation_delegations ENABLE ROW LEVEL SECURITY;

-- Org members can read delegations scoped to their org
DROP POLICY IF EXISTS "activation_delegations_org_members_select" ON activation_delegations;
CREATE POLICY "activation_delegations_org_members_select" ON activation_delegations
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Only owners may write delegations; §C server action enforces the delegable-item allowlist
DROP POLICY IF EXISTS "activation_delegations_owner_insert" ON activation_delegations;
CREATE POLICY "activation_delegations_owner_insert" ON activation_delegations
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner' AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "activation_delegations_owner_delete" ON activation_delegations;
CREATE POLICY "activation_delegations_owner_delete" ON activation_delegations
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner' AND deleted_at IS NULL
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §32  PASSKEY_FIX: store WebAuthn binary fields as base64url TEXT, not bytea
-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase-js JSON-serialises a Node Buffer to {"type":"Buffer","data":[...]} on insert,
-- so writing a Buffer into a bytea column persisted that JSON string's bytes (corrupt),
-- and reading bytea back yields a "\x..."-hex string the route code then mis-decoded —
-- so verifyRegistrationResponse/verifyAuthenticationResponse never matched (passkeys never
-- enrolled: user_passkeys was empty). The canonical simplewebauthn-on-Supabase pattern is
-- to store these as base64url TEXT and pass them straight through. Safe to convert in place:
-- passkey_challenges are ephemeral (5-min TTL) and user_passkeys is empty. Guarded so it's
-- a no-op once converted (idempotent re-runs). UNIQUE/index on credential_id rebuild on the
-- new text column automatically.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'passkey_challenges' AND column_name = 'challenge') = 'bytea' THEN
    ALTER TABLE passkey_challenges ALTER COLUMN challenge TYPE text USING encode(challenge, 'base64');
  END IF;
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'user_passkeys' AND column_name = 'credential_id') = 'bytea' THEN
    ALTER TABLE user_passkeys ALTER COLUMN credential_id TYPE text USING encode(credential_id, 'base64');
  END IF;
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'user_passkeys' AND column_name = 'public_key') = 'bytea' THEN
    ALTER TABLE user_passkeys ALTER COLUMN public_key TYPE text USING encode(public_key, 'base64');
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §33  ADDENDUM_68 (Slice 1): enriched bug-report context
-- ═══════════════════════════════════════════════════════════════════════════════
-- 1:1 companion to feedback_submissions, written only for category='bug' reports.
-- Holds auto-captured client diagnostics (route, device, console errors, failed
-- requests) plus the correlation keys (pleks_trace → Supabase logs, x_vercel_id →
-- Vercel logs) so the admin can pull the real server logs on demand. Kept in a
-- separate table so praise/feature rows stay clean. No screenshot_path in Slice 1
-- (deferred to Slice 2). RLS enabled (SECURITY RULE #2 — overrides the spec's "no
-- RLS" note); reads/writes go via service role, policies mirror feedback_submissions
-- through the parent so the Category-7 audit passes and a stray anon client can't leak.

CREATE TABLE IF NOT EXISTS bug_context (
  submission_id      uuid PRIMARY KEY REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  route_path         text,
  full_url_scrubbed  text,
  referrer_path      text,
  pleks_trace        text,            -- → Supabase log join key
  x_vercel_id        text,            -- → Vercel log join key
  app_version        text,
  user_agent_parsed  text,            -- "Android Chrome 148" (parsed, not raw UA)
  viewport           text,            -- "412x915 @2x"
  online_state       text,            -- "online/4g" | "offline"
  pwa_mode           boolean,
  console_errors     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ts,level,message}] scrubbed, cap 20
  failed_requests    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{method,path,status,at}] no bodies, cap 10
  client_timestamp   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_context_trace ON bug_context(pleks_trace) WHERE pleks_trace IS NOT NULL;

ALTER TABLE bug_context ENABLE ROW LEVEL SECURITY;

-- Submitter can read/insert their own bug context (parent owns submitter_id).
DROP POLICY IF EXISTS "bug_context_submitter_select" ON bug_context;
CREATE POLICY "bug_context_submitter_select" ON bug_context
  FOR SELECT USING (
    submission_id IN (SELECT id FROM feedback_submissions WHERE submitter_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "bug_context_submitter_insert" ON bug_context;
CREATE POLICY "bug_context_submitter_insert" ON bug_context
  FOR INSERT WITH CHECK (
    submission_id IN (SELECT id FROM feedback_submissions WHERE submitter_id = (SELECT auth.uid()))
  );

-- Org admin (role='owner' OR is_admin) can read bug context for their org's reports.
DROP POLICY IF EXISTS "bug_context_org_admin_select" ON bug_context;
CREATE POLICY "bug_context_org_admin_select" ON bug_context
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM feedback_submissions
      WHERE org_id IN (
        SELECT org_id FROM user_orgs
        WHERE user_id = (SELECT auth.uid()) AND (role = 'owner' OR is_admin = true)
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §34  ADDENDUM_69 Slice A: passkey → session-AAL2 grants (revocation mirror)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A verified passkey mints a signed, session-bound `pleks_aal` cookie that lets the
-- gate + resolver treat the session as AAL2 (Supabase AAL only counts TOTP/phone). This
-- table mirrors each grant so it can be REVOKED (sign-out / passkey-revoke): the resolver
-- checks it; the gate verifies HMAC+expiry only (revoked-but-unexpired passes the gate
-- until exp/cookie-clear — bounded, and the gate routes AAL2 decisions to the resolver
-- anyway). session_id = the Supabase JWT session_id claim the grant is bound to. RLS
-- enabled (SECURITY RULE #2; the spec's "no RLS, matches auth_events" was wrong — auth_events
-- DOES have RLS): self-select only, writes are service-role.

CREATE TABLE IF NOT EXISTS passkey_aal_grants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  text NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  src         text NOT NULL DEFAULT 'passkey'
);

CREATE INDEX IF NOT EXISTS idx_passkey_aal_session ON passkey_aal_grants(session_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_passkey_aal_user    ON passkey_aal_grants(user_id);

ALTER TABLE passkey_aal_grants ENABLE ROW LEVEL SECURITY;

-- A user may see their own grants; inserts/updates are service-role only (no policy → denied).
DROP POLICY IF EXISTS "passkey_aal_grants_select_self" ON passkey_aal_grants;
CREATE POLICY "passkey_aal_grants_select_self" ON passkey_aal_grants
  FOR SELECT USING (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §35  SECURITY (P0, 2026-06-01): lock down SECURITY DEFINER purge functions
-- ═══════════════════════════════════════════════════════════════════════════════
-- purge_org_cascade / claim_purge_slot are SECURITY DEFINER with no caller-auth check and were
-- EXECUTE-granted to PUBLIC/anon/authenticated — so a POST /rest/v1/rpc/purge_org_cascade carrying
-- the public anon key could purge ANY org (RLS bypassed by the definer). Their only caller is
-- lib/subscriptions/purge.ts via createServiceClient(), so service_role-only EXECUTE closes the hole
-- with zero blast radius. The 3 retention purges are pg_cron-only (belt-and-suspenders revoke).
--
-- LESSON (apply everywhere — see ADDENDUM_00K): Supabase default privileges grant anon + authenticated
-- EXECUTE *explicitly*, separate from PUBLIC, so `REVOKE … FROM PUBLIC` ALONE IS INSUFFICIENT — name
-- all three. (count_distinct_orgs / 009 looked locked down but wasn't.) Verify LIVE proacl, not source.
-- Applied to prod 2026-06-01.
REVOKE EXECUTE ON FUNCTION public.purge_org_cascade(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_org_cascade(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_purge_slot(uuid)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_purge_slot(uuid)        TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_old_auth_events()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_ai_usage()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_cost_snapshots()    FROM PUBLIC, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §36  ADDENDUM_00I: RLS initplan — re-create the 13 policies defined in PROTECTED
--      007/008 with (SELECT auth.uid()) wrapping. 007/008 are amend-forbidden, so we
--      DROP+CREATE here (this block loads after them; the later definition wins).
--      Predicates are VERBATIM from 007/008, auth.uid() wrapped only — no logic change.
--      The other 221 flagged policies are wrapped in situ in their own files.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 007: org-isolation (FOR ALL)
DROP POLICY IF EXISTS "org_lease_co_tenants" ON lease_co_tenants;
CREATE POLICY "org_lease_co_tenants" ON lease_co_tenants
  FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

DROP POLICY IF EXISTS "org_unit_clause_defaults" ON unit_clause_defaults;
CREATE POLICY "org_unit_clause_defaults" ON unit_clause_defaults
  FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

DROP POLICY IF EXISTS "org_property_rules" ON property_rules;
CREATE POLICY "org_property_rules" ON property_rules
  FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

DROP POLICY IF EXISTS "comm_log_org_select" ON communication_log;
CREATE POLICY "comm_log_org_select" ON communication_log
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

DROP POLICY IF EXISTS "comm_prefs_org" ON communication_preferences;
CREATE POLICY "comm_prefs_org" ON communication_preferences
  FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

-- 007: landlord-portal (FOR SELECT)
DROP POLICY IF EXISTS "landlord_portal_self" ON landlords;
CREATE POLICY "landlord_portal_self" ON landlords
  FOR SELECT USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "landlord_portal_properties" ON properties;
CREATE POLICY "landlord_portal_properties" ON properties
  FOR SELECT USING (landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "landlord_portal_units" ON units;
CREATE POLICY "landlord_portal_units" ON units
  FOR SELECT USING (
    property_id IN (SELECT id FROM properties WHERE landlord_id IN (
      SELECT id FROM landlords WHERE auth_user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "landlord_portal_maintenance" ON maintenance_requests;
CREATE POLICY "landlord_portal_maintenance" ON maintenance_requests
  FOR SELECT USING (
    property_id IN (SELECT id FROM properties WHERE landlord_id IN (
      SELECT id FROM landlords WHERE auth_user_id = (SELECT auth.uid())
    ))
  );

DROP POLICY IF EXISTS "landlord_portal_statements" ON owner_statements;
CREATE POLICY "landlord_portal_statements" ON owner_statements
  FOR SELECT USING (landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "landlord_portal_leases" ON leases;
CREATE POLICY "landlord_portal_leases" ON leases
  FOR SELECT USING (
    property_id IN (SELECT id FROM properties WHERE landlord_id IN (
      SELECT id FROM landlords WHERE auth_user_id = (SELECT auth.uid())
    ))
  );

-- 008: org-isolation. The two shapes DIFFER (verified on disk):
--   maintenance_cost_allocations uses `org_id IN (...)`; deposit_interest_config uses `org_id = (... LIMIT 1)`.
DROP POLICY IF EXISTS "org_isolation" ON maintenance_cost_allocations;
CREATE POLICY "org_isolation" ON maintenance_cost_allocations
  USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "org_isolation" ON deposit_interest_config;
CREATE POLICY "org_isolation" ON deposit_interest_config
  USING (org_id = (
    SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL LIMIT 1
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §37  ADDENDUM_00K: SECURITY DEFINER EXECUTE-grant lockdown + search_path hardening
--      CREATE FUNCTION + Supabase default privileges leave PUBLIC+anon+authenticated
--      with EXECUTE; SECURITY DEFINER funcs run as owner → bypass RLS, so an
--      over-granted definer fn is an RLS-bypass surface via /rest/v1/rpc/<fn>. Lock
--      each to service_role (+ internal/trigger/owner callers). Callers verified —
--      see ADDENDUM_00K §2. NB: revoking PUBLIC alone is insufficient — anon+
--      authenticated are granted explicitly by Supabase defaults; name all three
--      (the count_distinct_orgs lesson). REVOKE/GRANT/ALTER FUNCTION only — no
--      defining site touched, so 007/008 stay byte-for-byte untouched even for
--      functions defined there. Idempotent. Live-proacl verified pre/post (D-00K-08).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── P0 (already shipped in §35; re-included idempotently to capture in source — D-00K-06) ──
REVOKE EXECUTE ON FUNCTION public.purge_org_cascade(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_org_cascade(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.claim_purge_slot(uuid)        FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_purge_slot(uuid)        TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_old_auth_events()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_ai_usage()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_old_cost_snapshots() FROM PUBLIC, anon, authenticated;

-- ── revoke 3 (keep postgres + service_role) — RLS-bypass definer fns, all callers service/trigger/internal ──
REVOKE EXECUTE ON FUNCTION public.audit_applications_fitscore_changes()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_email_exists(text)                               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.count_active_memberships_for_user(uuid, text, uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_landlords_single_active()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_orgs_single_active()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_orgs_tenants_single_active()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_agg_by_org(timestamptz, timestamptz)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_usage_agg_by_purpose(uuid, timestamptz)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_org_id()                                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_tier()                                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_distinct_audit_tables()                            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_org_member_by_email(uuid, text)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rls_audit()                                        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.org_has_trust_account()                                FROM PUBLIC, anon, authenticated;

-- ── complete the partial 009 revoke (PUBLIC already gone; anon+auth remained) ──
REVOKE EXECUTE ON FUNCTION public.count_distinct_orgs(text)                              FROM anon, authenticated;

-- ── revoke PUBLIC + anon, KEEP authenticated (verified authenticated-ctx caller / intended client use) ──
REVOKE EXECUTE ON FUNCTION public.get_active_unit_count(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_mfa_fresh(integer)                                  FROM PUBLIC, anon;

-- ── search_path hardening (ALTER FUNCTION … SET search_path — idempotent; closes function_search_path_mutable) ──
-- auth-touching funcs (reference the auth schema → public, auth, pg_temp):
ALTER FUNCTION public.get_current_org_id()                SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.get_current_tier()                  SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.get_org_member_by_email(uuid, text) SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.is_mfa_fresh(integer)               SET search_path = public, auth, pg_temp;

-- SECURITY DEFINER set (public, pg_temp):
ALTER FUNCTION public.audit_applications_fitscore_changes()               SET search_path = public, pg_temp;
ALTER FUNCTION public.claim_purge_slot(uuid)                              SET search_path = public, pg_temp;
ALTER FUNCTION public.count_active_memberships_for_user(uuid, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.count_distinct_orgs(text)                           SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_landlords_single_active()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_user_orgs_single_active()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_user_orgs_tenants_single_active()           SET search_path = public, pg_temp;
ALTER FUNCTION public.get_active_unit_count(uuid)                         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_ai_usage_agg_by_org(timestamptz, timestamptz)   SET search_path = public, pg_temp;
ALTER FUNCTION public.get_ai_usage_agg_by_purpose(uuid, timestamptz)      SET search_path = public, pg_temp;
ALTER FUNCTION public.get_distinct_audit_tables()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_rls_audit()                                     SET search_path = public, pg_temp;
ALTER FUNCTION public.org_has_trust_account()                             SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_old_ai_usage()                                SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_old_auth_events()                             SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_old_cost_snapshots()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_org_cascade(uuid, text)                       SET search_path = public, pg_temp;

-- SECURITY INVOKER set (search_path only — grants left as-is; invoker funcs respect RLS):
ALTER FUNCTION public.check_policy_version_immutable()                    SET search_path = public, pg_temp;
ALTER FUNCTION public.check_trust_txn_insert_period_open()                SET search_path = public, pg_temp;
ALTER FUNCTION public.check_trust_txn_period_open()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.compute_contact_dedup_hash()                        SET search_path = public, pg_temp;
ALTER FUNCTION public.get_arrears_interest_total(uuid)                    SET search_path = public, pg_temp;
ALTER FUNCTION public.get_prime_rate_on(date)                             SET search_path = public, pg_temp;
ALTER FUNCTION public.is_landlord_membership_active(public.landlords)             SET search_path = public, pg_temp;
ALTER FUNCTION public.is_tenant_membership_active(public.user_orgs_tenants)       SET search_path = public, pg_temp;
ALTER FUNCTION public.is_user_org_active(public.user_orgs)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.prevent_tos_acceptance_mutation()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.reconcile_self_landlord_bindings()                  SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_arrears_interest_total(uuid)                SET search_path = public, pg_temp;
ALTER FUNCTION public.seed_default_retention_policies(uuid)               SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_profile_from_self_landlord()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_property_has_managing_scheme()                 SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_self_landlord_from_profile()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_seed_retention_policies()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column()                          SET search_path = public, pg_temp;

-- ── rls_enabled_no_policy (§5): explicit service-role-only deny policies (D-00K-04).
--    RLS-on + no-policy already denies all client roles (service_role bypasses); these
--    make the intent legible + clear the INFO linter. deny→deny, no behaviour change.
--    All 9 confirmed: every app-code access path uses createServiceClient / the
--    service-role key (no cookie/anon/authenticated read path) — verified 2026-06-01.
DROP POLICY IF EXISTS "cron_runs_service_role_only" ON public.cron_runs;
CREATE POLICY "cron_runs_service_role_only" ON public.cron_runs FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "rule_runs_service_role_only" ON public.rule_runs;
CREATE POLICY "rule_runs_service_role_only" ON public.rule_runs FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "tos_acceptances_service_role_only" ON public.tos_acceptances;
CREATE POLICY "tos_acceptances_service_role_only" ON public.tos_acceptances FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "whatsapp_template_variants_service_role_only" ON public.whatsapp_template_variants;
CREATE POLICY "whatsapp_template_variants_service_role_only" ON public.whatsapp_template_variants FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "audit_exports_service_role_only" ON public.audit_exports;
CREATE POLICY "audit_exports_service_role_only" ON public.audit_exports FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "consent_verification_rate_limits_service_role_only" ON public.consent_verification_rate_limits;
CREATE POLICY "consent_verification_rate_limits_service_role_only" ON public.consent_verification_rate_limits FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "consent_verifications_service_role_only" ON public.consent_verifications;
CREATE POLICY "consent_verifications_service_role_only" ON public.consent_verifications FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "contact_leads_service_role_only" ON public.contact_leads;
CREATE POLICY "contact_leads_service_role_only" ON public.contact_leads FOR ALL USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "delivery_notice_tokens_service_role_only" ON public.delivery_notice_tokens;
CREATE POLICY "delivery_notice_tokens_service_role_only" ON public.delivery_notice_tokens FOR ALL USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §38  ONBOARDING: dashboard guided-setup dismissal (per-org)
--      The dashboard shows the new-user onboarding (get-started steps + workspace
--      setup) until the org finishes or skips it. We persist that as one timestamp on
--      organisations rather than deriving from "has a property" — so a user who skips
--      straight to the dashboard still gets the populated view, and onboarding never
--      re-appears across devices/sessions. Org-level: once anyone on the team completes
--      it, the org is set up for everyone. Null = onboarding still active.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;

-- Backfill: any org that already has a property is past onboarding → mark dismissed so the populated
-- dashboard shows for established orgs (the flag defaults NULL for everyone, incl. existing orgs).
-- Idempotent: only touches rows still NULL with a live property.
UPDATE organisations o SET onboarding_dismissed_at = now()
WHERE o.onboarding_dismissed_at IS NULL
  AND EXISTS (SELECT 1 FROM properties p WHERE p.org_id = o.id AND p.deleted_at IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §39  ONBOARDING: re-scope the flag to an explicit "skip", and clear stale dismissals
--      The rule changed: the guided setup dashboard now shows until the org has its first
--      property (an all-zeros populated dashboard is useless). onboarding_dismissed_at no
--      longer means a generic "finished/skipped" — it means ONLY "explicitly skipped setup"
--      (delegated: an admin will do it), the one way to force the populated view with no
--      portfolio. "I'll finish later" is a session-only defer and never writes this column.
--      The earlier "finish later" wrongly stamped it, so any org with NO live property that
--      carries a flag was dismissed by that bug (genuine skips post-date this) — clear them
--      so they get the corrected setup dashboard. Idempotent: re-runs match nothing.
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE organisations o SET onboarding_dismissed_at = NULL
WHERE o.onboarding_dismissed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM properties p WHERE p.org_id = o.id AND p.deleted_at IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §40  ADDENDUM_TEAM: atomic ownership transfer (single-owner invariant)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The transfer-ownership route did promote-new-owner then demote-old-owner as two separate PostgREST
-- updates with a best-effort manual rollback. A partial failure could leave the org with TWO owners (or
-- zero), violating the single-owner invariant the tier/billing model rests on (owner = the account
-- holder) and breaking any role='owner' + .single() resolution. This wraps both swaps in ONE plpgsql
-- transaction — atomic by construction. Row-count guard: if the new owner isn't an active member the
-- promote affects 0 rows → RAISE aborts the whole tx (no zero-owner state). SECURITY INVOKER (the route
-- calls it via the service client, which bypasses RLS); EXECUTE locked to service_role.
CREATE OR REPLACE FUNCTION transfer_org_ownership(p_org_id uuid, p_new_owner uuid, p_old_owner uuid)
RETURNS void
LANGUAGE plpgsql
AS $transfer$
DECLARE
  v_promoted int;
BEGIN
  UPDATE user_orgs SET role = 'owner', is_admin = true
    WHERE user_id = p_new_owner AND org_id = p_org_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_promoted = ROW_COUNT;
  IF v_promoted = 0 THEN
    RAISE EXCEPTION 'transfer_org_ownership: new owner % is not an active member of org %', p_new_owner, p_org_id;
  END IF;

  UPDATE user_orgs SET role = 'property_manager', is_admin = true
    WHERE user_id = p_old_owner AND org_id = p_org_id AND deleted_at IS NULL;
END;
$transfer$;

REVOKE EXECUTE ON FUNCTION transfer_org_ownership(uuid, uuid, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION transfer_org_ownership(uuid, uuid, uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §41  ADDENDUM_TEAMS_ASSIGNMENT_MODEL Layer 1: named teams (firm-tier overlay)
--      teams + team_members, and the team-assignment columns on properties/units/work items. Team columns
--      live here (not the domain files) so the FK → teams resolves on a fresh 001→012 replay (003/005 run
--      before this). assigned_user_id XOR assigned_team_id — both-null = Everyone/Org (D-1/D-11). The
--      Everyone/Org "team" is virtual (the null state), never a teams row (D-11).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  name        text NOT NULL,
  function    text NOT NULL DEFAULT 'general'
              CHECK (function IN ('maintenance', 'rentals', 'billing', 'inspections', 'general')),
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(org_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organisations(id),
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_uniq ON team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(org_id, user_id);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_teams" ON teams;
CREATE POLICY "org_teams" ON teams FOR ALL
  USING      (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_team_members" ON team_members;
CREATE POLICY "org_team_members" ON team_members FOR ALL
  USING      (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

-- Team-assignment columns (alongside the existing *_agent_id / assigned_user_id), with the not-both CHECK.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS managing_team_id uuid REFERENCES teams(id);
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_manager_not_both;
ALTER TABLE properties ADD  CONSTRAINT properties_manager_not_both
  CHECK (managing_agent_id IS NULL OR managing_team_id IS NULL);

ALTER TABLE units ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES teams(id);
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_assignee_not_both;
ALTER TABLE units ADD  CONSTRAINT units_assignee_not_both
  CHECK (assigned_agent_id IS NULL OR assigned_team_id IS NULL);

ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES teams(id);
ALTER TABLE maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_assignee_not_both;
ALTER TABLE maintenance_requests ADD  CONSTRAINT maintenance_requests_assignee_not_both
  CHECK (assigned_user_id IS NULL OR assigned_team_id IS NULL);

ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES teams(id);
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_assignee_not_both;
ALTER TABLE applications ADD  CONSTRAINT applications_assignee_not_both
  CHECK (assigned_user_id IS NULL OR assigned_team_id IS NULL);

ALTER TABLE inspections ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES teams(id);
ALTER TABLE inspections DROP CONSTRAINT IF EXISTS inspections_assignee_not_both;
ALTER TABLE inspections ADD  CONSTRAINT inspections_assignee_not_both
  CHECK (assigned_user_id IS NULL OR assigned_team_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_assigned_team ON maintenance_requests(org_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_assigned_team ON applications(org_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_assigned_team ON inspections(org_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §42  Settings Overview UI state: per-(user, org) dismissed "Set up" cards + page visit counts
--      Personal, cross-device UI state for the settings Overview — dismissed setup nudges and the
--      "Frequently used" visit tallies. Per user + org (setup is org-specific). RLS: each user sees
--      only their own rows.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settings_ui_state (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  dismissed_setup text[]  NOT NULL DEFAULT '{}',
  page_visits     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

ALTER TABLE settings_ui_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_ui_state_self" ON settings_ui_state;
CREATE POLICY "settings_ui_state_self" ON settings_ui_state
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §43  ADDENDUM_RBAC Phase 1: per-org role definitions + capabilities
--      Override layer over the in-code built-in roles (lib/auth/capabilities.ts): a row exists only when
--      an org has edited a built-in role's capabilities/visibility or added a custom role. The resolver
--      merges code defaults with these rows. `owner` is implicit-all and never stored here.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  label        text NOT NULL,
  role_group   text,
  is_system    boolean NOT NULL DEFAULT false,   -- built-in (overridden) vs org-created custom role
  capabilities text[]  NOT NULL DEFAULT '{}',
  enabled      boolean NOT NULL DEFAULT true,     -- hide a role from pickers without deleting it
  sort         integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON org_roles(org_id);

ALTER TABLE org_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_roles_org" ON org_roles;
CREATE POLICY "org_roles_org" ON org_roles
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL));

DROP TRIGGER IF EXISTS trg_org_roles_updated ON org_roles;
CREATE TRIGGER trg_org_roles_updated BEFORE UPDATE ON org_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════════
-- §44  BUILD_F3_LEGAL_HOLD: polymorphic litigation-hold mechanism
--      (SPEC_LEGAL_HOLD_POLYMORPHIC.md — supersedes the org-only RUNBOOK_LEGAL_HOLD snippet)
--      Immutable append-only events + SHA-256 instrument-hash chain (per scope). Active holds
--      (hold_placed not matched by hold_lifted) fail-close the F3 declined-applicant purge gate.
--      Writes route through placeLegalHold/liftLegalHold (service-role); direct INSERT is RLS-blocked.
-- ═══════════════════════════════════════════════════════════════════════════════

-- digest()/encode() for the hash chain (gen_random_uuid is core in PG13+, but pgcrypto is required for digest).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS legal_hold_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  scope_type            text NOT NULL,
  scope_id              uuid NOT NULL,
  event_type            text NOT NULL,
  trigger_category      text NOT NULL,
  placed_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  placed_by_capacity    text NOT NULL,
  reason_text           text,
  external_reference    text,
  lift_event_id         uuid REFERENCES legal_hold_events(id) ON DELETE RESTRICT,
  instrument_hash       text NOT NULL,
  prev_instrument_hash  text NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_hold_events_scope_type_check CHECK (
    scope_type IN ('org', 'application', 'subject', 'lease')
  ),
  CONSTRAINT legal_hold_events_event_type_check CHECK (
    event_type IN ('hold_placed', 'hold_lifted', 'hold_suppressed')
  ),
  CONSTRAINT legal_hold_events_trigger_category_check CHECK (
    trigger_category IN (
      'customer_dispute',
      'attorney_correspondence',
      'regulator_inquiry',
      'legal_demand',
      'dsar_contested',
      'tribunal_matter',
      'manual_information_officer',
      'pleks_platform_directive'
    )
  ),
  CONSTRAINT legal_hold_events_capacity_check CHECK (
    placed_by_capacity IN (
      'agency_io',
      'pleks_io',
      'pleks_platform_admin',
      'system'
    )
  ),
  CONSTRAINT legal_hold_events_lift_consistency CHECK (
    (event_type = 'hold_lifted' AND lift_event_id IS NOT NULL) OR
    (event_type != 'hold_lifted' AND lift_event_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_legal_hold_events_scope
  ON legal_hold_events(scope_type, scope_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_hold_events_org
  ON legal_hold_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_hold_events_category
  ON legal_hold_events(trigger_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_hold_events_hash_chain
  ON legal_hold_events(scope_type, scope_id, created_at ASC, id ASC);

COMMENT ON TABLE legal_hold_events IS
  'Polymorphic litigation-hold registry. Immutable append-only with SHA-256 instrument-hash chain. '
  'Active holds (hold_placed not followed by matching hold_lifted) block purge gates. '
  'POPIA s14(1)(b) lawful-purpose retention; accountability under s17.';
COMMENT ON COLUMN legal_hold_events.scope_type IS
  'Polymorphic scope: org | application | subject | lease. scope_id is resolved against the named table.';
COMMENT ON COLUMN legal_hold_events.instrument_hash IS
  'SHA-256 of (prev_instrument_hash || canonical row content). Computed by BEFORE INSERT trigger. '
  'Chain is per-scope; first row in any chain uses prev = 64 zeros.';

-- Append-only enforcement: UPDATE and DELETE both raise. Service role obeys the trigger (no bypass).
CREATE OR REPLACE FUNCTION prevent_legal_hold_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'legal_hold_events is append-only; UPDATE/DELETE not permitted (event_id=%)',
    COALESCE(OLD.id::text, 'unknown')
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_legal_hold_events_no_update ON legal_hold_events;
CREATE TRIGGER trg_legal_hold_events_no_update
  BEFORE UPDATE ON legal_hold_events
  FOR EACH ROW EXECUTE FUNCTION prevent_legal_hold_event_mutation();

DROP TRIGGER IF EXISTS trg_legal_hold_events_no_delete ON legal_hold_events;
CREATE TRIGGER trg_legal_hold_events_no_delete
  BEFORE DELETE ON legal_hold_events
  FOR EACH ROW EXECUTE FUNCTION prevent_legal_hold_event_mutation();

-- Instrument-hash chain (per scope). Canonical-content field order is load-bearing — verify fn (below)
-- walks the identical order. Any change here requires a coordinated change in verify_legal_hold_chain.
CREATE OR REPLACE FUNCTION compute_legal_hold_instrument_hash()
RETURNS trigger AS $$
DECLARE
  last_hash text;
  canonical_content text;
BEGIN
  SELECT instrument_hash INTO last_hash
  FROM legal_hold_events
  WHERE scope_type = NEW.scope_type AND scope_id = NEW.scope_id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF last_hash IS NULL THEN
    last_hash := repeat('0', 64);
  END IF;

  NEW.prev_instrument_hash := last_hash;

  canonical_content := concat_ws('|',
    NEW.scope_type,
    NEW.scope_id::text,
    NEW.event_type,
    NEW.trigger_category,
    COALESCE(NEW.placed_by::text, ''),
    NEW.placed_by_capacity,
    COALESCE(NEW.reason_text, ''),
    COALESCE(NEW.external_reference, ''),
    COALESCE(NEW.lift_event_id::text, ''),
    NEW.created_at::text
  );

  NEW.instrument_hash := encode(
    digest(NEW.prev_instrument_hash || canonical_content, 'sha256'),
    'hex'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;  -- pgcrypto (digest) lives in the extensions schema on Supabase

DROP TRIGGER IF EXISTS trg_legal_hold_events_hash ON legal_hold_events;
CREATE TRIGGER trg_legal_hold_events_hash
  BEFORE INSERT ON legal_hold_events
  FOR EACH ROW EXECUTE FUNCTION compute_legal_hold_instrument_hash();

ALTER TABLE legal_hold_events ENABLE ROW LEVEL SECURITY;

-- Org members can read holds against their own org.
DROP POLICY IF EXISTS "legal_hold_events_read_org" ON legal_hold_events;
CREATE POLICY "legal_hold_events_read_org" ON legal_hold_events
  FOR SELECT
  USING (
    org_id IN (
      SELECT user_orgs.org_id FROM user_orgs
      WHERE user_orgs.user_id = (SELECT auth.uid())
    )
  );

-- Direct INSERT forbidden — all writes go through placeLegalHold/liftLegalHold under service-role
-- (which bypasses RLS). An append-only bad row can never be rolled back, so the helpers are the only entry.
DROP POLICY IF EXISTS "legal_hold_events_insert_blocked" ON legal_hold_events;
CREATE POLICY "legal_hold_events_insert_blocked" ON legal_hold_events
  FOR INSERT
  WITH CHECK (false);

-- Tamper-evidence: walk the per-scope chain and recompute each hash. ok=false points at the broken row.
CREATE OR REPLACE FUNCTION verify_legal_hold_chain(
  p_scope_type text,
  p_scope_id uuid
)
RETURNS TABLE (
  ok boolean,
  broken_at_event_id uuid,
  expected_hash text,
  actual_hash text
) AS $$
DECLARE
  r RECORD;
  expected text;
  canonical text;
  computed text;
BEGIN
  expected := repeat('0', 64);

  FOR r IN
    SELECT * FROM legal_hold_events
    WHERE scope_type = p_scope_type AND scope_id = p_scope_id
    ORDER BY created_at ASC, id ASC
  LOOP
    IF r.prev_instrument_hash != expected THEN
      RETURN QUERY SELECT false, r.id, expected, r.prev_instrument_hash;
      RETURN;
    END IF;

    canonical := concat_ws('|',
      r.scope_type,
      r.scope_id::text,
      r.event_type,
      r.trigger_category,
      COALESCE(r.placed_by::text, ''),
      r.placed_by_capacity,
      COALESCE(r.reason_text, ''),
      COALESCE(r.external_reference, ''),
      COALESCE(r.lift_event_id::text, ''),
      r.created_at::text
    );

    computed := encode(digest(expected || canonical, 'sha256'), 'hex');

    IF r.instrument_hash != computed THEN
      RETURN QUERY SELECT false, r.id, computed, r.instrument_hash;
      RETURN;
    END IF;

    expected := computed;
  END LOOP;

  RETURN QUERY SELECT true, NULL::uuid, NULL::text, NULL::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;  -- pgcrypto (digest) lives in the extensions schema on Supabase

REVOKE EXECUTE ON FUNCTION verify_legal_hold_chain(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION verify_legal_hold_chain(text, uuid) TO service_role;

-- Trigger functions fire as the table owner regardless of EXECUTE grants; revoke their RPC exposure so
-- anon/authenticated can't call them directly via PostgREST (security advisor 0028/0029).
REVOKE EXECUTE ON FUNCTION compute_legal_hold_instrument_hash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION prevent_legal_hold_event_mutation()  FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §45  BUILD_F3: two-tier declined-applicant retention — decision-reason enums (counsel-signed),
--      decision-accountability columns, immutable per-org policy-snapshot tables, hybrid criminal
--      enforcement, decided_* sync trigger, + the legal_hold_events threatened-litigation category.
--      (F3_SPEC_AMENDMENT + COUNSEL_BRIEF_F3_DISPOSITION pass 6 — signed. Decision-reason CHECK bodies
--      are generated from lib/screening/decisionReasons.ts via scripts/codegen/decision-reason-enums.mts.)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[],
  ADD COLUMN IF NOT EXISTS not_shortlisted_reason_code text,
  ADD COLUMN IF NOT EXISTS withdrawn_reason_code text;
ALTER TABLE application_co_applicants
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[];

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_decline_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
    'decline_credit_judgment','decline_credit_default','decline_credit_admin_order','decline_credit_arrears_current','decline_credit_score_low',
    'decline_affordability_income_low','decline_affordability_dti_high','decline_income_unverifiable','decline_employment_tenure_below_threshold','decline_employment_verification_incomplete','decline_employment_denied_by_employer',
    'decline_identity_verification_failed','decline_documentation_incomplete','decline_documentation_invalid','decline_right_to_occupy_unverifiable',
    'decline_reference_landlord_negative','decline_reference_landlord_unverifiable','decline_reference_employer_negative','decline_reference_employer_unverifiable',
    'decline_rental_history_arrears','decline_rental_history_eviction','decline_fitscore_hard_flag','decline_fitscore_ldp_insufficient',
    'decline_criminal_record_relevant','decline_director_disqualified','decline_commercial_composite_below_threshold','decline_property_no_longer_available','decline_agent_discretion_documented'));
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_not_shortlisted_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_not_shortlisted_reason_code_check CHECK (
  not_shortlisted_reason_code IS NULL OR not_shortlisted_reason_code IN (
    'not_shortlisted_other_applicant_selected','not_shortlisted_no_decision_provided','not_shortlisted_property_withdrawn','not_shortlisted_property_changed','not_shortlisted_expired_unactioned'));
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_withdrawn_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_withdrawn_reason_code_check CHECK (
  withdrawn_reason_code IS NULL OR withdrawn_reason_code IN ('withdrawn_applicant_initiated','withdrawn_applicant_unreachable','withdrawn_alternate_property'));

CREATE OR REPLACE FUNCTION is_valid_adverse_factor_code(p_code text)
RETURNS boolean AS $$
BEGIN
  RETURN p_code IN (
    'adverse_judgment_civil','adverse_judgment_default','adverse_admin_order','adverse_sequestration','adverse_arrears_current','adverse_arrears_historical','adverse_score_low_bureau','adverse_inquiry_velocity_high','adverse_utilization_high',
    'adverse_income_below_threshold','adverse_income_unverifiable','adverse_dti_above_threshold','adverse_disposable_income_low','adverse_bank_statement_irregular','adverse_bank_statement_missing',
    'adverse_employment_short_tenure','adverse_employment_unverifiable','adverse_employment_denied','adverse_self_employed_thin_documentation',
    'adverse_id_number_mismatch','adverse_id_document_invalid','adverse_permit_expired','adverse_permit_short_term','adverse_permit_unauthorised_for_residence',
    'adverse_landlord_reference_negative','adverse_landlord_reference_unverifiable','adverse_employer_reference_negative','adverse_employer_reference_unverifiable',
    'adverse_rental_arrears_recorded','adverse_rental_eviction_recorded','adverse_lease_break_pattern',
    'adverse_fitscore_band_adverse','adverse_fitscore_band_limited','adverse_fitscore_hard_flag_critical','adverse_fitscore_hard_flag_trust_network','adverse_fitscore_hard_flag_capping','adverse_fitscore_ldp_insufficient_dimensions','adverse_composite_risk_assessment',
    'adverse_criminal_record_relevant','adverse_documentation_incomplete','adverse_documentation_invalid','adverse_director_disqualified_cipc','adverse_entity_credit_low','adverse_director_individual_fitscore_low');
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;
-- A CHECK cannot contain a subquery, so per-element array validation lives in this wrapper fn.
CREATE OR REPLACE FUNCTION is_valid_adverse_factor_array(p_codes text[])
RETURNS boolean AS $$
BEGIN
  RETURN p_codes IS NULL OR (SELECT bool_and(is_valid_adverse_factor_code(c)) FROM unnest(p_codes) AS c);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;
REVOKE EXECUTE ON FUNCTION is_valid_adverse_factor_code(text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_valid_adverse_factor_array(text[]) FROM PUBLIC, anon, authenticated;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_adverse_factor_codes_check;
ALTER TABLE applications ADD CONSTRAINT applications_adverse_factor_codes_check CHECK (is_valid_adverse_factor_array(adverse_factor_codes));
ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_decline_reason_code_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
    'decline_credit_judgment','decline_credit_default','decline_credit_admin_order','decline_credit_arrears_current','decline_credit_score_low',
    'decline_affordability_income_low','decline_affordability_dti_high','decline_income_unverifiable','decline_employment_tenure_below_threshold','decline_employment_verification_incomplete','decline_employment_denied_by_employer',
    'decline_identity_verification_failed','decline_documentation_incomplete','decline_documentation_invalid','decline_right_to_occupy_unverifiable',
    'decline_reference_landlord_negative','decline_reference_landlord_unverifiable','decline_reference_employer_negative','decline_reference_employer_unverifiable',
    'decline_rental_history_arrears','decline_rental_history_eviction','decline_fitscore_hard_flag','decline_fitscore_ldp_insufficient',
    'decline_criminal_record_relevant','decline_director_disqualified','decline_commercial_composite_below_threshold','decline_property_no_longer_available','decline_agent_discretion_documented'));
ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_adverse_factor_codes_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_adverse_factor_codes_check CHECK (is_valid_adverse_factor_array(adverse_factor_codes));

-- Tier-2 decision-accountability columns (counsel passes 3/4/6)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_stage text,
  ADD COLUMN IF NOT EXISTS deciding_agent_capacity text,
  ADD COLUMN IF NOT EXISTS audit_log_decision_entry_id uuid,
  ADD COLUMN IF NOT EXISTS rent_to_income_ratio_at_decision numeric,
  ADD COLUMN IF NOT EXISTS dti_ratio_at_decision numeric,
  ADD COLUMN IF NOT EXISTS affordability_threshold_at_decision numeric,
  ADD COLUMN IF NOT EXISTS income_verification_status_at_decision text,
  ADD COLUMN IF NOT EXISTS criminal_screening_policy_id uuid,
  ADD COLUMN IF NOT EXISTS criminal_screening_policy_version text,
  ADD COLUMN IF NOT EXISTS screening_policy_id uuid,
  ADD COLUMN IF NOT EXISTS screening_policy_version text,
  ADD COLUMN IF NOT EXISTS decline_reason_text text;
ALTER TABLE application_co_applicants
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_stage text;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_decision_stage_check;
ALTER TABLE applications ADD CONSTRAINT applications_decision_stage_check CHECK (decision_stage IS NULL OR decision_stage IN ('prescreened','reviewed'));
ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_decision_stage_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_decision_stage_check CHECK (decision_stage IS NULL OR decision_stage IN ('prescreened','reviewed'));
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_deciding_agent_capacity_check;
ALTER TABLE applications ADD CONSTRAINT applications_deciding_agent_capacity_check CHECK (deciding_agent_capacity IS NULL OR deciding_agent_capacity IN ('agent_under_mandate','landlord_direct','pleks_platform_admin'));
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_income_verification_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_income_verification_status_check CHECK (income_verification_status_at_decision IS NULL OR income_verification_status_at_decision IN ('verified','partially_verified','unverifiable'));

-- Per-org, versioned, immutable policy-snapshot tables (policy edits create new version rows)
CREATE TABLE IF NOT EXISTS screening_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version text NOT NULL, policy jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (org_id, version));
CREATE TABLE IF NOT EXISTS criminal_screening_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  version text NOT NULL, policy jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (org_id, version));
CREATE INDEX IF NOT EXISTS idx_screening_policies_org ON screening_policies(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_criminal_screening_policies_org ON criminal_screening_policies(org_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_policy_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'policy snapshots are immutable; create a new version row instead (table=%)', TG_TABLE_NAME USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION prevent_policy_snapshot_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_screening_policies_immutable_u ON screening_policies;
CREATE TRIGGER trg_screening_policies_immutable_u BEFORE UPDATE ON screening_policies FOR EACH ROW EXECUTE FUNCTION prevent_policy_snapshot_mutation();
DROP TRIGGER IF EXISTS trg_screening_policies_immutable_d ON screening_policies;
CREATE TRIGGER trg_screening_policies_immutable_d BEFORE DELETE ON screening_policies FOR EACH ROW EXECUTE FUNCTION prevent_policy_snapshot_mutation();
DROP TRIGGER IF EXISTS trg_criminal_screening_policies_immutable_u ON criminal_screening_policies;
CREATE TRIGGER trg_criminal_screening_policies_immutable_u BEFORE UPDATE ON criminal_screening_policies FOR EACH ROW EXECUTE FUNCTION prevent_policy_snapshot_mutation();
DROP TRIGGER IF EXISTS trg_criminal_screening_policies_immutable_d ON criminal_screening_policies;
CREATE TRIGGER trg_criminal_screening_policies_immutable_d BEFORE DELETE ON criminal_screening_policies FOR EACH ROW EXECUTE FUNCTION prevent_policy_snapshot_mutation();

ALTER TABLE screening_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "screening_policies_read_org" ON screening_policies;
CREATE POLICY "screening_policies_read_org" ON screening_policies FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "screening_policies_insert_blocked" ON screening_policies;
CREATE POLICY "screening_policies_insert_blocked" ON screening_policies FOR INSERT WITH CHECK (false);
ALTER TABLE criminal_screening_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "criminal_screening_policies_read_org" ON criminal_screening_policies;
CREATE POLICY "criminal_screening_policies_read_org" ON criminal_screening_policies FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "criminal_screening_policies_insert_blocked" ON criminal_screening_policies;
CREATE POLICY "criminal_screening_policies_insert_blocked" ON criminal_screening_policies FOR INSERT WITH CHECK (false);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_criminal_screening_policy_fk;
ALTER TABLE applications ADD CONSTRAINT applications_criminal_screening_policy_fk FOREIGN KEY (criminal_screening_policy_id) REFERENCES criminal_screening_policies(id) ON DELETE RESTRICT;
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_screening_policy_fk;
ALTER TABLE applications ADD CONSTRAINT applications_screening_policy_fk FOREIGN KEY (screening_policy_id) REFERENCES screening_policies(id) ON DELETE RESTRICT;

-- Hybrid criminal-record enforcement (counsel pass 6): DB-layer backstop alongside app-layer validation
ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_criminal_policy_required_check;
ALTER TABLE applications ADD CONSTRAINT applications_criminal_policy_required_check CHECK (
  (decline_reason_code IS DISTINCT FROM 'decline_criminal_record_relevant'
   AND NOT (COALESCE(adverse_factor_codes, ARRAY[]::text[]) @> ARRAY['adverse_criminal_record_relevant']))
  OR (criminal_screening_policy_id IS NOT NULL AND criminal_screening_policy_version IS NOT NULL));

-- §2.4 sync trigger: mirror prescreened_*/reviewed_* into unified decided_* (review overrides prescreen)
CREATE OR REPLACE FUNCTION sync_decision_columns_on_stage_write()
RETURNS trigger AS $$
BEGIN
  IF NEW.prescreened_at IS DISTINCT FROM OLD.prescreened_at AND NEW.prescreened_at IS NOT NULL THEN
    NEW.decided_at := NEW.prescreened_at; NEW.decided_by := NEW.prescreened_by; NEW.decision_stage := 'prescreened';
  END IF;
  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at AND NEW.reviewed_at IS NOT NULL THEN
    NEW.decided_at := NEW.reviewed_at; NEW.decided_by := NEW.reviewed_by; NEW.decision_stage := 'reviewed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION sync_decision_columns_on_stage_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_applications_sync_decision_columns ON applications;
CREATE TRIGGER trg_applications_sync_decision_columns BEFORE UPDATE OF prescreened_at, reviewed_at ON applications FOR EACH ROW EXECUTE FUNCTION sync_decision_columns_on_stage_write();

UPDATE applications SET decided_at = COALESCE(reviewed_at, prescreened_at), decided_by = COALESCE(reviewed_by, prescreened_by),
  decision_stage = CASE WHEN reviewed_at IS NOT NULL THEN 'reviewed' WHEN prescreened_at IS NOT NULL THEN 'prescreened' ELSE NULL END
WHERE decided_at IS NULL AND (reviewed_at IS NOT NULL OR prescreened_at IS NOT NULL);

-- legal_hold_events: additive trigger_category (counsel pass 1) — threatened_litigation_anticipated
ALTER TABLE legal_hold_events DROP CONSTRAINT IF EXISTS legal_hold_events_trigger_category_check;
ALTER TABLE legal_hold_events ADD CONSTRAINT legal_hold_events_trigger_category_check CHECK (
  trigger_category IN ('customer_dispute','attorney_correspondence','threatened_litigation_anticipated','regulator_inquiry','legal_demand','dsar_contested','tribunal_matter','manual_information_officer','pleks_platform_directive'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §46  Individual property-practitioner FFC — each agent's own PPRA Fidelity Fund
--      Certificate. Separate from organisations.ppra_ffc_number (the agency's):
--      PPRA issues an FFC to the firm AND to each practitioner, so both are surfaced
--      to applicants (agency FFC + the responsible agent's FFC). Domicile is the
--      user-in-org profile (a practising authorisation, NOT a global natural-person
--      attribute — must not leak via the contact/party identity across orgs).
--      Issue/expiry captured because practising on a lapsed FFC is a PPRA offence
--      (voids commission) — lets us flag/block listings under an expired certificate.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ppra_ffc_number text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ppra_ffc_issued_at date;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ppra_ffc_expires_at date;
