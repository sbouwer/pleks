-- 001_foundation.sql
-- Consolidated foundation: organisations, users, subscriptions, audit, consent,
-- invites, waitlist, bank_accounts, custom_lease_requests, auth helpers.
--
-- Sources: 001_core_schema, 002_auth_roles, 003_invites, 026_waitlist,
--          027_waitlist_role_check, 20240101000001_compliance_fields,
--          024_trial_subscriptions, 025_founding_agent, 037_onboarding_flags,
--          035_lease_customisation, 038_auth_helpers, 039_fix_user_orgs_rls,
--          045_pending_landlords (invites.metadata + get_org_member_by_email)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Updated_at trigger function (reused across all tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Organisations
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  trading_as      text,
  reg_number      text,
  vat_number      text,
  type            text NOT NULL DEFAULT 'agency'
                  CHECK (type IN ('agency', 'landlord', 'sole_prop')),
  email           text,
  phone           text,
  address         text,
  logo_url        text,
  -- Onboarding fields (001_core_schema)
  monthly_receivables_cents integer,
  property_type   text CHECK (property_type IN ('residential', 'commercial', 'mixed')),
  has_trust_account boolean,
  trust_account_confirmed_at timestamptz,
  -- Compliance fields (20240101000001_compliance_fields)
  management_scope text
    CHECK (management_scope IN ('own_only', 'own_and_others', 'others_only')),
  property_types  text[] DEFAULT '{}',
  ppra_status     text DEFAULT 'unknown'
    CHECK (ppra_status IN ('registered', 'pending', 'not_registered', 'unknown')),
  ppra_ffc_number text,
  has_deposit_account boolean DEFAULT false,
  deposit_account_type text
    CHECK (deposit_account_type IN ('interest_bearing', 'ppra_trust', 'none')),
  -- Trial / founding agent (024_trial_subscriptions, 025_founding_agent)
  founding_agent              boolean DEFAULT false,
  founding_agent_price_cents  integer,
  founding_agent_since        timestamptz,
  founding_agent_expires_at   timestamptz,
  -- Onboarding flags (037_onboarding_flags)
  onboarding_complete boolean NOT NULL DEFAULT false,
  user_type       text
    CHECK (user_type IN ('owner', 'agent', 'agency', 'family', 'exploring')),
  -- Lease customisation (035_lease_customisation)
  clause_edit_confirmed_at  timestamptz,
  clause_edit_confirmed_by  uuid,  -- FK added after auth.users is available
  clause_edit_confirmed_ip  text,
  custom_template_path      text,
  custom_template_active    boolean NOT NULL DEFAULT false,
  -- Settings
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Subscriptions
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  tier                  text NOT NULL DEFAULT 'owner'
                        CHECK (tier IN ('owner', 'steward', 'growth', 'portfolio', 'firm', 'bespoke')),
  billing_cycle         text NOT NULL DEFAULT 'monthly'
                        CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_cents          integer NOT NULL DEFAULT 0,
  payfast_token         text,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'past_due', 'grace_period', 'cancelled', 'trialing')),
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz,
  grace_period_end      timestamptz,
  cancelled_at          timestamptz,
  -- Trial fields (024_trial_subscriptions)
  trial_tier            text
    CHECK (trial_tier IS NULL OR trial_tier IN ('steward', 'growth', 'portfolio', 'firm', 'bespoke')),
  trial_starts_at       timestamptz,
  trial_ends_at         timestamptz,
  trial_converted       boolean DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: User Profiles
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text,
  phone           text,
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Soft email verification: signup uses admin.createUser({ email_confirm: true }) so auth.users.email_confirmed_at
-- is auto-set and proves nothing. This column tracks REAL ownership — set when the user clicks the verification
-- magic link (/auth/verify-email). NULL = unverified (soft notice; non-blocking).
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;


