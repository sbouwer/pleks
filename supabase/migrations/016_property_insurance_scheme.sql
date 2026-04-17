-- ─────────────────────────────────────────────────────────────────────────────
-- 016: Property insurance, broker, managing scheme, incident notifications
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (a) Insurance moves to properties table ──────────────────────────────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS insurance_policy_number           text,
  ADD COLUMN IF NOT EXISTS insurance_provider                text,
  ADD COLUMN IF NOT EXISTS insurance_policy_type             text
    CHECK (insurance_policy_type IN (
      'standard_buildings', 'heritage_specialist',
      'commercial_property', 'sectional_title', 'other'
    )),
  ADD COLUMN IF NOT EXISTS insurance_renewal_date            date,
  ADD COLUMN IF NOT EXISTS insurance_replacement_value_cents bigint,
  ADD COLUMN IF NOT EXISTS insurance_excess_cents            bigint,
  ADD COLUMN IF NOT EXISTS insurance_notes                   text,
  ADD COLUMN IF NOT EXISTS has_managing_scheme               boolean NOT NULL DEFAULT false;

-- ── (b) Building-level insurance columns dropped ─────────────────────────────
-- Pre-production — no data migration needed.

ALTER TABLE buildings
  DROP COLUMN IF EXISTS insurance_policy_number,
  DROP COLUMN IF EXISTS insurance_provider,
  DROP COLUMN IF EXISTS insurance_type,
  DROP COLUMN IF EXISTS insurance_renewal_date,
  DROP COLUMN IF EXISTS insurance_replacement_value_cents;

-- Per-building replacement value kept for underwriting granularity
ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS replacement_value_cents bigint,
  ADD COLUMN IF NOT EXISTS last_valuation_date     date;

-- ── (c) Contacts: add insurance_broker as valid primary_role ─────────────────

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_primary_role_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_primary_role_check
  CHECK (primary_role IN (
    'tenant', 'landlord', 'contractor', 'agent',
    'body_corporate', 'guarantor', 'insurance_broker', 'other'
  ));

-- ── (d) Property brokers (join table — one broker per property) ──────────────

CREATE TABLE IF NOT EXISTS property_brokers (
  property_id          uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  org_id               uuid NOT NULL REFERENCES organisations(id),
  broker_contact_id    uuid NOT NULL REFERENCES contacts(id),
  auto_notify_critical boolean NOT NULL DEFAULT true,
  notify_channels      text[] NOT NULL DEFAULT ARRAY['email']
                       CHECK (notify_channels <@ ARRAY['email','whatsapp','sms']::text[]),
  after_hours_number   text,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_brokers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_brokers" ON property_brokers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_property_brokers_broker ON property_brokers(broker_contact_id);

-- ── (e) Managing schemes (replaces contractor-based BC pattern) ──────────────

CREATE TABLE IF NOT EXISTS managing_schemes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organisations(id),
  name                      text NOT NULL,
  scheme_type               text NOT NULL CHECK (scheme_type IN (
                              'body_corporate', 'hoa', 'share_block',
                              'retirement_village', 'other'
                            )),
  csos_registration_number  text,
  managing_agent_contact_id uuid REFERENCES contacts(id),
  emergency_contact_id      uuid REFERENCES contacts(id),
  levy_cycle                text CHECK (levy_cycle IN ('monthly','quarterly','annually')),
  csos_ombud_contact        text,
  scheme_rules_storage_path text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz
);

ALTER TABLE managing_schemes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_managing_schemes" ON managing_schemes
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_managing_schemes_org     ON managing_schemes(org_id);
CREATE INDEX IF NOT EXISTS idx_managing_schemes_deleted ON managing_schemes(deleted_at);

-- ── (f) Re-point properties.managing_scheme_id to managing_schemes table ─────

ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_managing_scheme_id_fkey;

ALTER TABLE properties
  ADD CONSTRAINT properties_managing_scheme_id_fkey
  FOREIGN KEY (managing_scheme_id) REFERENCES managing_schemes(id);

-- ── (g) Maintenance severity + insurance claim flags ─────────────────────────

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'routine'
    CHECK (severity IN ('routine', 'elevated', 'urgent', 'critical')),
  ADD COLUMN IF NOT EXISTS severity_source text
    CHECK (severity_source IN ('agent', 'ai_triage', 'tenant')),
  ADD COLUMN IF NOT EXISTS is_insurance_claim       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_claim_reference text,
  ADD COLUMN IF NOT EXISTS insurance_decision        text
    CHECK (insurance_decision IN ('reported', 'declined', 'unsure', 'pending')),
  ADD COLUMN IF NOT EXISTS insurance_decision_at     timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_decision_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS insurance_decision_notes  text;

CREATE INDEX IF NOT EXISTS idx_maintenance_severity ON maintenance_requests(severity)
  WHERE severity IN ('urgent', 'critical');

-- ── (h) Incident notifications audit log ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_notifications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  maintenance_request_id  uuid NOT NULL REFERENCES maintenance_requests(id),
  notified_party          text NOT NULL CHECK (notified_party IN (
                            'broker', 'managing_scheme', 'landlord', 'tenant'
                          )),
  party_contact_id        uuid REFERENCES contacts(id),
  channel                 text NOT NULL CHECK (channel IN ('email','whatsapp','sms')),
  template_name           text,
  communication_log_id    uuid REFERENCES communication_log(id),
  decision_by             uuid REFERENCES auth.users(id),
  sent_at                 timestamptz NOT NULL DEFAULT now(),
  delivered_at            timestamptz,
  failed_reason           text
);

ALTER TABLE incident_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_incident_notifications" ON incident_notifications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_incident_notif_request ON incident_notifications(maintenance_request_id);
CREATE INDEX IF NOT EXISTS idx_incident_notif_party   ON incident_notifications(notified_party);

-- ── (i) Trigger: sync has_managing_scheme on FK change ───────────────────────

CREATE OR REPLACE FUNCTION sync_property_has_managing_scheme()
RETURNS trigger AS $$
BEGIN
  NEW.has_managing_scheme := NEW.managing_scheme_id IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_properties_has_scheme ON properties;
CREATE TRIGGER trg_properties_has_scheme
  BEFORE INSERT OR UPDATE OF managing_scheme_id ON properties
  FOR EACH ROW EXECUTE FUNCTION sync_property_has_managing_scheme();

-- ── (j) Updated_at triggers for new tables ───────────────────────────────────

DROP TRIGGER IF EXISTS update_property_brokers_updated_at ON property_brokers;
CREATE TRIGGER update_property_brokers_updated_at
  BEFORE UPDATE ON property_brokers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_managing_schemes_updated_at ON managing_schemes;
CREATE TRIGGER update_managing_schemes_updated_at
  BEFORE UPDATE ON managing_schemes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
