-- 003_properties.sql
-- Properties, buildings, units, unit status history, property documents,
-- property photos, inspections (rooms, items, photos)
--
-- Sources:
--   004_properties_units.sql
--   017_buildings_amendments.sql (buildings + building_id on units/property_documents)
--   011_owner_statements.sql    (owner columns on properties only)
--   008_inspections.sql

-- =============================================================
-- TABLES
-- =============================================================

-- -------------------------------------------------------------
-- Properties (merged from 004 + 011 owner columns)
-- -------------------------------------------------------------
CREATE TABLE properties (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid NOT NULL REFERENCES organisations(id),
  name                    text NOT NULL,
  address_line1           text NOT NULL,
  address_line2           text,
  suburb                  text,
  city                    text NOT NULL,
  province                text NOT NULL CHECK (province IN (
                            'Western Cape', 'Eastern Cape', 'Northern Cape',
                            'North West', 'Free State', 'KwaZulu-Natal',
                            'Gauteng', 'Limpopo', 'Mpumalanga'
                          )),
  postal_code             text,
  country                 text NOT NULL DEFAULT 'South Africa',
  erf_number              text,
  sectional_title_number  text,
  lightstone_id           text,
  deeds_id                text,
  google_place_id         text,
  gps_lat                 numeric(10,7),
  gps_lng                 numeric(10,7),
  type                    text NOT NULL DEFAULT 'residential'
                          CHECK (type IN ('residential', 'commercial', 'mixed')),
  description             text,
  notes                   text,
  managing_agent_id       uuid REFERENCES auth.users(id),
  owner_id                uuid,
  hoa_id                  uuid,
  -- Owner / landlord columns (from 011_owner_statements)
  landlord_id             uuid,  -- FK to landlords added in 004_leases_financials.sql
  owner_name              text,
  owner_email             text,
  owner_phone             text,
  owner_bank_name         text,
  owner_bank_account      text,
  owner_bank_branch       text,
  owner_bank_type         text CHECK (owner_bank_type IN ('cheque', 'savings', 'transmission')),
  owner_tax_number        text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);

-- -------------------------------------------------------------
-- Buildings (from 017_buildings_amendments)
-- -------------------------------------------------------------
CREATE TABLE buildings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  property_id                 uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name                        text NOT NULL,
  building_code               text,
  building_type               text NOT NULL DEFAULT 'residential'
                              CHECK (building_type IN (
                                'residential', 'commercial', 'mixed_use', 'industrial',
                                'heritage', 'heritage_commercial', 'heritage_residential'
                              )),
  construction_year           integer,
  floors_above_ground         integer,
  floors_below_ground         integer DEFAULT 0,
  total_floor_area_m2         numeric(10,2),
  heritage_status             text CHECK (heritage_status IN (
                                'none', 'grade_1', 'grade_2', 'grade_3a',
                                'grade_3b', 'local_significance'
                              )) DEFAULT 'none',
  heritage_reference          text,
  insurance_policy_number     text,
  insurance_provider          text,
  insurance_type              text CHECK (insurance_type IN (
                                'standard_buildings', 'heritage_specialist',
                                'commercial_property', 'sectional_title', 'other'
                              )),
  insurance_renewal_date      date,
  insurance_replacement_value_cents bigint,
  maintenance_rhythm          text NOT NULL DEFAULT 'standard'
                              CHECK (maintenance_rhythm IN (
                                'standard', 'heritage', 'new_build', 'industrial', 'custom'
                              )),
  heritage_pre_approval_required   boolean DEFAULT false,
  heritage_materials_spec          text,
  heritage_approved_contractors_only boolean DEFAULT false,
  description                 text,
  notes                       text,
  is_primary                  boolean DEFAULT true,
  is_visible_in_ui            boolean DEFAULT false,
  created_by                  uuid REFERENCES auth.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz
);

-- -------------------------------------------------------------
-- Units (merged from 004 + 017 building_id)
-- -------------------------------------------------------------
CREATE TABLE units (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id         uuid REFERENCES buildings(id),
  unit_number         text NOT NULL,
  floor               integer,
  size_m2             numeric(8,2),
  bedrooms            integer,
  bathrooms           numeric(3,1),
  parking_bays        integer DEFAULT 0,
  furnished           boolean DEFAULT false,
  features            text[] DEFAULT '{}',
  status              text NOT NULL DEFAULT 'vacant'
                      CHECK (status IN ('vacant','occupied','notice','maintenance','archived')),
  is_archived         boolean NOT NULL DEFAULT false,
  market_rent_cents   integer,
  asking_rent_cents   integer,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

-- -------------------------------------------------------------
-- Unit status history (append-only)
-- -------------------------------------------------------------
CREATE TABLE unit_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     uuid NOT NULL REFERENCES units(id),
  org_id      uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- Property documents (merged from 004 + 017 building_id)
-- -------------------------------------------------------------
CREATE TABLE property_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  building_id   uuid REFERENCES buildings(id),
  name          text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
                  'title_deed', 'compliance_certificate', 'insurance',
                  'rates_clearance', 'levy_schedule', 'plans',
                  'electrical_coc', 'gas_coc', 'beetle_coc', 'other'
                )),
  storage_path  text NOT NULL,
  file_size     integer,
  mime_type     text,
  expiry_date   date,
  notes         text,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- Property photos
