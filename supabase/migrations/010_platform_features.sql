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
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));

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
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));

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
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));


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
  FOR SELECT USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_insert ON bank_feed_connections;
CREATE POLICY bank_feed_conn_insert ON bank_feed_connections
  FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_update ON bank_feed_connections;
CREATE POLICY bank_feed_conn_update ON bank_feed_connections
  FOR UPDATE USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));


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
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));


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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_fingerprints_self_update" ON device_fingerprints;
CREATE POLICY "device_fingerprints_self_update" ON device_fingerprints
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "auth_events_select_org_admin" ON auth_events;
CREATE POLICY "auth_events_select_org_admin" ON auth_events
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
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
  FOR SELECT USING (user_id = auth.uid());

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
  FOR SELECT USING (user_id = auth.uid());

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
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_passkeys_self_update" ON user_passkeys;
CREATE POLICY "user_passkeys_self_update" ON user_passkeys
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

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
  FOR SELECT USING (submitter_id = auth.uid());

-- Insert covers all four user types: agents (user_orgs), tenants, landlords, contractors.
-- The API route uses service-role for inserts and validates org membership server-side,
-- but this policy ensures correctness if the route ever uses an anon client.
DROP POLICY IF EXISTS "feedback_submissions_submitter_insert" ON feedback_submissions;
CREATE POLICY "feedback_submissions_submitter_insert" ON feedback_submissions
  FOR INSERT WITH CHECK (
    submitter_id = auth.uid()
    AND (
      org_id IN (SELECT org_id FROM user_orgs  WHERE user_id      = auth.uid() AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM tenants  WHERE auth_user_id = auth.uid() AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM landlords WHERE auth_user_id = auth.uid() AND deleted_at IS NULL)
      OR org_id IN (SELECT org_id FROM contractors WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "feedback_submissions_submitter_update" ON feedback_submissions;
CREATE POLICY "feedback_submissions_submitter_update" ON feedback_submissions
  FOR UPDATE USING (submitter_id = auth.uid())
  WITH CHECK (submitter_id = auth.uid());

-- feedback_submissions: org admin — role='owner' OR is_admin flag (not role='admin', which doesn't exist)
DROP POLICY IF EXISTS "feedback_submissions_org_admin_select" ON feedback_submissions;
CREATE POLICY "feedback_submissions_org_admin_select" ON feedback_submissions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
        AND (role = 'owner' OR is_admin = true)
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "feedback_submissions_org_admin_update" ON feedback_submissions;
CREATE POLICY "feedback_submissions_org_admin_update" ON feedback_submissions
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
        AND (role = 'owner' OR is_admin = true)
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
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
      WHERE uo.user_id = auth.uid()
        AND o.settings->>'platform_admin' = 'true'
    )
  );

-- feedback_replies: submitter can read replies on their submissions and post non-admin replies
DROP POLICY IF EXISTS "feedback_replies_submitter_select" ON feedback_replies;
CREATE POLICY "feedback_replies_submitter_select" ON feedback_replies
  FOR SELECT USING (
    submission_id IN (
      SELECT id FROM feedback_submissions WHERE submitter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "feedback_replies_submitter_insert" ON feedback_replies;
CREATE POLICY "feedback_replies_submitter_insert" ON feedback_replies
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND is_admin_reply = false
    AND submission_id IN (
      SELECT id FROM feedback_submissions WHERE submitter_id = auth.uid()
    )
  );

-- feedback_replies: platform admin can read and post admin replies on any submission
DROP POLICY IF EXISTS "feedback_replies_platform_admin_select" ON feedback_replies;
CREATE POLICY "feedback_replies_platform_admin_select" ON feedback_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = auth.uid()
        AND o.settings->>'platform_admin' = 'true'
    )
  );

DROP POLICY IF EXISTS "feedback_replies_platform_admin_insert" ON feedback_replies;
CREATE POLICY "feedback_replies_platform_admin_insert" ON feedback_replies
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organisations o
      JOIN user_orgs uo ON uo.org_id = o.id
      WHERE uo.user_id = auth.uid()
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
      WHERE uo.user_id = auth.uid()
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
