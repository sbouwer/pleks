-- 008_inspections.sql
-- Inspections, rooms, items, photos

CREATE TABLE inspections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  unit_id           uuid NOT NULL REFERENCES units(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  lease_id          uuid REFERENCES leases(id),
  tenant_id         uuid REFERENCES tenants(id),
  inspection_type   text NOT NULL CHECK (inspection_type IN (
                      'move_in', 'periodic', 'move_out', 'pre_listing',
                      'commercial_handover', 'commercial_dilapidations'
                    )),
  lease_type        text NOT NULL DEFAULT 'residential'
                    CHECK (lease_type IN ('residential', 'commercial')),
  scheduled_date    timestamptz,
  conducted_date    timestamptz,
  conducted_by      uuid REFERENCES auth.users(id),
  tenant_present    boolean,
  tenant_signature_url text,
  landlord_present  boolean,
  agent_present     boolean,
  status            text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN (
                      'scheduled', 'in_progress', 'completed',
                      'awaiting_tenant_review', 'disputed',
                      'dispute_resolved', 'finalised'
                    )),
  dispute_window_open     boolean DEFAULT false,
  dispute_window_opened_at timestamptz,
  dispute_window_closes_at timestamptz,
  tenant_dispute_notes    text,
  overall_condition  text CHECK (overall_condition IN (
                       'excellent', 'good', 'fair', 'poor', 'unacceptable'
                     )),
  overall_notes      text,
  recommended_deductions_cents integer DEFAULT 0,
  deduction_justified          boolean,
  deposit_action    text CHECK (deposit_action IN (
                      'return_full', 'return_partial', 'retain_full', 'pending'
                    )),
  ai_assessment_status  text DEFAULT 'not_run'
                        CHECK (ai_assessment_status IN ('not_run', 'running', 'complete', 'failed')),
  ai_assessed_at        timestamptz,
  ai_model_used         text,
  fixtures_schedule jsonb DEFAULT '[]',
  make_good_items   jsonb DEFAULT '[]',
  report_generated_at   timestamptz,
  report_storage_path   text,
  move_in_inspection_id uuid REFERENCES inspections(id),
  offline_started_at    timestamptz,
  synced_at             timestamptz,
  sync_device_id        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_inspections_org_id ON inspections(org_id);
CREATE INDEX idx_inspections_unit_id ON inspections(unit_id);
CREATE INDEX idx_inspections_lease_id ON inspections(lease_id);
CREATE INDEX idx_inspections_status ON inspections(status);

-- Inspection rooms
CREATE TABLE inspection_rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  inspection_id   uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  room_type       text NOT NULL,
  room_label      text NOT NULL,
  display_order   integer NOT NULL DEFAULT 0,
  overall_condition text CHECK (overall_condition IN (
                      'excellent', 'good', 'fair', 'poor', 'unacceptable'
                    )),
  room_notes      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_rooms_inspection ON inspection_rooms(inspection_id);

-- Inspection items
CREATE TABLE inspection_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  inspection_id   uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  room_id         uuid NOT NULL REFERENCES inspection_rooms(id) ON DELETE CASCADE,
  item_name       text NOT NULL,
  item_category   text NOT NULL CHECK (item_category IN (
                    'walls', 'ceiling', 'floor', 'window', 'door',
                    'electrical', 'plumbing', 'fixture', 'fitting',
                    'carpet', 'paint', 'appliance', 'garden',
                    'hvac', 'fire_equipment', 'access_control',
                    'signage', 'partition', 'cabling', 'tenant_improvement',
                    'other'
                  )),
  condition       text CHECK (condition IN (
                    'excellent', 'good', 'fair', 'poor',
                    'damaged', 'missing', 'not_inspected'
                  )),
  condition_notes text,
  classification  text CHECK (classification IN (
                    'wear_and_tear', 'tenant_damage', 'pre_existing',
                    'acceptable', 'unclassified'
                  )),
  dilapidation_type text CHECK (dilapidation_type IN (
                    'fair_wear', 'dilapidation', 'make_good_required',
                    'tenant_improvement_retained', 'tenant_improvement_remove',
                    'pre_existing', 'acceptable', 'unclassified'
                  )),
  estimated_deduction_cents integer DEFAULT 0,
  deduction_justification   text,
  reinstatement_cost_cents  integer DEFAULT 0,
  reinstatement_notes       text,
  tenant_disputed   boolean DEFAULT false,
  tenant_dispute_note text,
  dispute_resolved  boolean DEFAULT false,
  dispute_resolution_note text,
  move_in_item_id   uuid REFERENCES inspection_items(id),
  display_order     integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_inspection_items_updated_at
  BEFORE UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_inspection_items_inspection ON inspection_items(inspection_id);
CREATE INDEX idx_inspection_items_room ON inspection_items(room_id);

-- Inspection photos (originals are IMMUTABLE — no UPDATE policy)
CREATE TABLE inspection_photos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  inspection_id   uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES inspection_items(id),
  room_id         uuid REFERENCES inspection_rooms(id),
  storage_path_original text NOT NULL,
  storage_path_thumb    text,
  file_size_bytes       integer,
  mime_type             text DEFAULT 'image/jpeg',
  gps_lat           numeric(10,7),
  gps_lng           numeric(10,7),
  gps_accuracy_m    numeric(6,2),
  gps_captured_at   timestamptz,
  caption           text,
  is_primary        boolean DEFAULT false,
  display_order     integer DEFAULT 0,
  captured_offline  boolean DEFAULT false,
  device_id         text,
  local_uuid        text UNIQUE,
  move_in_photo_id  uuid REFERENCES inspection_photos(id),
  uploaded_by       uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inspection_photos_inspection ON inspection_photos(inspection_id);
CREATE INDEX idx_inspection_photos_item ON inspection_photos(item_id);

-- RLS
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspections" ON inspections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_inspection" ON inspections
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND status IN ('awaiting_tenant_review', 'disputed', 'dispute_resolved', 'finalised')
  );

ALTER TABLE inspection_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_rooms" ON inspection_rooms
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_items" ON inspection_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_photos_insert" ON inspection_photos
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_inspection_photos_select" ON inspection_photos
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