-- -------------------------------------------------------------
CREATE TABLE property_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  property_id   uuid REFERENCES properties(id) ON DELETE CASCADE,
  unit_id       uuid REFERENCES units(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  caption       text,
  is_primary    boolean DEFAULT false,
  display_order integer DEFAULT 0,
  uploaded_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- Inspections
-- -------------------------------------------------------------
CREATE TABLE inspections (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL REFERENCES organisations(id),
  unit_id                   uuid NOT NULL REFERENCES units(id),
  property_id               uuid NOT NULL REFERENCES properties(id),
  lease_id                  uuid,  -- FK to leases added in 004_leases_financials.sql
  tenant_id                 uuid,  -- FK to tenants added in 004_leases_financials.sql
  inspection_type           text NOT NULL CHECK (inspection_type IN (
                              'move_in', 'periodic', 'move_out', 'pre_listing',
                              'commercial_handover', 'commercial_dilapidations'
                            )),
  lease_type                text NOT NULL DEFAULT 'residential'
                            CHECK (lease_type IN ('residential', 'commercial')),
  scheduled_date            timestamptz,
  conducted_date            timestamptz,
  conducted_by              uuid REFERENCES auth.users(id),
  tenant_present            boolean,
  tenant_signature_url      text,
  landlord_present          boolean,
  agent_present             boolean,
  status                    text NOT NULL DEFAULT 'scheduled'
                            CHECK (status IN (
                              'scheduled', 'in_progress', 'completed',
                              'awaiting_tenant_review', 'disputed',
                              'dispute_resolved', 'finalised'
                            )),
  dispute_window_open       boolean DEFAULT false,
  dispute_window_opened_at  timestamptz,
  dispute_window_closes_at  timestamptz,
  tenant_dispute_notes      text,
  overall_condition         text CHECK (overall_condition IN (
                              'excellent', 'good', 'fair', 'poor', 'unacceptable'
                            )),
  overall_notes             text,
  recommended_deductions_cents integer DEFAULT 0,
  deduction_justified       boolean,
  deposit_action            text CHECK (deposit_action IN (
                              'return_full', 'return_partial', 'retain_full', 'pending'
                            )),
  ai_assessment_status      text DEFAULT 'not_run'
                            CHECK (ai_assessment_status IN ('not_run', 'running', 'complete', 'failed')),
  ai_assessed_at            timestamptz,
  ai_model_used             text,
  fixtures_schedule         jsonb DEFAULT '[]',
  make_good_items           jsonb DEFAULT '[]',
  report_generated_at       timestamptz,
  report_storage_path       text,
  move_in_inspection_id     uuid REFERENCES inspections(id),
  offline_started_at        timestamptz,
  synced_at                 timestamptz,
  sync_device_id            text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- Inspection rooms
-- -------------------------------------------------------------
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

-- -------------------------------------------------------------
-- Inspection items
-- -------------------------------------------------------------
CREATE TABLE inspection_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    uuid NOT NULL,
  inspection_id             uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  room_id                   uuid NOT NULL REFERENCES inspection_rooms(id) ON DELETE CASCADE,
  item_name                 text NOT NULL,
  item_category             text NOT NULL CHECK (item_category IN (
                              'walls', 'ceiling', 'floor', 'window', 'door',
                              'electrical', 'plumbing', 'fixture', 'fitting',
                              'carpet', 'paint', 'appliance', 'garden',
                              'hvac', 'fire_equipment', 'access_control',
                              'signage', 'partition', 'cabling', 'tenant_improvement',
                              'other'
                            )),
  condition                 text CHECK (condition IN (
                              'excellent', 'good', 'fair', 'poor',
                              'damaged', 'missing', 'not_inspected'
                            )),
  condition_notes           text,
  classification            text CHECK (classification IN (
                              'wear_and_tear', 'tenant_damage', 'pre_existing',
                              'acceptable', 'unclassified'
                            )),
  dilapidation_type         text CHECK (dilapidation_type IN (
                              'fair_wear', 'dilapidation', 'make_good_required',
                              'tenant_improvement_retained', 'tenant_improvement_remove',
                              'pre_existing', 'acceptable', 'unclassified'
                            )),
  estimated_deduction_cents integer DEFAULT 0,
  deduction_justification   text,
  reinstatement_cost_cents  integer DEFAULT 0,
  reinstatement_notes       text,
  tenant_disputed           boolean DEFAULT false,
  tenant_dispute_note       text,
  dispute_resolved          boolean DEFAULT false,
  dispute_resolution_note   text,
  move_in_item_id           uuid REFERENCES inspection_items(id),
  display_order             integer DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- Inspection photos (originals are IMMUTABLE — no UPDATE policy)
-- -------------------------------------------------------------
CREATE TABLE inspection_photos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL,
  inspection_id         uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id               uuid REFERENCES inspection_items(id),
  room_id               uuid REFERENCES inspection_rooms(id),
  storage_path_original text NOT NULL,
  storage_path_thumb    text,
  file_size_bytes       integer,
  mime_type             text DEFAULT 'image/jpeg',
  gps_lat               numeric(10,7),
  gps_lng               numeric(10,7),
  gps_accuracy_m        numeric(6,2),
  gps_captured_at       timestamptz,
  caption               text,
  is_primary            boolean DEFAULT false,
  display_order         integer DEFAULT 0,
  captured_offline      boolean DEFAULT false,
  device_id             text,
  local_uuid            text UNIQUE,
  move_in_photo_id      uuid REFERENCES inspection_photos(id),
  uploaded_by           uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- =============================================================
-- DEFERRED building_id columns (tables created in later migrations)
-- =============================================================
-- building_id added in 005_operations.sql: maintenance_requests
-- building_id added in 005_operations.sql: contractors (+ heritage_approved, heritage_specialities)
-- building_id added in 005_operations.sql: contractor_preferences
-- building_id added in 005_operations.sql: municipal_bill_allocations

-- =============================================================
-- INDEXES
-- =============================================================

-- Properties
CREATE INDEX idx_properties_org_id      ON properties(org_id);
CREATE INDEX idx_properties_deleted_at  ON properties(deleted_at);
CREATE INDEX idx_properties_landlord_id ON properties(landlord_id);

-- Buildings
CREATE INDEX idx_buildings_property     ON buildings(property_id);
CREATE INDEX idx_buildings_org          ON buildings(org_id);
CREATE INDEX idx_buildings_type         ON buildings(building_type);

-- Units
CREATE INDEX idx_units_org_id           ON units(org_id);
CREATE INDEX idx_units_property_id      ON units(property_id);
CREATE INDEX idx_units_status           ON units(status);

-- Unit status history
CREATE INDEX idx_unit_status_history_unit_id ON unit_status_history(unit_id);

-- Property documents
CREATE INDEX idx_property_documents_property_id ON property_documents(property_id);

-- Property photos
CREATE INDEX idx_property_photos_property_id ON property_photos(property_id);
CREATE INDEX idx_property_photos_unit_id     ON property_photos(unit_id);

-- Inspections
CREATE INDEX idx_inspections_org_id    ON inspections(org_id);
CREATE INDEX idx_inspections_unit_id   ON inspections(unit_id);
CREATE INDEX idx_inspections_lease_id  ON inspections(lease_id);
CREATE INDEX idx_inspections_status    ON inspections(status);

-- Inspection rooms
CREATE INDEX idx_inspection_rooms_inspection ON inspection_rooms(inspection_id);

-- Inspection items
CREATE INDEX idx_inspection_items_inspection ON inspection_items(inspection_id);
CREATE INDEX idx_inspection_items_room       ON inspection_items(room_id);

-- Inspection photos
CREATE INDEX idx_inspection_photos_inspection ON inspection_photos(inspection_id);
CREATE INDEX idx_inspection_photos_item       ON inspection_photos(item_id);

-- =============================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================

-- Properties
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_properties" ON properties
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Buildings
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_buildings" ON buildings
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Units
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_units" ON units
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Unit status history
ALTER TABLE unit_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_unit_status_history_select" ON unit_status_history
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
CREATE POLICY "org_unit_status_history_insert" ON unit_status_history
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Property documents
ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_documents" ON property_documents
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Property photos
ALTER TABLE property_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_photos" ON property_photos
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Inspections
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspections" ON inspections
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
CREATE POLICY "tenant_own_inspection" ON inspections
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND status IN ('awaiting_tenant_review', 'disputed', 'dispute_resolved', 'finalised')
  );

-- Inspection rooms
ALTER TABLE inspection_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_rooms" ON inspection_rooms
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Inspection items
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_items" ON inspection_items
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Inspection photos (IMMUTABLE originals — INSERT + SELECT only)
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_inspection_photos_insert" ON inspection_photos
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
CREATE POLICY "org_inspection_photos_select" ON inspection_photos
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- TRIGGERS
-- =============================================================

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_documents_updated_at
  BEFORE UPDATE ON property_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inspection_items_updated_at
  BEFORE UPDATE ON inspection_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- FUNCTIONS
-- =============================================================

-- Active unit count (for tier limit enforcement)
CREATE OR REPLACE FUNCTION get_active_unit_count(p_org_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM units
  WHERE org_id = p_org_id
  AND is_archived = false
  AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