-- ═══════════════════════════════════════════════════════════════
-- SECTION: User Orgs (many-to-many)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_orgs (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN (
              'owner', 'property_manager', 'agent',
              'accountant', 'maintenance_manager'
            )),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE(user_id, org_id)
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Audit Log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  table_name    text NOT NULL,
  record_id     uuid NOT NULL,
  action        text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
  -- NO updated_at -- append-only
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Consent Log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS consent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,
  user_id         uuid REFERENCES auth.users(id),
  subject_email   text,
  consent_type    text NOT NULL CHECK (consent_type IN (
                    'credit_check', 'data_processing', 'marketing',
                    'trust_account_notice', 'popia_application',
                    'lease_template_disclaimer'
                  )),
  consent_given   boolean NOT NULL,
  consent_version text NOT NULL DEFAULT '1.0',
  ip_address      inet,
  user_agent      text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
  -- NO updated_at -- append-only
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Invites
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN (
                  'owner', 'property_manager', 'agent',
                  'accountant', 'maintenance_manager',
                  'tenant', 'contractor'
                )),
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by    uuid REFERENCES auth.users(id),
  accepted_at   timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
  -- metadata column (045_pending_landlords)
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Waitlist
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text
    CONSTRAINT waitlist_role_check
    CHECK (role IS NULL OR role IN ('agent', 'portfolio_manager', 'landlord', 'other')),
  created_at timestamptz DEFAULT now()
);
-- No RLS needed -- public insert only, admin reads via service role


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Bank Accounts
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  type            text NOT NULL CHECK (type IN ('trust', 'business', 'deposit_holding', 'ppra_trust')),
  bank_name       text NOT NULL,
  account_holder  text NOT NULL,
  account_number  text,
  branch_code     text,
  account_type    text CHECK (account_type IN ('cheque', 'savings', 'transmission')),
  ppra_ref        text,
  is_verified     boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Custom Lease Requests
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS custom_lease_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES organisations(id),
  submitted_by             uuid NOT NULL REFERENCES auth.users(id),
  template_path            text NOT NULL,
  notes                    text,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','invoice_sent','paid','in_progress','complete','rejected')),
  rejection_reason         text,
  admin_notes              text,
  compliance_confirmed_at  timestamptz,
  compliance_confirmed_by  uuid REFERENCES auth.users(id),
  compliance_confirmed_ip  text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Indexes
-- ═══════════════════════════════════════════════════════════════

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_id ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trialing
  ON subscriptions(status, trial_ends_at)
  WHERE status = 'trialing';

-- user_orgs → user_profiles FK (enables PostgREST embedded joins)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'user_orgs'
      AND constraint_name = 'user_orgs_user_id_profile_fkey'
  ) THEN
    ALTER TABLE public.user_orgs
      ADD CONSTRAINT user_orgs_user_id_profile_fkey
      FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- User orgs
CREATE INDEX IF NOT EXISTS idx_user_orgs_user_id ON user_orgs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_orgs_org_id ON user_orgs(org_id);

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- Consent log
CREATE INDEX IF NOT EXISTS idx_consent_log_org_id ON consent_log(org_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_user_id ON consent_log(user_id);

-- Invites
CREATE INDEX IF NOT EXISTS idx_invites_org_id ON invites(org_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

-- Bank accounts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_org_id ON bank_accounts(org_id);


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Row Level Security + Policies
-- ═══════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_lease_requests ENABLE ROW LEVEL SECURITY;

-- Organisations: members can read their org
DROP POLICY IF EXISTS "org_members_select" ON organisations;
CREATE POLICY "org_members_select" ON organisations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Organisations: owners can update their org
DROP POLICY IF EXISTS "org_owners_update" ON organisations;
CREATE POLICY "org_owners_update" ON organisations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND role = 'owner' AND deleted_at IS NULL
    )
  );

