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
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
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
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

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
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

-- Soft-delete only (set deleted_at); no hard DELETE from client
CREATE POLICY "org_payment_tokens_delete" ON organisation_payment_tokens
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

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
          SELECT org_id::text FROM user_orgs WHERE user_id = auth.uid()
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
      WHERE uo.user_id = auth.uid()
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
      WHERE uo.user_id = auth.uid()
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
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff see their org's requests
DROP POLICY IF EXISTS "dsr_org_select" ON data_subject_requests;
CREATE POLICY "dsr_org_select" ON data_subject_requests
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Subject creates own request
DROP POLICY IF EXISTS "dsr_subject_insert" ON data_subject_requests;
CREATE POLICY "dsr_subject_insert" ON data_subject_requests
  FOR INSERT WITH CHECK (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff update their org's requests (status, assignment, resolution)
DROP POLICY IF EXISTS "dsr_org_update" ON data_subject_requests;
CREATE POLICY "dsr_org_update" ON data_subject_requests
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
  );

-- Org staff read their org's exports
DROP POLICY IF EXISTS "popia_exports_org_select" ON popia_exports;
CREATE POLICY "popia_exports_org_select" ON popia_exports
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- INSERT via service role only (export generation is server-side)
-- No client INSERT policy.

-- UPDATE only to record download (downloaded_at, download_count)
DROP POLICY IF EXISTS "popia_exports_subject_update_download" ON popia_exports;
CREATE POLICY "popia_exports_subject_update_download" ON popia_exports
  FOR UPDATE USING (
    subject_user_id = auth.uid()
    OR lower(subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
              pe.subject_user_id = auth.uid()
              OR lower(pe.subject_email) = (SELECT lower(email) FROM auth.users WHERE id = auth.uid())
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
            AND pe.org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
  USING (user_id = auth.uid());

-- Org owners and property managers can manage capabilities within their org
DROP POLICY IF EXISTS "owners manage org capabilities" ON user_capabilities;
CREATE POLICY "owners manage org capabilities" ON user_capabilities
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'property_manager')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'property_manager')
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §30  BUILD_AUTH_RESOLVER: onboarding_state + enforce_single_active_membership
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds user_profiles.onboarding_state to persist multi-step wizard progress.
-- enforce_single_active_membership() trigger enforces I-4: one auth.uid() = one
-- active membership across user_orgs (agent), user_orgs_tenants (tenant), and
-- landlords (landlord, portal_access_enabled = true only). Raises SQLSTATE 23514.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb NULL;

COMMENT ON COLUMN user_profiles.onboarding_state IS
  'Persisted wizard state for multi-step onboarding. Null once onboarding is complete.';

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_pending
  ON user_profiles(id)
  WHERE onboarding_state IS NOT NULL;

-- Trigger function: raise if the incoming user already holds any active membership.
-- Called BEFORE INSERT on user_orgs, user_orgs_tenants, and landlords.
-- Mirrors the active-membership definition used by resolveUserMembership() in
-- lib/auth/membership.ts — keep the two in sync if active-row criteria change.
CREATE OR REPLACE FUNCTION enforce_single_active_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _user_id uuid;
  _existing int;
BEGIN
  IF TG_TABLE_NAME = 'user_orgs' THEN
    _user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'user_orgs_tenants' THEN
    _user_id := NEW.user_id;
  ELSIF TG_TABLE_NAME = 'landlords' THEN
    -- Enforce only when the row is portal-active (matches resolveUserMembership filter).
    IF NOT NEW.portal_access_enabled OR NEW.auth_user_id IS NULL THEN
      RETURN NEW;
    END IF;
    _user_id := NEW.auth_user_id;
  ELSE
    RETURN NEW;
  END IF;

  IF _user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO _existing FROM (
    SELECT 1 FROM user_orgs
      WHERE user_id = _user_id AND deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM user_orgs_tenants
      WHERE user_id = _user_id
    UNION ALL
    SELECT 1 FROM landlords
      WHERE auth_user_id = _user_id
        AND deleted_at IS NULL
        AND portal_access_enabled = true
  ) combined;

  IF _existing > 0 THEN
    RAISE EXCEPTION
      'sovereign_membership_violation: user % already holds an active membership',
      _user_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_membership ON user_orgs;
CREATE TRIGGER trg_enforce_single_membership
  BEFORE INSERT ON user_orgs
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_membership();

DROP TRIGGER IF EXISTS trg_enforce_single_membership ON user_orgs_tenants;
CREATE TRIGGER trg_enforce_single_membership
  BEFORE INSERT ON user_orgs_tenants
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_membership();

DROP TRIGGER IF EXISTS trg_enforce_single_membership ON landlords;
CREATE TRIGGER trg_enforce_single_membership
  BEFORE INSERT ON landlords
  FOR EACH ROW EXECUTE FUNCTION enforce_single_active_membership();
