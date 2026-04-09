-- 002_contacts.sql
-- Unified contacts layer: contacts master + child tables + thin role tables
-- Consolidated from: 005_contacts.sql + 045_pending_landlords.sql (function only)
-- Pattern: UFlow TenantContact/TenantOrganization adapted to Supabase RLS
--
-- Architecture:
--   contacts           — master identity record (individual or organisation)
--   contact_phones     — normalised phone numbers (1 per row, labelled)
--   contact_emails     — normalised email addresses (1 per row, labelled)
--   contact_addresses  — normalised addresses (polymorphic on contacts.id)
--   contact_roles      — junction: contact can have multiple roles
--   contact_employment — individual ↔ organisation link (e.g. Dean → DW Plumbing)
--   tenants            — thin extension: contact_id FK + tenant-specific fields
--   landlords          — thin extension: contact_id FK + landlord-specific fields
--
-- Notes:
--   tenants.id and landlords.id remain proper UUIDs so all downstream FK
--   references (leases.tenant_id, inspections.tenant_id, etc.) are unchanged.
--   contractors.id likewise unchanged — contact_id added in 009_maintenance.sql.

-- ─────────────────────────────────────────────────────────────
-- 1. CONTACTS — master identity record
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),

  -- Entity classification
  entity_type     text NOT NULL DEFAULT 'individual'
                  CHECK (entity_type IN ('individual', 'organisation')),

  -- Primary role (how this contact appears in the app)
  -- Multiple roles stored in contact_roles junction table
  primary_role    text NOT NULL DEFAULT 'other'
                  CHECK (primary_role IN (
                    'tenant', 'landlord', 'contractor',
                    'agent', 'body_corporate', 'guarantor', 'other'
                  )),

  -- ── Individual identity ──────────────────────────────────
  first_name      text,
  last_name       text,
  -- SA ID / passport — encrypted at application layer (same pattern as existing)
  id_number       text,
  id_number_hash  text,          -- SHA-256 of normalised id_number (for dedup lookup without decrypt)
  id_type         text CHECK (id_type IN ('sa_id', 'passport', 'asylum_permit')),
  date_of_birth   date,
  nationality     text DEFAULT 'South African',
  gender          text CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),

  -- ── Organisation identity ────────────────────────────────
  company_name    text,          -- legal entity name
  trading_as      text,          -- DBA / trading name
  registration_number text,      -- CIPC reg number
  vat_number      text,
  is_informal     boolean NOT NULL DEFAULT false,  -- no reg number (informal trader, trust, etc.)

  -- ── Organisation contact person (UFlow pattern) ──────────
  -- For organisations: the human to actually call/email
  contact_first_name text,
  contact_last_name  text,

  -- ── Primary contact (denormalised for fast display) ──────
  -- Detail rows live in contact_phones / contact_emails
  primary_email   text,
  primary_phone   text,

  -- ── Deduplication (UFlow dedup_hash pattern) ─────────────
  -- Computed on INSERT/UPDATE by trigger — never set manually
  dedup_hash      text NOT NULL DEFAULT '',
  name_normalised text NOT NULL DEFAULT '',  -- lowercase stripped name for search

  -- ── Common metadata ──────────────────────────────────────
  notes           text,
  tags            text[],                    -- free-form categorisation
  is_active       boolean NOT NULL DEFAULT true,
  is_verified     boolean NOT NULL DEFAULT false,
  tpn_reference   text,                      -- TPN REFERENCE from import
  tpn_entity_id   text,                      -- TPN ENTITY ID from import

  -- ── Audit ─────────────────────────────────────────────────
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_contacts_org_id       ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_primary_role ON contacts(org_id, primary_role) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email        ON contacts(primary_email) WHERE primary_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_dedup        ON contacts(org_id, dedup_hash);
CREATE INDEX IF NOT EXISTS idx_contacts_name        ON contacts(org_id, name_normalised);
CREATE INDEX IF NOT EXISTS idx_contacts_id_hash      ON contacts(id_number_hash) WHERE id_number_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_deleted      ON contacts(deleted_at);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contacts" ON contacts;
CREATE POLICY "org_contacts" ON contacts
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── Dedup hash trigger ────────────────────────────────────────
-- Computes name_normalised and dedup_hash on every insert/update.
-- Pattern from UFlow: hash(normalised_name | primary_email | id_number_hash)
-- Allows duplicate detection without decrypting sensitive fields.
CREATE OR REPLACE FUNCTION compute_contact_dedup_hash()
RETURNS TRIGGER AS $$
DECLARE
  v_name text;
  v_hash_input text;