-- Organisations: any authenticated user can insert (signup flow)
DROP POLICY IF EXISTS "org_insert" ON organisations;
CREATE POLICY "org_insert" ON organisations
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Subscriptions: org members can read
DROP POLICY IF EXISTS "sub_members_select" ON subscriptions;
CREATE POLICY "sub_members_select" ON subscriptions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );
-- Subscriptions: managed by service role only for writes
-- (PayFast webhook handler uses service role client)

-- User profiles: users can read/update their own profile
DROP POLICY IF EXISTS "profile_own_select" ON user_profiles;
CREATE POLICY "profile_own_select" ON user_profiles
  FOR SELECT USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profile_own_update" ON user_profiles;
CREATE POLICY "profile_own_update" ON user_profiles
  FOR UPDATE USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profile_own_insert" ON user_profiles;
CREATE POLICY "profile_own_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = (SELECT auth.uid()));

-- User profiles: org members can see other members' profiles
DROP POLICY IF EXISTS "profile_org_members_select" ON user_profiles;
CREATE POLICY "profile_org_members_select" ON user_profiles
  FOR SELECT USING (
    id IN (
      SELECT uo2.user_id FROM user_orgs uo1
      JOIN user_orgs uo2 ON uo1.org_id = uo2.org_id
      WHERE uo1.user_id = (SELECT auth.uid())
        AND uo1.deleted_at IS NULL
        AND uo2.deleted_at IS NULL
    )
  );

-- User orgs: users can see their own memberships
DROP POLICY IF EXISTS "user_orgs_own_select" ON user_orgs;
CREATE POLICY "user_orgs_own_select" ON user_orgs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- NOTE: user_orgs_org_select policy intentionally omitted (recursive, dropped in 039)
-- For viewing other org members (team page), use service client
-- or a SECURITY DEFINER function.

-- User orgs: authenticated users can insert (signup/onboarding)
DROP POLICY IF EXISTS "user_orgs_insert" ON user_orgs;
CREATE POLICY "user_orgs_insert" ON user_orgs
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Audit log: insert only (via service role for most, but org members can insert)
DROP POLICY IF EXISTS "audit_insert_only" ON audit_log;
CREATE POLICY "audit_insert_only" ON audit_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Audit log: org members can read their org's audit trail
DROP POLICY IF EXISTS "audit_org_select" ON audit_log;
CREATE POLICY "audit_org_select" ON audit_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Consent log: insert by anyone authenticated
DROP POLICY IF EXISTS "consent_insert" ON consent_log;
CREATE POLICY "consent_insert" ON consent_log
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- Consent log: org members can read their org's consent records
DROP POLICY IF EXISTS "consent_org_select" ON consent_log;
CREATE POLICY "consent_org_select" ON consent_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
    OR user_id = (SELECT auth.uid())
  );

-- Invites: org owners/PMs can read
DROP POLICY IF EXISTS "org_invites_select" ON invites;
CREATE POLICY "org_invites_select" ON invites
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

-- Invites: org owners/PMs can insert
DROP POLICY IF EXISTS "org_invites_insert" ON invites;
CREATE POLICY "org_invites_insert" ON invites
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

-- Invites: org owners/PMs can update
DROP POLICY IF EXISTS "org_invites_update" ON invites;
CREATE POLICY "org_invites_update" ON invites
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid())
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

-- Bank accounts: org members can read
DROP POLICY IF EXISTS "bank_accounts_org_select" ON bank_accounts;
CREATE POLICY "bank_accounts_org_select" ON bank_accounts
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- Bank accounts: org owners/PMs can insert
DROP POLICY IF EXISTS "bank_accounts_org_insert" ON bank_accounts;
CREATE POLICY "bank_accounts_org_insert" ON bank_accounts
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'property_manager') AND deleted_at IS NULL
    )
  );

-- Bank accounts: org owners/PMs can update
DROP POLICY IF EXISTS "bank_accounts_org_update" ON bank_accounts;
CREATE POLICY "bank_accounts_org_update" ON bank_accounts
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'property_manager') AND deleted_at IS NULL
    )
  );

