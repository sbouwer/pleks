-- 001_core_schema.sql
-- Foundation tables: organisations, users, subscriptions, audit_log, consent_log

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

-- =============================================================
-- Organisations (top-level tenant — org_id on everything)
-- =============================================================
CREATE TABLE organisations (
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
  -- Onboarding fields
  monthly_receivables_cents integer,
  property_type   text CHECK (property_type IN ('residential', 'commercial', 'mixed')),
  has_trust_account boolean,
  trust_account_confirmed_at timestamptz,
  -- Settings
  settings        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE TRIGGER update_organisations_updated_at
  BEFORE UPDATE ON organisations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- Subscriptions
-- =============================================================
CREATE TABLE subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  tier                  text NOT NULL DEFAULT 'owner'
                        CHECK (tier IN ('owner', 'steward', 'portfolio', 'firm')),
  billing_cycle         text NOT NULL DEFAULT 'monthly'
                        CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_cents          integer NOT NULL DEFAULT 0,
  payfast_token         text,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'past_due', 'grace_period', 'cancelled')),
  current_period_start  timestamptz NOT NULL DEFAULT now(),
  current_period_end    timestamptz,
  grace_period_end      timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- User profiles (extends auth.users)
-- =============================================================
CREATE TABLE user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text,
  phone           text,
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- User <-> Org <-> Role (many-to-many)
-- =============================================================
CREATE TABLE user_orgs (
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

-- =============================================================
-- Audit log (immutable — no UPDATE/DELETE ever)
-- =============================================================
CREATE TABLE audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  table_name    text NOT NULL,
  record_id     uuid NOT NULL,
  action        text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by    uuid REFERENCES auth.users(id),
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
  -- NO updated_at — append-only
);

-- =============================================================
-- Consent log (immutable — POPIA compliance)
-- =============================================================
CREATE TABLE consent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,
  user_id         uuid REFERENCES auth.users(id),
  subject_email   text,
  consent_type    text NOT NULL CHECK (consent_type IN (
                    'credit_check', 'data_processing', 'marketing',
                    'trust_account_notice', 'popia_application'
                  )),
  consent_given   boolean NOT NULL,
  consent_version text NOT NULL DEFAULT '1.0',
  ip_address      inet,
  user_agent      text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
  -- NO updated_at — append-only
);

-- =============================================================
-- RLS Policies
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;

-- Organisations: members can read their org
CREATE POLICY "org_members_select" ON organisations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Organisations: owners can update their org
CREATE POLICY "org_owners_update" ON organisations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND role = 'owner' AND deleted_at IS NULL
    )
  );

-- Organisations: any authenticated user can insert (signup flow)
CREATE POLICY "org_insert" ON organisations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Subscriptions: org members can read
CREATE POLICY "sub_members_select" ON subscriptions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Subscriptions: managed by service role only for writes
-- (PayFast webhook handler uses service role client)

-- User profiles: users can read/update their own profile
CREATE POLICY "profile_own_select" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profile_own_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profile_own_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- User profiles: org members can see other members' profiles
CREATE POLICY "profile_org_members_select" ON user_profiles
  FOR SELECT USING (
    id IN (
      SELECT uo2.user_id FROM user_orgs uo1
      JOIN user_orgs uo2 ON uo1.org_id = uo2.org_id
      WHERE uo1.user_id = auth.uid()
        AND uo1.deleted_at IS NULL
        AND uo2.deleted_at IS NULL
    )
  );

-- User orgs: users can see their own memberships
CREATE POLICY "user_orgs_own_select" ON user_orgs
  FOR SELECT USING (user_id = auth.uid());

-- User orgs: org members can see other members
CREATE POLICY "user_orgs_org_select" ON user_orgs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- User orgs: authenticated users can insert (signup/onboarding)
CREATE POLICY "user_orgs_insert" ON user_orgs
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Audit log: insert only (via service role for most, but org members can insert)
CREATE POLICY "audit_insert_only" ON audit_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
-- Audit log: org members can read their org's audit trail
CREATE POLICY "audit_org_select" ON audit_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Consent log: insert by anyone authenticated
CREATE POLICY "consent_insert" ON consent_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Consent log: org members can read their org's consent records
CREATE POLICY "consent_org_select" ON consent_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    OR user_id = auth.uid()
  );

-- =============================================================
-- Indexes
-- =============================================================
CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_user_orgs_user_id ON user_orgs(user_id);
CREATE INDEX idx_user_orgs_org_id ON user_orgs(org_id);
CREATE INDEX idx_audit_log_org_id ON audit_log(org_id);
CREATE INDEX idx_audit_log_record_id ON audit_log(record_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_consent_log_org_id ON consent_log(org_id);
CREATE INDEX idx_consent_log_user_id ON consent_log(user_id);