BEGIN
  -- Build normalised name from whichever fields are present
  IF NEW.entity_type = 'organisation' THEN
    v_name := lower(trim(coalesce(NEW.company_name, '') || ' ' || coalesce(NEW.trading_as, '')));
  ELSE
    v_name := lower(trim(
      coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, '')
    ));
  END IF;

  NEW.name_normalised := regexp_replace(v_name, '\s+', ' ', 'g');

  -- Hash components: normalised name | primary email | id number hash
  v_hash_input := NEW.name_normalised
    || '|' || lower(coalesce(NEW.primary_email, ''))
    || '|' || coalesce(NEW.id_number_hash, '');

  NEW.dedup_hash := encode(sha256(v_hash_input::bytea), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_dedup_hash ON contacts;
CREATE TRIGGER contacts_dedup_hash
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION compute_contact_dedup_hash();


-- ─────────────────────────────────────────────────────────────
-- 2. CONTACT_PHONES — normalised phone numbers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_phones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone_type    text NOT NULL DEFAULT 'mobile'
                CHECK (phone_type IN ('mobile', 'work', 'home', 'fax', 'other')),
  number        text NOT NULL,
  label         text,           -- e.g. "Office", "Cell", "After hours"
  is_primary    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  can_whatsapp  boolean NOT NULL DEFAULT false,
  can_sms       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_phones_contact ON contact_phones(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_phones_primary
  ON contact_phones(contact_id) WHERE is_primary = true;

ALTER TABLE contact_phones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contact_phones" ON contact_phones;
CREATE POLICY "org_contact_phones" ON contact_phones
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 3. CONTACT_EMAILS — normalised email addresses
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email_type    text NOT NULL DEFAULT 'personal'
                CHECK (email_type IN ('personal', 'work', 'billing', 'other')),
  email         text NOT NULL,
  label         text,           -- e.g. "Main", "Accounts", "Personal"
  is_primary    boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_emails_contact ON contact_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_emails_email   ON contact_emails(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_emails_primary
  ON contact_emails(contact_id) WHERE is_primary = true;

ALTER TABLE contact_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contact_emails" ON contact_emails;
CREATE POLICY "org_contact_emails" ON contact_emails
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 4. CONTACT_ADDRESSES — normalised addresses (polymorphic on contacts.id)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  address_type    text NOT NULL DEFAULT 'physical'
                  CHECK (address_type IN (
                    'physical', 'postal', 'billing', 'work', 'other'
                  )),
  street_line1    text,
  street_line2    text,
  suburb          text,
  city            text,
  province        text CHECK (province IN (
                    'Western Cape', 'Eastern Cape', 'Northern Cape',
                    'North West', 'Free State', 'KwaZulu-Natal',
                    'Gauteng', 'Limpopo', 'Mpumalanga'
                  )),
  postal_code     text,
  country         text NOT NULL DEFAULT 'South Africa',
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_contact_addresses_updated_at ON contact_addresses;
CREATE TRIGGER update_contact_addresses_updated_at
  BEFORE UPDATE ON contact_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_contact_addresses_contact ON contact_addresses(contact_id);

ALTER TABLE contact_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contact_addresses" ON contact_addresses;
CREATE POLICY "org_contact_addresses" ON contact_addresses
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 5. CONTACT_ROLES — junction: contact can hold multiple roles
-- ─────────────────────────────────────────────────────────────
-- Example: Johan Bouwer is both a Landlord and a Guarantor on different leases.
-- primary_role on contacts = the most common role (for display/filtering).
-- contact_roles = the full set.
CREATE TABLE IF NOT EXISTS contact_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  contact_id    uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN (
                  'tenant', 'landlord', 'contractor',
                  'agent', 'body_corporate', 'guarantor', 'other'
                )),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contact_id, role)
);

