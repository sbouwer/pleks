-- 007_enhancements.sql
-- Consolidates migrations 007–021: all schema enhancements, new tables,
-- storage buckets, seed data, and RLS policies added after the foundation (001–006).
-- Fully idempotent — safe to re-run on any DB state.
--
-- Order: schema patches → new tables → storage → seed data → RLS policies



-- ═══════════════════════════════════════════════════════════════════════
-- SCHEMA PATCHES (ALTER TABLE on existing tables)
-- ═══════════════════════════════════════════════════════════════════════

-- ── units ─────────────────────────────────────────────────────────────
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS deposit_amount_cents          integer,
  ADD COLUMN IF NOT EXISTS managed_by                    uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_agent_id             uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS prospective_tenant_id         uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prospective_co_tenant_ids     uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_units_managed_by      ON units(managed_by);
CREATE INDEX IF NOT EXISTS idx_units_assigned_agent  ON units(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

COMMENT ON COLUMN units.assigned_agent_id IS
  'Letting agent for this unit. NULL = inherits from properties.managing_agent_id. '
  'Used for routing notifications, maintenance, arrears, inspections.';

-- ── organisations ──────────────────────────────────────────────────────
ALTER TABLE organisations
  -- Identity
  ADD COLUMN IF NOT EXISTS eaab_number             text,
  ADD COLUMN IF NOT EXISTS website                 text,
  ADD COLUMN IF NOT EXISTS vat_number              text,
  -- Branding
  ADD COLUMN IF NOT EXISTS brand_logo_path         text,
  ADD COLUMN IF NOT EXISTS brand_accent_color      text DEFAULT '#1a3a5c',
  ADD COLUMN IF NOT EXISTS brand_cover_template    text DEFAULT 'classic'
    CHECK (brand_cover_template IN ('classic', 'modern', 'bold', 'minimal')),
  ADD COLUMN IF NOT EXISTS brand_font              text DEFAULT 'inter'
    CHECK (brand_font IN ('inter', 'merriweather', 'lato', 'playfair')),
  -- Personal details (for individual landlord / owner org type)
  ADD COLUMN IF NOT EXISTS title                   text,
  ADD COLUMN IF NOT EXISTS first_name              text,
  ADD COLUMN IF NOT EXISTS last_name               text,
  ADD COLUMN IF NOT EXISTS initials                text,
  ADD COLUMN IF NOT EXISTS gender                  text CHECK (gender IN ('male', 'female', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth           date,
  ADD COLUMN IF NOT EXISTS id_number               text,
  ADD COLUMN IF NOT EXISTS mobile                  text,
  ADD COLUMN IF NOT EXISTS addr_line1              text,
  ADD COLUMN IF NOT EXISTS addr_suburb             text,
  ADD COLUMN IF NOT EXISTS addr_city               text,
  ADD COLUMN IF NOT EXISTS addr_province           text CHECK (addr_province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  )),
  ADD COLUMN IF NOT EXISTS addr_postal_code        text,
  ADD COLUMN IF NOT EXISTS addr_type               text DEFAULT 'residential'
    CHECK (addr_type IN ('residential', 'postal', 'work', 'business', 'other')),
  -- Second address block
  ADD COLUMN IF NOT EXISTS addr2_type              text
    CHECK (addr2_type IN ('residential', 'postal', 'work', 'business', 'other')),
  ADD COLUMN IF NOT EXISTS addr2_line1             text,
  ADD COLUMN IF NOT EXISTS addr2_suburb            text,
  ADD COLUMN IF NOT EXISTS addr2_city              text,
  ADD COLUMN IF NOT EXISTS addr2_province          text CHECK (addr2_province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  )),
  ADD COLUMN IF NOT EXISTS addr2_postal_code       text,
  -- Misc
  ADD COLUMN IF NOT EXISTS primary_contact_is_user boolean DEFAULT true;

-- ── user_orgs ──────────────────────────────────────────────────────────
ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';

-- ── properties ────────────────────────────────────────────────────────
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_sectional_title   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS managing_scheme_id   uuid REFERENCES contractors(id),
  ADD COLUMN IF NOT EXISTS levy_amount_cents     integer,
  ADD COLUMN IF NOT EXISTS levy_account_number  text,
  ADD COLUMN IF NOT EXISTS ai_reformat_count    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reformat_bonus    int DEFAULT 0;

-- ── contacts ──────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_id_type        text,
  ADD COLUMN IF NOT EXISTS contact_id_number      text,
  ADD COLUMN IF NOT EXISTS contact_id_number_hash text,
  ADD COLUMN IF NOT EXISTS contact_date_of_birth  date,
  ADD COLUMN IF NOT EXISTS contact_phone          text,
  ADD COLUMN IF NOT EXISTS contact_email          text;

-- ── contractors ───────────────────────────────────────────────────────
ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS portal_status          text DEFAULT 'none'
    CHECK (portal_status IN ('none', 'invited', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS scheme_rules_path       text,
  ADD COLUMN IF NOT EXISTS scheme_rules_uploaded_at timestamptz;

-- Backfill portal_status from existing columns
UPDATE contractors
  SET portal_status =
    CASE
      WHEN portal_access_enabled = true AND auth_user_id IS NOT NULL THEN 'active'
      WHEN portal_access_enabled = true AND auth_user_id IS NULL     THEN 'invited'
      ELSE 'none'
    END
  WHERE portal_status = 'none';

-- ── maintenance_requests ──────────────────────────────────────────────
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS work_order_token         text UNIQUE,
  ADD COLUMN IF NOT EXISTS landlord_approval_token  text UNIQUE,
  ADD COLUMN IF NOT EXISTS contact_name             text,
  ADD COLUMN IF NOT EXISTS contact_phone            text,
  ADD COLUMN IF NOT EXISTS contact_preference       text;

CREATE INDEX IF NOT EXISTS idx_maintenance_wo_token       ON maintenance_requests(work_order_token)        WHERE work_order_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_approval_token ON maintenance_requests(landlord_approval_token) WHERE landlord_approval_token IS NOT NULL;

COMMENT ON COLUMN maintenance_requests.contact_name  IS 'Name of the person who will provide access for the maintenance visit.';
COMMENT ON COLUMN maintenance_requests.contact_phone IS 'Phone number of the access contact.';

-- ── landlords (portal access) ─────────────────────────────────────────
ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS auth_user_id          uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_status         text DEFAULT 'none'
    CHECK (portal_status IN ('none', 'invited', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS portal_invited_at     timestamptz,
  ADD COLUMN IF NOT EXISTS portal_last_login_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_landlords_auth_user_id ON landlords(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ── lease_clause_library ──────────────────────────────────────────────
ALTER TABLE lease_clause_library
  ADD COLUMN IF NOT EXISTS condition text;

-- ── communication_log ─────────────────────────────────────────────────
ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS template_key   text,
  ADD COLUMN IF NOT EXISTS recipient_name text;

CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(external_id) WHERE external_id IS NOT NULL;

-- ── consent_log: expand consent_type CHECK ────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'consent_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%consent_type%'
  LOOP
    EXECUTE format('ALTER TABLE consent_log DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE consent_log ADD CONSTRAINT consent_log_consent_type_check
  CHECK (consent_type IN (
    'credit_check', 'data_processing', 'marketing',
    'trust_account_notice', 'popia_application',
    'lease_template_disclaimer'
  ));

-- ── leases.payment_due_day: drop integer CHECK, change to text ────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leases'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_due_day%'
  LOOP
    EXECUTE format('ALTER TABLE leases DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE leases
  ALTER COLUMN payment_due_day TYPE text USING payment_due_day::text;

ALTER TABLE leases
  ALTER COLUMN payment_due_day SET DEFAULT '1';

COMMENT ON COLUMN leases.payment_due_day IS
  'Day rent is due. Numeric string ("1"–"28") for a fixed day, "last_day" for last calendar day, "last_working_day" for last business day.';


-- ═══════════════════════════════════════════════════════════════════════
-- NEW TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ── lease_co_tenants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_co_tenants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid        NOT NULL REFERENCES organisations(id),
  lease_id     uuid        NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  is_signatory boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lease_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_lease_co_tenants_lease  ON lease_co_tenants(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_co_tenants_tenant ON lease_co_tenants(tenant_id);

COMMENT ON TABLE lease_co_tenants IS
  'Co-tenants (co-lessees) on a lease. Primary tenant is leases.tenant_id. Co-tenants are jointly and severally liable.';

-- ── unit_clause_defaults ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_clause_defaults (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES organisations(id),
  unit_id     uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  clause_key  text        NOT NULL REFERENCES lease_clause_library(clause_key),
  enabled     boolean     NOT NULL,
  auto_set    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id, clause_key)
);

CREATE INDEX IF NOT EXISTS idx_unit_clause_defaults_unit ON unit_clause_defaults(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_clause_defaults_org  ON unit_clause_defaults(org_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_unit_clause_defaults_updated_at') THEN
    CREATE TRIGGER update_unit_clause_defaults_updated_at
      BEFORE UPDATE ON unit_clause_defaults
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE unit_clause_defaults IS
  'Per-unit optional clause overrides. Stores only toggles that differ from org_lease_clause_defaults. '
  'auto_set=true means this was set by feature-to-clause auto-mapping.';

-- ── rule_templates ────────────────────────────────────────────────────
-- Drop old flat property_rules schema if it exists (detected by presence of version column)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_rules' AND column_name = 'version'
  ) THEN
    ALTER TABLE leases DROP COLUMN IF EXISTS property_rules_id;
    ALTER TABLE leases DROP COLUMN IF EXISTS property_rules_version;
    DROP TABLE IF EXISTS property_rules CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rule_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key       text        UNIQUE NOT NULL,
  title          text        NOT NULL,
  body_template  text        NOT NULL,
  category       text        NOT NULL,
  feature_key    text,
  default_params jsonb       DEFAULT '{}',
  sort_order     int         DEFAULT 100,
  created_at     timestamptz DEFAULT now()
);

-- ── property_rules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS property_rules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id           uuid        NOT NULL REFERENCES organisations(id),
  rule_template_id uuid        REFERENCES rule_templates(id),
  title            text        NOT NULL,
  body_text        text        NOT NULL,
  params           jsonb       DEFAULT '{}',
  is_custom        boolean     DEFAULT false,
  sort_order       int         DEFAULT 100,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_rules_property ON property_rules(property_id);
CREATE INDEX IF NOT EXISTS idx_property_rules_org      ON property_rules(org_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_property_rules_updated_at') THEN
    CREATE TRIGGER update_property_rules_updated_at
      BEFORE UPDATE ON property_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── ai_credit_purchases ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_credit_purchases (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid        NOT NULL REFERENCES organisations(id),
  property_id       uuid        NOT NULL REFERENCES properties(id),
  user_id           uuid        NOT NULL,
  credits           int         NOT NULL DEFAULT 5,
  amount_cents      int         NOT NULL DEFAULT 5000,
  payment_reference text,
  status            text        DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed')),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_purchases_property ON ai_credit_purchases(property_id);
CREATE INDEX IF NOT EXISTS idx_ai_purchases_org      ON ai_credit_purchases(org_id);

-- ── communication_preferences ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE comm_channel AS ENUM ('email', 'sms', 'whatsapp_future');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status AS ENUM ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS communication_preferences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES organisations(id),
  contact_id            uuid        REFERENCES contacts(id),
  email                 text,
  unsubscribe_token     text        DEFAULT encode(gen_random_bytes(24), 'hex'),
  email_applications    boolean     NOT NULL DEFAULT true,
  email_maintenance     boolean     NOT NULL DEFAULT true,
  email_arrears         boolean     NOT NULL DEFAULT true,
  email_inspections     boolean     NOT NULL DEFAULT true,
  email_lease           boolean     NOT NULL DEFAULT true,
  email_statements      boolean     NOT NULL DEFAULT true,
  sms_maintenance       boolean     NOT NULL DEFAULT true,
  sms_arrears           boolean     NOT NULL DEFAULT true,
  sms_inspections       boolean     NOT NULL DEFAULT true,
  unsubscribed_at       timestamptz,
  email_hard_bounced    boolean     NOT NULL DEFAULT false,
  email_hard_bounced_at timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Patch in case the table existed but was partially created
ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS contact_id            uuid REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS email                 text,
  ADD COLUMN IF NOT EXISTS unsubscribe_token     text DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS email_applications    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_maintenance     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_arrears         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_inspections     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_lease           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_statements      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_maintenance       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_arrears           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_inspections       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS email_hard_bounced    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_hard_bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz NOT NULL DEFAULT now();

-- Deduplicate before adding UNIQUE constraints
DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid AND a.unsubscribe_token IS NOT NULL AND a.unsubscribe_token = b.unsubscribe_token;

DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid AND a.org_id = b.org_id AND a.contact_id IS NOT NULL AND a.contact_id = b.contact_id;

DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid AND a.org_id = b.org_id AND a.email IS NOT NULL AND a.email = b.email;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_token_unique' AND conrelid = 'communication_preferences'::regclass) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_token_unique UNIQUE (unsubscribe_token);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_org_contact' AND conrelid = 'communication_preferences'::regclass) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_contact UNIQUE (org_id, contact_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_org_email' AND conrelid = 'communication_preferences'::regclass) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_email UNIQUE (org_id, email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_contact ON communication_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email   ON communication_preferences(email);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_token   ON communication_preferences(unsubscribe_token);

COMMENT ON TABLE communication_log         IS 'Immutable log of every outbound email/SMS. Status updated via provider webhooks.';
COMMENT ON TABLE communication_preferences IS 'Per-recipient communication opt-out preferences. Mandatory templates bypass these checks.';


-- ═══════════════════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('org-assets', 'org-assets', false, 2097152, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'org members can upload org assets') THEN
    CREATE POLICY "org members can upload org assets" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'org-assets' AND name LIKE 'org-%');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'org members can manage org assets') THEN
    CREATE POLICY "org members can manage org assets" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'org-assets' AND name LIKE 'org-%');
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════════════════

-- ── SA prime lending rate history (SARB) ──────────────────────────────
INSERT INTO prime_rates (effective_date, rate_percent, notes) VALUES
  ('2004-11-05', 11,    'SARB historical'),
  ('2005-04-15', 10.5,  'SARB historical'),
  ('2006-06-08', 11,    'SARB historical'),
  ('2006-08-03', 11.5,  'SARB historical'),
  ('2006-10-13', 12,    'SARB historical'),
  ('2006-12-08', 12.5,  'SARB historical'),
  ('2007-06-08', 13,    'SARB historical'),
  ('2007-08-17', 13.5,  'SARB historical'),
  ('2007-10-12', 14,    'SARB historical'),
  ('2007-12-07', 14.5,  'SARB historical'),
  ('2008-04-11', 15,    'SARB historical'),
  ('2008-06-13', 15.5,  'SARB historical'),
  ('2008-12-12', 15,    'SARB historical'),
  ('2009-02-06', 14,    'SARB historical'),
  ('2009-03-25', 13,    'SARB historical'),
  ('2009-05-04', 12,    'SARB historical'),
  ('2009-05-29', 11,    'SARB historical'),
  ('2009-08-14', 10.5,  'SARB historical'),
  ('2010-03-26', 10,    'SARB historical'),
  ('2010-09-10', 9.5,   'SARB historical'),
  ('2010-11-19', 9,     'SARB historical'),
  ('2012-07-20', 8.5,   'SARB historical'),
  ('2014-01-30', 9,     'SARB historical'),
  ('2014-07-18', 9.25,  'SARB historical'),
  ('2015-07-24', 9.5,   'SARB historical'),
  ('2015-11-20', 9.75,  'SARB historical'),
  ('2016-01-29', 10.25, 'SARB historical'),
  ('2016-03-18', 10.5,  'SARB historical'),
  ('2017-07-21', 10.25, 'SARB historical'),
  ('2018-03-29', 10,    'SARB historical'),
  ('2018-11-23', 10.25, 'SARB historical'),
  ('2019-07-19', 10,    'SARB historical'),
  ('2020-01-17', 9.75,  'SARB historical'),
  ('2020-03-20', 8.75,  'SARB historical'),
  ('2020-04-15', 7.75,  'SARB historical'),
  ('2020-05-22', 7.25,  'SARB historical'),
  ('2020-07-24', 7,     'SARB historical'),
  ('2021-11-19', 7.25,  'SARB historical'),
  ('2022-01-28', 7.5,   'SARB historical'),
  ('2022-03-25', 7.75,  'SARB historical'),
  ('2022-05-20', 8.25,  'SARB historical'),
  ('2022-07-22', 9,     'SARB historical'),
  ('2022-09-23', 9.75,  'SARB historical'),
  ('2022-11-25', 10.5,  'SARB historical'),
  ('2023-01-27', 10.75, 'SARB historical'),
  ('2023-03-31', 11.25, 'SARB historical'),
  ('2023-05-26', 11.75, 'SARB historical'),
  ('2024-09-20', 11.5,  'SARB historical'),
  ('2024-11-22', 11.25, 'SARB historical'),
  ('2025-01-31', 11,    'SARB historical'),
  ('2025-05-30', 10.75, 'SARB historical'),
  ('2025-08-01', 10.5,  'SARB historical'),
  ('2025-11-21', 10.25, 'SARB historical')
ON CONFLICT DO NOTHING;

-- ── Lease clause library: optional clauses + co-lessee liability ───────
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, sort_order, depends_on, description, toggle_label)
VALUES

('pets', 'Pets',
$$The lessee shall not keep or permit to be kept any animal, bird, reptile or other pet (hereinafter referred to as "pet" or "pets") in or upon the leased premises and/or the building and/or the property without the prior written consent of the lessor. Such consent, if granted, shall be subject to the following conditions –
the lessee shall be permitted to keep only such pet or pets as are described in Annexure D: Special Agreements, subject to any conditions recorded therein;
the lessee shall ensure that the pet or pets are at all times kept under proper control and supervision and shall not permit any pet to cause a nuisance, annoyance, danger or disturbance to other occupiers of the property or to any neighbours or to any person upon or in the vicinity of the property;
the lessee shall be liable for and shall make good any and all damage of whatsoever nature caused by the pet or pets to the leased premises and/or the building and/or the property and/or the common property, including but not limited to damage to carpets, flooring, doors, walls, gardens, lawns and fixtures, fair wear and tear excluded;
the lessee shall ensure that the leased premises and any garden or outside area used by the pet or pets are at all times kept in a clean, hygienic and sanitary condition. The lessee shall remove all animal waste immediately and shall be responsible for flea and tick treatment and any associated pest control at his/its own cost. Upon the termination of this agreement, the lessee shall arrange for professional fumigation of the leased premises at his/its own cost where pets were kept during the currency of the agreement, and shall provide proof of such fumigation to the lessor prior to the handover of the leased premises;
the lessee shall comply with all applicable municipal by-laws, regulations and legislation relating to the keeping of animals, including but not limited to licensing requirements and limitations on the number of animals that may be kept at a residential property;
subject to applicable law, the lessee shall be liable for and hereby indemnifies the lessor, the lessor's agents, employees and other occupiers of the property against any reasonable claims, damages, losses, costs and expenses arising directly or indirectly from the keeping of the pet or pets on the leased premises and/or the property, including but not limited to claims arising from biting, scratching, allergic reactions or any other injury or damage caused by the pet or pets to any person or property, excluding liability arising from the gross negligence or wilful misconduct of the lessor;
should the pet or pets cause persistent nuisance, disturbance or damage, or should the lessee fail to comply with any of the conditions set out in {{self:0}}, the lessor shall be entitled, acting reasonably, to withdraw consent by giving the lessee not less than fourteen days' written notice, whereupon the lessee shall remove the pet or pets from the leased premises within the said notice period;
the withdrawal of consent in terms of {{self:7}} shall not in itself entitle the lessee to cancel this agreement or claim a reduction in rental or damages, unless otherwise required by law.
Where so stipulated in Annexure D: Special Agreements, the deposit referred to in {{ref:rental_deposit}} shall include an additional amount allocated toward pet-related damage (hereinafter referred to as "the pet deposit allocation"). Such pet deposit allocation shall form part of, and be governed by the same terms and conditions as, the total deposit referred to in {{ref:rental_deposit}}, including the accrual of interest for the benefit of the lessee in accordance with the Rental Housing Act 50 of 1999. Upon the termination of this agreement, any deductions from the deposit in respect of damage caused by the pet or pets shall be separately itemised in the deduction schedule, fair wear and tear excluded.
The consent granted by the lessor in terms of {{self:0}} is personal to the lessee and to the specific pet or pets described in Annexure D: Special Agreements. The lessee shall not substitute, replace or introduce any additional pet or pets without the prior written consent of the lessor.$$,
'both', false, false, 1050, '{}',
'Governs the keeping of domestic animals, pet deposit allocation, damage liability, and removal conditions.',
'Tenant is permitted to keep animals on the premises'),

('parking', 'Parking',
$$Where the lessee is allocated the use of a parking bay, garage or carport (hereinafter referred to as "the parking area") as described in Annexure D: Special Agreements, the following conditions shall apply –
the parking area shall be used solely for the parking of roadworthy, licensed motor vehicles as contemplated in the National Road Traffic Act, Act 93 of 1996, and shall not be used for the storage of goods, equipment, materials, boats, trailers, caravans or any other purpose without the prior written consent of the lessor;
the lessee shall not carry out or permit to be carried out any mechanical repairs, servicing, panel beating, spray painting or any similar work on any vehicle in the parking area or elsewhere on the property, save for emergency repairs of a minor nature;
the lessee shall not wash or permit the washing of any vehicle in the parking area or on any part of the property other than in such area as may be designated by the lessor for that purpose, if any;
the lessee shall not permit any oil, petrol, diesel, brake fluid, coolant or other noxious substance to leak from any vehicle parked in the parking area, and should any such leakage occur, the lessee shall be liable for the cost of cleaning and making good any damage to the surface of the parking area and/or any adjacent areas;
the lessee shall not permit any vehicle to be parked in such a manner as to obstruct the free flow of vehicular or pedestrian traffic on the property, or to obstruct the parking areas allocated to other occupiers of the property, or to obstruct access to any fire hydrant, fire escape, emergency exit, refuse area or any other area reasonably required to be kept clear;
the lessor shall not be responsible for the safekeeping or security of any vehicle or the contents thereof parked in the parking area, save where any loss or damage arises from the gross negligence or wilful misconduct of the lessor, the lessor's agents or employees. Subject to the aforegoing, the lessee hereby indemnifies the lessor against any reasonable claims arising from theft, damage or loss to any vehicle or the contents thereof;
the lessee shall ensure that the parking area is kept in a clean and tidy condition at all times and shall not store or permit the storage of any items therein other than the vehicle;
where the parking area comprises a garage, the lessee shall maintain the garage door and its mechanism in good working order and condition at his/its own cost, and shall be liable for the cost of any repairs or replacements reasonably required as a result of damage caused by the lessee or his/its visitors, excluding fair wear and tear and latent defects;
the allocation of the parking area shall be personal to the lessee and shall not be sublet, assigned or otherwise transferred to any third party without the prior written consent of the lessor.
The rental payable in respect of the parking area, if applicable, shall be as set out in Annexure D: Special Agreements, and shall be payable in addition to and at the same time and in the same manner as the basic monthly rental referred to in {{ref:rental_deposit}}.$$,
'both', false, false, 1070, '{}',
'Governs allocated parking, access rights, vehicle restrictions, and parking bay conditions.',
'Unit includes allocated parking bay, carport or garage'),

('utilities_alternative', 'Alternative utilities',
$$Where the leased premises and/or the property is equipped with one or more alternative utility installations, including but not limited to solar photovoltaic panels, solar inverters, battery storage systems, solar geysers, boreholes, rainwater harvesting tanks and associated pumps, filtration or purification systems (hereinafter collectively referred to as "the alternative utility installation" or "the installation"), the following provisions shall apply –
the lessee acknowledges that the installation is provided for the supplementary or alternative supply of electricity and/or water to the leased premises and that the lessor makes no warranty or representation as to the continuity, capacity, output or quality of the supply from the installation. Unless the property is designed or approved for off-grid use, or otherwise agreed in writing, the lessee shall at all times maintain a connection to the municipal supply of electricity and/or water as the primary supply;
the lessee shall not interfere with, modify, disconnect, reconfigure or extend the installation or any part thereof without the prior written consent of the lessor. Any alteration to the installation shall be subject to the provisions of {{ref:alterations}} and shall be carried out only by a suitably qualified and accredited contractor approved by the lessor;
the lessee shall operate the installation in accordance with any operating instructions, user manuals or guidelines provided by the lessor or the installer. The lessee shall immediately notify the lessor of any malfunction, damage or defect in the installation;
the lessee shall be responsible for the routine maintenance of the installation to the extent specified in Annexure D: Special Agreements, which may include but shall not be limited to –
keeping solar panels free of debris, dirt and obstructions;
monitoring inverter and battery status indicators and reporting faults;
ensuring battery storage systems are not discharged below the minimum level specified in the manufacturer's operating instructions or, where no level is specified, below 20% (twenty percent) of total capacity;
ensuring borehole pump and filtration systems are not run dry or beyond capacity;
maintaining rainwater tanks in a clean and hygienic condition.
For the avoidance of doubt, routine maintenance shall not include technical servicing, electrical repairs, component replacement, or any work reasonably requiring a qualified electrician, plumber or specialist technician. Such work shall be the responsibility of the lessor unless otherwise agreed in writing;
the lessor shall be responsible for ensuring that the installation complies with all applicable laws, regulations, by-laws and standards, including but not limited to the Electrical Installation Regulations, the Electrical Machinery Regulations, the National Building Regulations and any municipal requirements relating to solar installations or borehole registration and water use licences under the National Water Act, Act 36 of 1998;
the lessee shall not sell, distribute or permit the distribution of any electricity generated by a solar installation to any third party or to any premises other than the leased premises without the prior written consent of the lessor and subject to applicable municipal approval requirements;
where a borehole is installed on the property, the lessee shall use borehole water responsibly and in compliance with any water use restrictions imposed by the relevant water services authority or the Department of Water and Sanitation, save for reasonable domestic use as permitted under Schedule 1 of the National Water Act. The lessee shall not use borehole water for any commercial purpose without the prior written consent of the lessor and such further authorisation as may be required in terms of the National Water Act;
the failure or unavailability of the installation for any reason, including maintenance, repair, replacement or insufficient output, shall not in itself constitute grounds for a reduction in rental or a claim against the lessor, unless otherwise required by law;
upon the termination of this agreement, the lessee shall return the installation to the lessor in the same good order and condition as at the commencement date, fair wear and tear excepted.$$,
'both', false, false, 750, '{"electricity"}',
'Governs solar, borehole, and other alternative utility installations including Schedule 1 domestic use.',
'Property has solar, borehole, or other alternative utility installations'),

('telecommunications', 'Telecommunications',
$$Where the leased premises and/or the property is equipped with or connected to telecommunications infrastructure, including but not limited to fibre optic cables, satellite dishes, aerial antennae, Wi-Fi access points and associated routers, switches, cabling and junction boxes (hereinafter collectively referred to as "the telecommunications infrastructure" or "the infrastructure"), the following provisions shall apply –
the lessee shall be responsible for establishing and maintaining his/its own account with the relevant telecommunications service provider at his/its own cost. The lessor shall not be liable for any charges, fees or costs incurred by the lessee in respect of any telecommunications service;
the lessee shall not interfere with, damage, disconnect, modify or extend the infrastructure or any part thereof without the prior written consent of the lessor. Should the lessee wish to install any additional telecommunications equipment, including but not limited to satellite dishes, aerials, external antennae, cabling or network equipment, the lessee shall obtain the prior written consent of the lessor and such installation shall be subject to the provisions of {{ref:alterations}};
the lessor shall not be responsible for the continuity, speed, capacity, quality or availability of any telecommunications service provided by a third-party service provider and the lessee shall have no claim arising solely from any interruption, degradation or failure of any such service, save where such failure arises from the gross negligence or wilful misconduct of the lessor;
where the infrastructure is shared with other occupiers of the property and/or the building, the lessee shall use the infrastructure in a reasonable manner and shall not do or permit to be done anything which may degrade, damage or interfere with the service available to other occupiers;
the lessee shall comply with all applicable laws, regulations and by-laws relating to the installation and use of telecommunications equipment, including but not limited to the Electronic Communications Act, Act 36 of 2005, and the regulations of the Independent Communications Authority of South Africa (ICASA);
the lessee shall permit the lessor and/or the lessor's nominated telecommunications service provider reasonable access to the leased premises for the purposes of installing, maintaining, repairing or upgrading the infrastructure, provided that –
the lessor shall give the lessee reasonable prior notice of such access, save in the case of an emergency;
such access shall be exercised at reasonable times and with as little disruption to the lessee as is reasonably practicable;
where a fibre optic connection or satellite installation is provided as a feature of the leased premises, the lessee shall take reasonable care of the internal termination point, router, optical network terminal or decoder (if any) provided, and shall be liable for the cost of repairing or replacing any such equipment damaged by the lessee, his/its employees, representatives or invitees, fair wear and tear excepted;
upon the termination of this agreement, the lessee shall –
cancel or transfer his/its telecommunications service account in respect of the leased premises;
return any equipment provided by the lessor in the same condition as at the commencement date, fair wear and tear excepted;
remove any telecommunications equipment installed by the lessee and make good any damage caused to the leased premises by such removal, at the lessee's cost.
The lessee shall not use the infrastructure for any unlawful purpose, including but not limited to the distribution of pirated content, the operation of an unlicensed broadcasting service, or any activity which contravenes the Films and Publications Act, Act 65 of 1996, or the Electronic Communications and Transactions Act, Act 25 of 2002.$$,
'both', false, false, 1080, '{}',
'Governs fibre, satellite, and telecommunications infrastructure with provider access provisions.',
'Property has fibre, satellite, or other telecommunications infrastructure')

ON CONFLICT (clause_key) DO UPDATE
  SET title             = EXCLUDED.title,
      body_template     = EXCLUDED.body_template,
      sort_order        = EXCLUDED.sort_order,
      description       = EXCLUDED.description,
      toggle_label      = EXCLUDED.toggle_label;

-- Append Annexure D conflict-resolution note to the general clause (idempotent guard)
UPDATE lease_clause_library
SET body_template = body_template
  || E'\nIn the event of any conflict between the provisions of Annexure D: Special Agreements and the main body of this agreement, the provisions of Annexure D shall prevail to the extent of such conflict, provided that such provisions are lawful and not inconsistent with applicable legislation.'
WHERE clause_key = 'general'
  AND body_template NOT LIKE '%Annexure D shall prevail%';

-- Co-lessee joint and several liability clause (auto-included when co_tenants_present)
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, sort_order, description, toggle_label, condition)
VALUES (
  'co_lessee_liability',
  'Joint and Several Liability of Lessees',
  $$Where this Agreement is entered into by more than one Lessee, the Lessees shall be jointly and severally liable for all obligations arising from this Agreement. Each Lessee may be held individually responsible for the full amount of all obligations hereunder, and the Lessor shall be entitled to proceed against any one or more of the Lessees without first being required to proceed against the others. The Lessees hereby renounce the benefits of excussion and division.

The departure, absence or incapacity of one Lessee shall not release the remaining Lessee(s) from any obligation under this Agreement, unless otherwise agreed in writing by the Lessor, and this Agreement shall continue in full force against the remaining Lessee(s).

Where a Lessee who is a natural person elects to terminate this Agreement pursuant to section 14 of the Consumer Protection Act 68 of 2008, such termination shall be personal to that Lessee only and shall not affect or terminate the obligations of any remaining Lessee(s). The Agreement shall continue between the Lessor and the remaining Lessee(s), who shall remain liable for the full rental and all obligations under this Agreement.

Any deposit paid under this Agreement is held as security for all obligations of all Lessees jointly. No Lessee shall be entitled to a partial refund of the deposit on account of their departure. The deposit shall be dealt with in accordance with the provisions of the Rental Housing Act upon the final termination of this Agreement.$$,
  'both', true, false, 250,
  'Joint and several liability for co-lessees. Auto-included when multiple lessees sign the agreement.',
  'Co-lessees — joint and several liability',
  'co_tenants_present'
)
ON CONFLICT (clause_key) DO UPDATE
  SET title         = EXCLUDED.title,
      body_template = EXCLUDED.body_template,
      sort_order    = EXCLUDED.sort_order,
      description   = EXCLUDED.description,
      condition     = EXCLUDED.condition;

-- ── Rule templates (property rules library) ───────────────────────────
INSERT INTO rule_templates (rule_key, title, body_template, category, feature_key, default_params, sort_order) VALUES
  ('quiet_hours',          'Quiet hours',              'The Lessee shall observe quiet hours between {{quiet_hours_start}} and {{quiet_hours_end}} daily. The Lessee shall ensure that no noise audible beyond the boundaries of the Premises is created during these hours, and shall take reasonable steps to ensure that all occupants, guests, and visitors comply with this requirement.',                                                                                                                                                              'Noise',        NULL,          '{"quiet_hours_start":"22:00","quiet_hours_end":"07:00"}',  10),
  ('music_entertainment',  'Music and entertainment',  'The Lessee shall not play amplified music or conduct any entertainment that creates noise audible beyond the boundaries of the Premises after 22:00 on any day. All gatherings on the Premises shall be conducted with due consideration for neighbouring occupants.',                                                                                                                                                                                                                       'Noise',        NULL,          '{}',                                                       11),
  ('smoking',              'Smoking restrictions',     'Smoking is prohibited inside the Premises and on all balconies and enclosed areas. The Lessee shall ensure that smoking is confined to designated outdoor areas, if any, and shall be responsible for the proper disposal of all smoking materials.',                                                                                                                                                                                                                                      'Smoking',      NULL,          '{"areas":"inside the Premises and on all balconies"}',     20),
  ('braai_usage',          'Braai and BBQ usage',      'The use of braai or barbecue facilities is permitted only in designated areas and shall cease by {{braai_close_time}} daily. The Lessee shall ensure that all braai equipment is properly extinguished after use and that the braai area is left clean and free of debris.',                                                                                                                                                                                                               'Braai',        NULL,          '{"braai_close_time":"22:00"}',                             30),
  ('pet_restrictions',     'Pet restrictions',         'The Lessee shall not keep any domestic animal exceeding {{max_pet_weight_kg}}kg in weight on the Premises, and shall not keep more than {{max_pet_count}} domestic animals in total. All pets must be kept under control at all times and must not cause a nuisance to other occupants or neighbours.',                                                                                                                                                                                    'Pets',         'Pet friendly','{"max_pet_weight_kg":"10","max_pet_count":"2"}',             40),
  ('pet_waste',            'Pet waste and damage',     'The Lessee shall be responsible for the immediate removal and hygienic disposal of all pet waste from the Premises and common areas. The Lessee shall be liable for any damage caused to the Premises or common property by any animal kept by the Lessee.',                                                                                                                                                                                                                              'Pets',         'Pet friendly','{}',                                                        41),
  ('parking_allocated',    'Allocated parking',        'The Lessee is allocated parking bay(s) as specified in this Agreement. Vehicles shall be parked only in allocated bays. The parking of caravans, trailers, boats, or unregistered vehicles on the Premises is prohibited unless prior written consent is obtained from the Lessor.',                                                                                                                                                                                                     'Parking',      NULL,          '{}',                                                       50),
  ('parking_visitors',     'Visitor parking',          'Visitors shall use designated visitor parking only and shall not occupy allocated bays belonging to other lessees. The Lessee shall ensure that visitors comply with all parking rules applicable to the Premises.',                                                                                                                                                                                                                                                                      'Parking',      NULL,          '{}',                                                       51),
  ('parking_no_repairs',   'No vehicle repairs',       'The Lessee shall not carry out vehicle maintenance, repairs, or washing on the Premises other than routine cleaning. No oil, fuel, or automotive fluids shall be allowed to contaminate the parking area or any part of the Premises.',                                                                                                                                                                                                                                                   'Parking',      NULL,          '{}',                                                       52),
  ('pool_hours',           'Pool hours and safety',    'The swimming pool may be used between {{pool_open}} and {{pool_close}} daily. Children under the age of 12 must be accompanied by a responsible adult at all times while using the pool. The Lessee shall shower before entering the pool and shall not permit the use of the pool by any person suffering from a communicable skin condition or open wound.',                                                                                                                              'Pool',         'Pool',        '{"pool_open":"08:00","pool_close":"20:00"}',                60),
  ('pool_no_glass',        'No glass at pool area',    'No glass containers, bottles, or glassware of any kind shall be brought into or used in the pool area. Only plastic or shatter-proof containers are permitted.',                                                                                                                                                                                                                                                                                                                          'Pool',         'Pool',        '{}',                                                       61),
  ('garden_maintenance',   'Garden maintenance',       'The Lessee shall maintain all garden areas within the Premises in a neat and presentable condition. Gardens shall be watered no fewer than {{watering_frequency}} during the months of October through March. The Lessee shall not remove, damage, or materially alter any established trees, shrubs, or plants without the prior written consent of the Lessor.',                                                                                                                         'Garden',       'Garden',      '{"watering_frequency":"twice per week"}',                  70),
  ('garden_no_alterations','No alterations to garden', 'The Lessee shall not erect any structures, install trampolines or play equipment, or make any alterations to the garden or landscaping without the prior written consent of the Lessor.',                                                                                                                                                                                                                                                                                                  'Garden',       'Garden',      '{}',                                                       71),
  ('laundry',              'Washing and drying',       'Laundry shall be hung to dry only in designated drying areas or on approved drying racks. Laundry shall not be hung on balcony railings, fences, or any area visible from the street or common areas.',                                                                                                                                                                                                                                                                                   'Laundry',      NULL,          '{}',                                                       80),
  ('alarm_access',         'Alarm and access control', 'The Lessee shall operate the alarm system in accordance with the instructions provided by the Lessor. The Lessee shall be responsible for any call-out fees resulting from false alarms caused by the Lessee or any occupant of the Premises. Alarm codes and access credentials shall not be shared with unauthorised persons.',                                                                                                                                                         'Security',     'Alarm',       '{}',                                                       90),
  ('gate_keys',            'Gate and key protocol',    'The Lessee shall ensure that all gates, doors, and security barriers are locked and secured when not in use. Lost or damaged keys, remotes, or access devices must be reported to the Lessor immediately, and the Lessee shall bear the cost of replacement.',                                                                                                                                                                                                                            'Security',     NULL,          '{}',                                                       91),
  ('common_areas',         'Common area usage',        'The Lessee shall use all common areas with due care and consideration for other occupants. No personal belongings shall be stored in common areas, passages, or stairwells. The Lessee shall not obstruct any common passage, entrance, stairway, or fire escape.',                                                                                                                                                                                                                       'Common areas', NULL,          '{}',                                                       100),
  ('refuse',               'Refuse and recycling',     'The Lessee shall dispose of all household refuse in the bins or receptacles provided, and shall ensure that refuse is placed out for collection on the designated collection day. Recycling shall be separated where facilities are provided. No refuse shall be left in common areas, passages, or outside the designated refuse area.',                                                                                                                                                  'Refuse',       NULL,          '{"collection_day":"Wednesday"}',                           110),
  ('no_subletting',        'No subletting',            'The Lessee shall not sublet, assign, or otherwise part with occupation of the Premises or any part thereof without the prior written consent of the Lessor.',                                                                                                                                                                                                                                                                                                                             'Subletting',   NULL,          '{}',                                                       120),
  ('no_modifications',     'No modifications',         'The Lessee shall not make any structural or cosmetic alterations, additions, or modifications to the Premises without the prior written consent of the Lessor. This includes, but is not limited to, painting, wallpapering, installation of fixtures, drilling into walls, and alteration of any fitted items.',                                                                                                                                                                        'Alterations',  NULL,          '{}',                                                       130),
  ('hazardous_materials',  'Hazardous materials',      'The Lessee shall not store or use any flammable, explosive, or hazardous materials on the Premises beyond normal household quantities of cleaning products. No gas cylinders other than those required for cooking appliances shall be stored on the Premises.',                                                                                                                                                                                                                          'General',      NULL,          '{}',                                                       140)
ON CONFLICT (rule_key) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- ── lease_co_tenants ──────────────────────────────────────────────────
ALTER TABLE lease_co_tenants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lease_co_tenants' AND policyname = 'org_lease_co_tenants') THEN
    CREATE POLICY "org_lease_co_tenants" ON lease_co_tenants
      FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

-- ── unit_clause_defaults ──────────────────────────────────────────────
ALTER TABLE unit_clause_defaults ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unit_clause_defaults' AND policyname = 'org_unit_clause_defaults') THEN
    CREATE POLICY "org_unit_clause_defaults" ON unit_clause_defaults
      FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

-- ── property_rules ────────────────────────────────────────────────────
ALTER TABLE property_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'property_rules' AND policyname = 'org_property_rules') THEN
    CREATE POLICY "org_property_rules" ON property_rules
      FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
  END IF;
END $$;

-- ── communication_log ─────────────────────────────────────────────────
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "comm_log_org_select" ON communication_log
    FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── communication_preferences ─────────────────────────────────────────
ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "comm_prefs_org" ON communication_preferences
    FOR ALL USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── landlords portal ──────────────────────────────────────────────────
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landlords' AND policyname = 'landlord_portal_self') THEN
    CREATE POLICY "landlord_portal_self" ON landlords FOR SELECT USING (auth_user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'landlord_portal_properties') THEN
    CREATE POLICY "landlord_portal_properties" ON properties
      FOR SELECT USING (landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'units' AND policyname = 'landlord_portal_units') THEN
    CREATE POLICY "landlord_portal_units" ON units
      FOR SELECT USING (
        property_id IN (SELECT id FROM properties WHERE landlord_id IN (
          SELECT id FROM landlords WHERE auth_user_id = auth.uid()
        ))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_requests' AND policyname = 'landlord_portal_maintenance') THEN
    CREATE POLICY "landlord_portal_maintenance" ON maintenance_requests
      FOR SELECT USING (
        property_id IN (SELECT id FROM properties WHERE landlord_id IN (
          SELECT id FROM landlords WHERE auth_user_id = auth.uid()
        ))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'owner_statements' AND policyname = 'landlord_portal_statements') THEN
    CREATE POLICY "landlord_portal_statements" ON owner_statements
      FOR SELECT USING (landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leases' AND policyname = 'landlord_portal_leases') THEN
    CREATE POLICY "landlord_portal_leases" ON leases
      FOR SELECT USING (
        property_id IN (SELECT id FROM properties WHERE landlord_id IN (
          SELECT id FROM landlords WHERE auth_user_id = auth.uid()
        ))
      );
  END IF;
END $$;