-- Custom lease requests: org members full access
DROP POLICY IF EXISTS "org_custom_lease_requests" ON custom_lease_requests;
CREATE POLICY "org_custom_lease_requests" ON custom_lease_requests
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Triggers
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_organisations_updated_at ON organisations;
CREATE TRIGGER update_organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bank_accounts_updated_at ON bank_accounts;
CREATE TRIGGER update_bank_accounts_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ═══════════════════════════════════════════════════════════════
-- SECTION: Functions
-- ═══════════════════════════════════════════════════════════════

-- Helper: get current user's org_id
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM user_orgs
  WHERE user_id = auth.uid()
  AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get current user's tier
CREATE OR REPLACE FUNCTION get_current_tier()
RETURNS text AS $$
  SELECT s.tier FROM subscriptions s
  JOIN user_orgs uo ON uo.org_id = s.org_id
  WHERE uo.user_id = auth.uid()
  AND uo.deleted_at IS NULL
  AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: does current org have confirmed trust account?
CREATE OR REPLACE FUNCTION org_has_trust_account()
RETURNS boolean AS $$
  SELECT COALESCE(has_trust_account, false)
  FROM organisations
  WHERE id = get_current_org_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if email exists in auth.users (038_auth_helpers)
CREATE OR REPLACE FUNCTION check_email_exists(p_email text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(p_email)
  );
$$ LANGUAGE sql SECURITY DEFINER
   SET search_path = auth, public;

-- Helper: get org member by email (045_pending_landlords)
CREATE OR REPLACE FUNCTION get_org_member_by_email(
  p_org_id uuid,
  p_email  text
) RETURNS uuid AS $$
  SELECT uo.user_id
  FROM user_orgs uo
  JOIN auth.users u ON u.id = uo.user_id
  WHERE uo.org_id = p_org_id
    AND lower(u.email) = lower(p_email)
    AND uo.deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- §N  BUILD_66 (contact page): contact_leads — public /contact form submissions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS contact_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL,
  phone           text,
  intent          text NOT NULL DEFAULT 'general'
    CHECK (intent IN ('founding', 'support', 'general')),
  message         text,
  user_agent      text,
  referrer        text,
  utm_source      text,
  utm_campaign    text,
  status          text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'demoed', 'closed_won', 'closed_lost', 'spam')),
  contacted_at    timestamptz,
  closed_at       timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_contact_leads_updated_at ON contact_leads;
CREATE TRIGGER update_contact_leads_updated_at
  BEFORE UPDATE ON contact_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_contact_leads_created_at ON contact_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status     ON contact_leads(status);
CREATE INDEX IF NOT EXISTS idx_contact_leads_intent     ON contact_leads(intent);

ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE contact_leads IS
  'Inbound leads from the public /contact page. No RLS policies — service-role only, '
  'written by the submitContactForm server action and read by admin-only UI.';

-- ═══════════════════════════════════════════════════════════════
-- §18  ADDENDUM_00I: audit_log filter indexes + async export job table
-- ═══════════════════════════════════════════════════════════════

