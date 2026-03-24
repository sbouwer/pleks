-- 005_tenants.sql
-- Tenants, contacts, documents, communication log, tenancy history

-- =============================================================
-- Tenants
-- =============================================================
CREATE TABLE tenants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  tenant_type       text NOT NULL DEFAULT 'individual'
                    CHECK (tenant_type IN ('individual', 'company')),
  -- Individual
  first_name        text,
  last_name         text,
  id_type           text CHECK (id_type IN ('sa_id', 'passport', 'asylum_permit')),
  id_number         text,
  id_number_hash    text,
  date_of_birth     date,
  nationality       text DEFAULT 'South African',
  -- Company
  company_name      text,
  company_reg_number text,
  vat_number        text,
  contact_person    text,
  -- Contact
  email             text,
  phone             text,
  phone_alt         text,
  preferred_contact text DEFAULT 'whatsapp'
                    CHECK (preferred_contact IN ('whatsapp', 'sms', 'email', 'call')),
  -- Current address
  current_address   text,
  current_suburb    text,
  current_city      text,
  current_province  text,
  current_postal    text,
  -- Employment
  employer_name     text,
  employer_phone    text,
  occupation        text,
  -- POPIA
  popia_consent_given     boolean NOT NULL DEFAULT false,
  popia_consent_given_at  timestamptz,
  popia_consent_version   text DEFAULT '1.0',
  -- Portal
  portal_access_enabled   boolean NOT NULL DEFAULT false,
  portal_invite_sent_at   timestamptz,
  portal_last_login_at    timestamptz,
  -- Meta
  notes             text,
  blacklisted       boolean DEFAULT false,
  blacklisted_reason text,
  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_tenants_org_id ON tenants(org_id);
CREATE INDEX idx_tenants_id_number_hash ON tenants(id_number_hash);
CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_deleted_at ON tenants(deleted_at);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tenants" ON tenants
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Tenant contacts (emergency / next of kin)
-- =============================================================
CREATE TABLE tenant_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  relationship  text,
  phone         text,
  email         text,
  is_emergency  boolean DEFAULT true,
  is_guarantor  boolean DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tenant_contacts" ON tenant_contacts
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Tenant documents vault
-- =============================================================
CREATE TABLE tenant_documents (
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

CREATE INDEX idx_tenant_documents_tenant_id ON tenant_documents(tenant_id);

ALTER TABLE tenant_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tenant_docs" ON tenant_documents
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Communication log (immutable — NO update/delete)
-- =============================================================
CREATE TABLE communication_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  tenant_id       uuid REFERENCES tenants(id),
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

CREATE INDEX idx_comms_tenant_id ON communication_log(tenant_id);
CREATE INDEX idx_comms_org_id ON communication_log(org_id);
CREATE INDEX idx_comms_channel ON communication_log(channel);

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_comms_read" ON communication_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
CREATE POLICY "org_comms_insert" ON communication_log
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Tenancy history
-- =============================================================
CREATE TABLE tenancy_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  unit_id       uuid NOT NULL REFERENCES units(id),
  lease_id      uuid,
  move_in_date  date NOT NULL,
  move_out_date date,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'ended', 'vacated_early', 'evicted')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenancy_history_tenant ON tenancy_history(tenant_id);
CREATE INDEX idx_tenancy_history_unit ON tenancy_history(unit_id);

ALTER TABLE tenancy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_tenancy_history" ON tenancy_history
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Tenant portal user link
-- =============================================================
CREATE TABLE user_orgs_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organisations(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

ALTER TABLE user_orgs_tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_tenant_link" ON user_orgs_tenants
  FOR SELECT USING (user_id = auth.uid());