CREATE INDEX IF NOT EXISTS idx_contact_roles_contact ON contact_roles(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_roles_org_role ON contact_roles(org_id, role);

ALTER TABLE contact_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contact_roles" ON contact_roles;
CREATE POLICY "org_contact_roles" ON contact_roles
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 6. CONTACT_EMPLOYMENT — individual ↔ organisation link
-- ─────────────────────────────────────────────────────────────
-- Example: Dean Wyld (individual contact) → DW Plumbing PTY LTD (org contact)
-- Also used for: tenant employer lookup, guarantor employment verification
CREATE TABLE IF NOT EXISTS contact_employment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  individual_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  organisation_id     uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  job_title           text,
  department          text,
  employment_type     text CHECK (employment_type IN (
                        'permanent', 'contract', 'self_employed',
                        'director', 'trustee', 'other'
                      )),
  -- Work contact (may differ from personal contact on contacts table)
  work_email          text,
  work_phone          text,
  is_primary          boolean NOT NULL DEFAULT true,   -- primary employer
  is_current          boolean NOT NULL DEFAULT true,
  start_date          date,
  end_date            date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(individual_id, organisation_id)
);

DROP TRIGGER IF EXISTS update_contact_employment_updated_at ON contact_employment;
CREATE TRIGGER update_contact_employment_updated_at
  BEFORE UPDATE ON contact_employment
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_contact_employment_individual ON contact_employment(individual_id);
CREATE INDEX IF NOT EXISTS idx_contact_employment_org        ON contact_employment(organisation_id);

ALTER TABLE contact_employment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_contact_employment" ON contact_employment;
CREATE POLICY "org_contact_employment" ON contact_employment
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 7. TENANTS — thin extension table (tenant-specific fields only)
-- ─────────────────────────────────────────────────────────────
-- All identity data (name, email, phone, ID number) lives in contacts.
-- This table holds: the contact_id FK + fields specific to being a tenant.
-- tenants.id is the PK that all downstream tables (leases, inspections,
-- payments, etc.) reference via tenant_id FK — unchanged.
CREATE TABLE IF NOT EXISTS tenants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  contact_id            uuid NOT NULL REFERENCES contacts(id),

  -- Employment (tenant-specific — not shared with contractors/landlords)
  employer_name         text,
  employer_phone        text,
  occupation            text,
  employment_type       text CHECK (employment_type IN (
                          'permanent', 'contract', 'self_employed',
                          'student', 'unemployed', 'retired', 'other'
                        )),

  -- Preferred communication channel
  preferred_contact     text DEFAULT 'whatsapp'
                        CHECK (preferred_contact IN (
                          'whatsapp', 'sms', 'email', 'call'
                        )),

  -- POPIA consent (tenant-specific — legal requirement for RHA)
  popia_consent_given     boolean NOT NULL DEFAULT false,
  popia_consent_given_at  timestamptz,
  popia_consent_version   text DEFAULT '1.0',

  -- Tenant portal access
  portal_access_enabled   boolean NOT NULL DEFAULT false,
  portal_invite_sent_at   timestamptz,
  portal_last_login_at    timestamptz,

  -- Risk flags
  blacklisted             boolean DEFAULT false,
  blacklisted_reason      text,

  -- Audit
  created_by              uuid REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,

  UNIQUE(org_id, contact_id)    -- a contact can only be a tenant once per org
);

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_tenants_org_id    ON tenants(org_id);
CREATE INDEX IF NOT EXISTS idx_tenants_contact_id ON tenants(contact_id);
CREATE INDEX IF NOT EXISTS idx_tenants_deleted    ON tenants(deleted_at);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenants" ON tenants;
CREATE POLICY "org_tenants" ON tenants
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 8. LANDLORDS — thin extension table (landlord-specific fields only)
-- ─────────────────────────────────────────────────────────────
-- Replaces: pending_landlords staging table + properties.owner_* flat fields.
-- All identity data (name, email, phone) lives in contacts.
-- A landlord record links to properties via properties.landlord_id.
-- properties.owner_name / owner_email / owner_phone remain as a denormalised
-- cache for owner statement generation (populated when landlord is linked).
CREATE TABLE IF NOT EXISTS landlords (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  contact_id            uuid NOT NULL REFERENCES contacts(id),

  -- Banking (for owner EFT payments — reference data, not collection)
  bank_name             text,
  bank_account          text,
  bank_branch           text,
  bank_account_type     text CHECK (bank_account_type IN (
                          'cheque', 'savings', 'transmission'
                        )),
  tax_number            text,    -- SARS tax number for owner statements

  -- Payment preferences
  payment_method        text DEFAULT 'eft'
                        CHECK (payment_method IN ('eft', 'cash', 'other')),
  payment_terms         text,    -- e.g. "Last day of month"

  -- Import tracking (plain uuid — import_sessions table created in 005_operations.sql)
  import_session_id     uuid,

  -- Audit
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,

  UNIQUE(org_id, contact_id)
);

