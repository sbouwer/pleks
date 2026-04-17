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
--   • Owner Pro per-lease premium billing (BUILD_57F)
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
-- §10  OWNER PRO PER-LEASE PREMIUM BILLING  (BUILD_57F)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 10a. Widen subscriptions status constraint to include 'frozen'
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'active', 'trialing', 'past_due', 'grace_period',
    'frozen', 'cancelled'
  ));

-- 10b. Owner Pro columns on subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS owner_pro_lease_count  int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mandate_id             text,
  ADD COLUMN IF NOT EXISTS mandate_status         text
    CHECK (mandate_status IN ('pending_auth', 'active', 'cancelled', 'failed')),
  ADD COLUMN IF NOT EXISTS mandate_authenticated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_attempt_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_success_at   timestamptz,
  ADD COLUMN IF NOT EXISTS failed_attempts           int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_since              timestamptz;

COMMENT ON COLUMN subscriptions.owner_pro_lease_count IS
  'Number of leases with premium_enabled = true for Owner tier orgs. '
  'Billed amount = owner_pro_lease_count * 9900 cents.';

-- 10c. Premium columns on leases
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS premium_enabled      boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_enabled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS premium_enabled_by   uuid         REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS premium_disabled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS premium_price_cents  int          NOT NULL DEFAULT 9900;

CREATE INDEX IF NOT EXISTS idx_leases_premium
  ON leases(org_id, premium_enabled)
  WHERE premium_enabled = true;

-- 10d. subscription_charges — billing history
CREATE TABLE IF NOT EXISTS subscription_charges (
  id                    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid  NOT NULL REFERENCES organisations(id),
  subscription_id       uuid  NOT NULL REFERENCES subscriptions(id),
  billing_period_start  date  NOT NULL,
  billing_period_end    date  NOT NULL,
  tier                  text  NOT NULL,
  amount_cents          int   NOT NULL,
  -- Owner Pro: which leases were on premium this period
  premium_lease_ids     uuid[],
  status                text  NOT NULL
    CHECK (status IN ('pending', 'charged', 'failed', 'refunded', 'partial_refund')),
  transaction_id        text,
  invoice_number        text  NOT NULL,
  charged_at            timestamptz,
  failed_reason         text,
  refunded_cents        int   NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_charges_org          ON subscription_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_sub_charges_subscription ON subscription_charges(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_charges_status       ON subscription_charges(status);

ALTER TABLE subscription_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins view own billing" ON subscription_charges;
CREATE POLICY "Org admins view own billing" ON subscription_charges
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §11  LEASE NOTES & COMMERCIAL CPA FIX  (was 014_lease_notes.sql)
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
-- §12  CRON JOB HEALTH TRACKING  (BUILD_60)
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