-- Additional audit_log indexes for the admin filter rail
-- Existing: (org_id), (record_id), (created_at)
-- New: support common filter combinations in the audit viewer
CREATE INDEX IF NOT EXISTS idx_audit_log_table_created
  ON audit_log(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by_created
  ON audit_log(changed_by, created_at DESC) WHERE changed_by IS NOT NULL;

-- Async audit-log CSV export job table
-- Operator queues an export; cron processes it; signed URL emailed on completion.
CREATE TABLE IF NOT EXISTS audit_exports (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by         text NOT NULL,
  filter_params        jsonb NOT NULL DEFAULT '{}',
  status               text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  row_count            integer,
  file_path            text,
  signed_url           text,
  error_message        text,
  notification_sent_at timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_audit_exports_status_created
  ON audit_exports(status, created_at) WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_audit_exports_expires
  ON audit_exports(expires_at) WHERE status = 'completed';

-- No RLS — admin-only via service-role queries

-- ═══════════════════════════════════════════════════════════════════════════════
-- §19  Admin audit viewer: distinct table names + composite cursor index
-- ═══════════════════════════════════════════════════════════════════════════════

-- Distinct table names for the filter dropdown — SELECT DISTINCT avoids the
-- PostgREST row-limit truncation that a plain .select().order().limit() causes
-- when one audited table accumulates many rows before others alphabetically.
CREATE OR REPLACE FUNCTION get_distinct_audit_tables()
RETURNS TABLE (table_name text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT table_name FROM audit_log ORDER BY table_name;
$$;

-- Composite index for (created_at DESC, id DESC) cursor pagination.
-- Prevents skipping rows at page boundaries when entries share a microsecond timestamp.
CREATE INDEX IF NOT EXISTS idx_audit_log_created_id
  ON audit_log(created_at DESC, id DESC);

-- contractor_contacts: REMOVED 2026-06-03 (ADDENDUM_25A) — superseded by the universal company-people
-- model (contacts.organisation_contact_id; a supplier person is a first-class contact). Dropped in prod
-- (0 rows). Its RLS policy was also removed from 009_security.sql §… (must go together — a CREATE POLICY
-- on a dropped table breaks a fresh replay). Do NOT re-add.

-- ═══════════════════════════════════════════════════════════════════════════════
-- §1  Expand audit_log action CHECK to cover all application action types
-- ═══════════════════════════════════════════════════════════════════════════════
-- Original constraint only allowed INSERT/UPDATE/DELETE. NOTE (memos),
-- SYNC (bank reconciliation), OWNERSHIP_TRANSFERRED, CONFLICT_ACKNOWLEDGED
-- are all valid audit actions used in production code.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'INSERT', 'UPDATE', 'DELETE',
    'NOTE', 'SYNC', 'OWNERSHIP_TRANSFERRED', 'CONFLICT_ACKNOWLEDGED'
  ]));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §2  audit_log.changed_by — relax FK to ON DELETE SET NULL
-- ═══════════════════════════════════════════════════════════════════════════════
-- The default strict FK blocks user deletion when audit_log rows reference them.
-- Audit semantics survive deletion because actor_name is denormalised (ADDENDUM_45A).
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_changed_by_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §3  BUILD_64: Pleks-is-not-trustee invariant (schema-level)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Documents and structurally enforces D-TRUST-01. bank_accounts.type CHECK
-- enum already excludes a 'pleks_trust' type; this comment is the explicit
-- doctrine capture. Future type additions must preserve the invariant.

COMMENT ON COLUMN bank_accounts.type IS
  'Agency-owned bank account type. No pleks-controlled type exists or may be '
  'added — Pleks is not the trustee. See brief/legal/TRUST_ACCOUNT_POSITIONING.md.';

COMMENT ON TABLE bank_accounts IS
  'Bank accounts owned and controlled by the agency (org_id). Pleks reads from '
  'these via BUILD_50 substrate; Pleks never initiates payments from them. '
  'No row in this table is Pleks-controlled. See brief/legal/TRUST_ACCOUNT_POSITIONING.md.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §4  ADDENDUM_14F: consent_log — extend for 2-step SMS verification
-- ═══════════════════════════════════════════════════════════════════════════════
-- Extends consent_log with verification metadata for the 14F two-channel consent
-- ceremony. verification_method='none' for all pre-14F rows (backwards-compatible).
-- New consent_type values: 'criminal_record_check' for s27(1)(a) Estate bundle.
-- See ADDENDUM_14F_CONSENT_VERIFICATION.md §Audit Trail Layer 1.

-- Extend consent_type CHECK to add criminal_record_check (s27(1)(a) basis)
ALTER TABLE consent_log DROP CONSTRAINT IF EXISTS consent_log_consent_type_check;
ALTER TABLE consent_log ADD CONSTRAINT consent_log_consent_type_check
  CHECK (consent_type IN (
    'credit_check', 'data_processing', 'marketing',
    'trust_account_notice', 'popia_application',
    'lease_template_disclaimer',
    'criminal_record_check'
  ));