DROP TRIGGER IF EXISTS update_landlords_updated_at ON landlords;
CREATE TRIGGER update_landlords_updated_at
  BEFORE UPDATE ON landlords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_landlords_org_id     ON landlords(org_id);
CREATE INDEX IF NOT EXISTS idx_landlords_contact_id ON landlords(contact_id);

ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_landlords" ON landlords;
CREATE POLICY "org_landlords" ON landlords
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 9. TENANT-SPECIFIC CHILD TABLES (unchanged structure, FKs intact)
-- ─────────────────────────────────────────────────────────────

-- Next of kin / emergency contacts for a tenant
-- Note: these are NOT contacts records — they are informal references
-- that don't need the full contact lifecycle (no dedup, no roles, no portal)
CREATE TABLE IF NOT EXISTS tenant_next_of_kin (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  relationship  text,            -- "Mother", "Spouse", "Sibling", etc.
  phone         text,
  email         text,
  is_emergency  boolean DEFAULT true,
  is_guarantor  boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_next_of_kin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenant_next_of_kin" ON tenant_next_of_kin;
CREATE POLICY "org_tenant_next_of_kin" ON tenant_next_of_kin
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Tenant documents vault
CREATE TABLE IF NOT EXISTS tenant_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_type   text NOT NULL CHECK (document_type IN (
                    'id_document', 'passport', 'proof_of_income',
                    'bank_statement', 'payslip', 'employment_letter',
                    'reference_letter', 'credit_report', 'other'
                  )),
  name            text NOT NULL,
  storage_path    text NOT NULL,
  file_size       integer,
  mime_type       text,
  period_from     date,
  period_to       date,
  ai_processed    boolean DEFAULT false,
  ai_extracted_at timestamptz,
  notes           text,
  uploaded_by     uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant_id ON tenant_documents(tenant_id);

ALTER TABLE tenant_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenant_docs" ON tenant_documents;
CREATE POLICY "org_tenant_docs" ON tenant_documents
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Communication log (immutable — no UPDATE/DELETE)
CREATE TABLE IF NOT EXISTS communication_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  -- Can reference a tenant OR any contact (not both required)
  tenant_id       uuid REFERENCES tenants(id),
  contact_id      uuid REFERENCES contacts(id),   -- for non-tenant comms (landlord, contractor)
  lease_id        uuid,
  channel         text NOT NULL CHECK (channel IN (
                    'email', 'sms', 'whatsapp', 'phone_call',
                    'portal_message', 'internal_note'
                  )),
  direction       text NOT NULL CHECK (direction IN ('outbound', 'inbound', 'internal')),
  subject         text,
  body            text,
  status          text CHECK (status IN (
                    'sent', 'delivered', 'read', 'failed',
                    'received', 'logged'
                  )),
  external_id     text,
  sent_by         uuid REFERENCES auth.users(id),
  sent_to_email   text,
  sent_to_phone   text,
  has_attachments boolean DEFAULT false,
  attachment_paths text[],
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comms_tenant_id  ON communication_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comms_contact_id ON communication_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_comms_org_id     ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comms_channel    ON communication_log(channel);

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_comms_read" ON communication_log;
CREATE POLICY "org_comms_read" ON communication_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
DROP POLICY IF EXISTS "org_comms_insert" ON communication_log;
CREATE POLICY "org_comms_insert" ON communication_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Tenancy history
CREATE TABLE IF NOT EXISTS tenancy_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  unit_id       uuid NOT NULL,  -- FK to units added after 003
  lease_id      uuid,
  move_in_date  date NOT NULL,
  move_out_date date,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'ended', 'vacated_early', 'evicted')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenancy_history_tenant ON tenancy_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancy_history_unit   ON tenancy_history(unit_id);

