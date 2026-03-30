-- 009_maintenance.sql
-- Contractors (thin, contact_id backed), preferences, maintenance requests, photos, updates
--
-- Contractors follow the contacts pattern: identity in contacts, role-specific in contractors.
-- contractors.id is the PK referenced by all downstream tables — unchanged.
-- contacts table must be created first (005_contacts.sql).

-- Contractors (thin extension — identity lives in contacts)
CREATE TABLE contractors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  contact_id      uuid NOT NULL REFERENCES contacts(id),

  -- Contractor-specific fields
  specialities    text[] DEFAULT '{}',
  property_ids    uuid[] DEFAULT '{}',      -- properties this contractor is assigned to
  call_out_rate_cents integer,
  hourly_rate_cents   integer,

  -- Contractor portal access
  portal_access_enabled boolean DEFAULT false,
  portal_invite_sent_at timestamptz,
  access_token    text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Audit
  is_active       boolean DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id, contact_id)
);

CREATE TRIGGER update_contractors_updated_at
  BEFORE UPDATE ON contractors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_contractors_org_id     ON contractors(org_id);
CREATE INDEX idx_contractors_contact_id ON contractors(contact_id);

ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_contractors" ON contractors
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Convenience view: contractors with identity joined from contacts
CREATE OR REPLACE VIEW contractor_view AS
SELECT
  co.id,
  co.org_id,
  co.contact_id,
  -- Identity from contacts
  c.entity_type,
  c.first_name,
  c.last_name,
  c.company_name,
  c.trading_as,
  c.registration_number,
  c.vat_number,
  c.contact_first_name,
  c.contact_last_name,
  c.primary_email       AS email,
  c.primary_phone       AS phone,
  c.notes,
  -- Contractor-specific
  co.specialities,
  co.property_ids,
  co.call_out_rate_cents,
  co.hourly_rate_cents,
  co.portal_access_enabled,
  co.is_active,
  co.created_at,
  co.updated_at
FROM contractors co
JOIN contacts c ON c.id = co.contact_id;

-- Contractor preferences
CREATE TABLE contractor_preferences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid REFERENCES properties(id),
  category        text NOT NULL,
  contractor_id   uuid NOT NULL REFERENCES contractors(id),
  priority_order  integer DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, property_id, category, priority_order)
);

ALTER TABLE contractor_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_contractor_prefs" ON contractor_preferences
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Maintenance requests
CREATE TABLE maintenance_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  unit_id           uuid NOT NULL REFERENCES units(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  lease_id          uuid REFERENCES leases(id),
  tenant_id         uuid REFERENCES tenants(id),
  title             text NOT NULL,
  description       text NOT NULL,
  logged_by         text NOT NULL CHECK (logged_by IN ('tenant', 'agent', 'system')),
  logged_by_user    uuid REFERENCES auth.users(id),
  category          text CHECK (category IN (
                      'electrical', 'plumbing', 'hvac', 'structural', 'roofing',
                      'windows_doors', 'appliances', 'garden', 'pest_control',
                      'painting', 'flooring', 'security', 'access_control',
                      'cleaning', 'other'
                    )),
  urgency           text CHECK (urgency IN ('emergency', 'urgent', 'routine', 'cosmetic')),
  ai_triage_notes   text,
  ai_triage_at      timestamptz,
  category_override text,
  urgency_override  text,
  status            text NOT NULL DEFAULT 'pending_review'
                    CHECK (status IN (
                      'pending_review', 'approved', 'pending_landlord',
                      'landlord_approved', 'landlord_rejected', 'rejected',
                      'work_order_sent', 'acknowledged', 'in_progress',
                      'pending_completion', 'completed', 'tenant_notified',
                      'closed', 'cancelled'
                    )),
  reviewed_by       uuid REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  landlord_notified_at      timestamptz,
  landlord_approved_by      text,
  landlord_approved_at      timestamptz,
  landlord_rejection_reason text,
  work_order_number text UNIQUE,
  contractor_id     uuid REFERENCES contractors(id),
  work_order_sent_at  timestamptz,
  work_order_pdf_path text,
  access_instructions  text,
  special_instructions text,
  scheduled_date      date,
  scheduled_time_from time,
  scheduled_time_to   time,
  tenant_notified_of_schedule boolean DEFAULT false,
  estimated_cost_cents   integer,
  quoted_cost_cents      integer,
  actual_cost_cents      integer,
  approval_threshold_cents integer,
  invoice_storage_path   text,
  completed_at      timestamptz,
  completion_notes  text,
  agent_signoff_at  timestamptz,
  agent_signoff_by  uuid REFERENCES auth.users(id),
  tenant_rating     integer CHECK (tenant_rating BETWEEN 1 AND 5),
  tenant_feedback   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_maintenance_requests_updated_at
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_maintenance_org_id  ON maintenance_requests(org_id);
CREATE INDEX idx_maintenance_unit_id ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_status  ON maintenance_requests(status);
CREATE INDEX idx_maintenance_urgency ON maintenance_requests(urgency);

ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_maintenance" ON maintenance_requests
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_requests" ON maintenance_requests
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
  );
CREATE POLICY "tenant_create_requests" ON maintenance_requests
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND logged_by = 'tenant' AND status = 'pending_review'
  );

-- Maintenance photos
CREATE TABLE maintenance_photos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL,
  request_id             uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  storage_path           text NOT NULL,
  storage_path_thumb     text,
  caption                text,
  uploaded_by_type       text CHECK (uploaded_by_type IN ('tenant', 'agent', 'contractor')),
  uploaded_by_user       uuid REFERENCES auth.users(id),
  uploaded_by_contractor uuid REFERENCES contractors(id),
  photo_phase            text NOT NULL DEFAULT 'before'
                         CHECK (photo_phase IN ('before', 'during', 'after')),
  gps_lat                numeric(10,7),
  gps_lng                numeric(10,7),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_maintenance_photos_request ON maintenance_photos(request_id);

ALTER TABLE maintenance_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_maintenance_photos" ON maintenance_photos
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Contractor updates (immutable)
CREATE TABLE contractor_updates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  request_id    uuid NOT NULL REFERENCES maintenance_requests(id),
  contractor_id uuid NOT NULL REFERENCES contractors(id),
  new_status    text NOT NULL,
  notes         text,
  eta           timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contractor_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_contractor_updates_read" ON contractor_updates
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Add approval threshold to organisations
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS maintenance_approval_threshold_cents integer DEFAULT 200000;