-- Verification metadata columns (all nullable for backwards compat)
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS verification_method         text
  CHECK (verification_method IN ('sms_code', 'email_link', 'none'));
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS verification_target_masked  text;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS code_sent_at               timestamptz;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS code_verified_at           timestamptz;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS code_attempts              integer DEFAULT 0;
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS verification_status        text
  CHECK (verification_status IN (
    'not_required', 'pending', 'verified', 'expired', 'abandoned', 'failed_lockout'
  ));
ALTER TABLE consent_log ADD COLUMN IF NOT EXISTS verification_id            uuid;
-- Soft FK to consent_verifications.id — no hard constraint (verifications can be purged)

-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_65: POPIA INVARIANT DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════
-- Documentary comments on consent_log and related tables to capture the
-- POPIA posture established by BUILD_65. No new tables.
--
-- Invariant (D-POPIA-01): Pleks is Operator for agency-operated data;
-- Responsible Party for platform account data.

COMMENT ON TABLE consent_log IS
  'POPIA consent audit trail. Append-only. See BUILD_65 §4 and
   brief/legal/PROCESSING_PURPOSES.md for processing-purpose taxonomy.
   consent_version is a soft text reference to privacy_policy_versions.version
   (no hard FK). Retention: indefinite (POPIA accountability).';

COMMENT ON COLUMN consent_log.consent_version IS
  'Version of the privacy policy in effect at the time of consent.
   Matches privacy_policy_versions.version via text equality.
   Historical versions remain queryable at /privacy/versions/[version].';

COMMENT ON COLUMN consent_log.consent_type IS
  'Consent category. See brief/legal/PROCESSING_PURPOSES.md for the
   full enumeration and mapping to POPIA s11 lawful bases.
   Current enum: credit_check, data_processing, marketing,
   trust_account_notice, popia_application, lease_template_disclaimer,
   criminal_record_check.
   Note: whenever the consent_type CHECK constraint is extended, update this comment in the same migration.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §5  BUILD_AUTH_RESOLVER: check_email_exists — include honeytoken addresses
-- ═══════════════════════════════════════════════════════════════════════════════
-- Honeytoken emails (seeded in 006_seed.sql) always return true regardless of
-- auth.users state. Bots scraping for valid emails will collect these — their
-- presence in downstream attacks is evidence of enumeration intent.
-- See ADDENDUM_AUTH_RESOLVER_AMENDMENTS_2026-05-27 §3.6 (D-AUTH-RESOLVER-28).

CREATE OR REPLACE FUNCTION check_email_exists(p_email text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(p_email)
    UNION ALL
    SELECT 1 FROM public.honeytoken_emails
    WHERE lower(email) = lower(p_email)
  );
$$ LANGUAGE sql SECURITY DEFINER
   SET search_path = auth, public;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §6  ADDENDUM_LEASE_CREATION_MODAL (Phase 3): organisations.default_lease_document_source
-- ═══════════════════════════════════════════════════════════════════════════════
-- Org-level default for the lease step-4 fork (Axis A): 'pleks' = Generate with Pleks,
-- 'external' = Upload signed leases. NULL = undecided → the lease CreateStep just shows
-- the fork (D-7). Captured optionally at onboarding; editable later from Settings. Nullable,
-- no backfill. CreateStep reads it via useOrg() (organisations(*)) and maps 'external'→'uploaded'.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS default_lease_document_source text
  CHECK (default_lease_document_source IN ('pleks', 'external'));

COMMENT ON COLUMN organisations.default_lease_document_source IS
  'ADDENDUM_LEASE_CREATION_MODAL Phase 3 / D-7: org default for the lease document-source fork. '
  '''pleks'' = Generate with Pleks, ''external'' = Upload signed leases, NULL = undecided (show fork).';