ALTER TABLE tenancy_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_tenancy_history" ON tenancy_history;
CREATE POLICY "org_tenancy_history" ON tenancy_history
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Tenant portal user link
CREATE TABLE IF NOT EXISTS user_orgs_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organisations(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE user_orgs_tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_tenant_link" ON user_orgs_tenants;
CREATE POLICY "own_tenant_link" ON user_orgs_tenants
  FOR SELECT USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- 10. CONVENIENCE VIEWS
-- ─────────────────────────────────────────────────────────────
-- tenant_view: joins tenants + contacts for easy querying
-- TypeScript code can SELECT * FROM tenant_view WHERE org_id = $1
-- and get all identity + tenant-specific fields in one query.
CREATE OR REPLACE VIEW tenant_view AS
SELECT
  t.id,
  t.org_id,
  t.contact_id,
  -- Identity from contacts
  c.entity_type,
  c.first_name,
  c.last_name,
  c.company_name,
  COALESCE(NULLIF(TRIM(COALESCE(c.contact_first_name, '') || ' ' || COALESCE(c.contact_last_name, '')), ''), NULL) AS contact_person,
  c.id_number,
  c.id_number_hash,
  c.id_type,
  c.date_of_birth,
  c.nationality,
  c.primary_email       AS email,
  c.primary_phone       AS phone,
  -- Tenant-specific
  t.employer_name,
  t.employer_phone,
  t.occupation,
  t.employment_type,
  t.preferred_contact,
  t.popia_consent_given,
  t.popia_consent_given_at,
  t.portal_access_enabled,
  t.blacklisted,
  t.blacklisted_reason,
  c.notes,
  t.created_at,
  t.updated_at,
  t.deleted_at
FROM tenants t
JOIN contacts c ON c.id = t.contact_id;

-- landlord_view: joins landlords + contacts
CREATE OR REPLACE VIEW landlord_view AS
SELECT
  l.id,
  l.org_id,
  l.contact_id,
  -- Identity from contacts
  c.entity_type,
  c.first_name,
  c.last_name,
  c.company_name,
  c.trading_as,
  c.registration_number,
  c.vat_number,
  c.primary_email       AS email,
  c.primary_phone       AS phone,
  -- Landlord-specific
  l.bank_name,
  l.bank_account,
  l.bank_branch,
  l.bank_account_type,
  l.tax_number,
  l.payment_method,
  c.notes,
  l.created_at,
  l.updated_at,
  l.deleted_at
FROM landlords l
JOIN contacts c ON c.id = l.contact_id;


-- ─────────────────────────────────────────────────────────────
-- 11. HELPER FUNCTIONS (from 045_pending_landlords.sql)
-- ─────────────────────────────────────────────────────────────

-- Agent dedup helper function — looks up org member by email
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
