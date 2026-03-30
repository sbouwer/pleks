-- 017_buildings_amendments.sql
-- AMENDMENT 1: Buildings layer (property → building → unit)
-- AMENDMENT 2: Building-aware maintenance
-- AMENDMENT 3: Building-aware supplier invoices
-- AMENDMENT 4: Building context on municipal bill allocations

-- =============================================================
-- AMENDMENT 1: Buildings table
-- =============================================================
CREATE TABLE buildings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name                text NOT NULL,
  building_code       text,
  building_type       text NOT NULL DEFAULT 'residential'
                      CHECK (building_type IN (
                        'residential', 'commercial', 'mixed_use', 'industrial',
                        'heritage', 'heritage_commercial', 'heritage_residential'
                      )),
  construction_year   integer,
  floors_above_ground integer,
  floors_below_ground integer DEFAULT 0,
  total_floor_area_m2 numeric(10,2),
  heritage_status     text CHECK (heritage_status IN (
                        'none', 'grade_1', 'grade_2', 'grade_3a',
                        'grade_3b', 'local_significance'
                      )) DEFAULT 'none',
  heritage_reference  text,
  insurance_policy_number text,
  insurance_provider      text,
  insurance_type      text CHECK (insurance_type IN (
                        'standard_buildings', 'heritage_specialist',
                        'commercial_property', 'sectional_title', 'other'
                      )),
  insurance_renewal_date date,
  insurance_replacement_value_cents bigint,
  maintenance_rhythm  text NOT NULL DEFAULT 'standard'
                      CHECK (maintenance_rhythm IN (
                        'standard', 'heritage', 'new_build', 'industrial', 'custom'
                      )),
  heritage_pre_approval_required boolean DEFAULT false,
  heritage_materials_spec text,
  heritage_approved_contractors_only boolean DEFAULT false,
  description         text,
  notes               text,
  is_primary          boolean DEFAULT true,
  is_visible_in_ui    boolean DEFAULT false,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE TRIGGER update_buildings_updated_at
  BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_buildings_property ON buildings(property_id);
CREATE INDEX idx_buildings_org ON buildings(org_id);
CREATE INDEX idx_buildings_type ON buildings(building_type);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_buildings" ON buildings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Add building_id to units
ALTER TABLE units ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- Add building_id to property_documents
ALTER TABLE property_documents ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- =============================================================
-- AMENDMENT 2: Building-aware maintenance
-- =============================================================
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- Heritage fields on contractors
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS heritage_approved boolean DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS heritage_specialities text[] DEFAULT '{}';

-- Building-level contractor preferences
ALTER TABLE contractor_preferences ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- =============================================================
-- AMENDMENT 3: Building-aware supplier invoices
-- =============================================================
-- DEFERRED: ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);

-- =============================================================
-- AMENDMENT 4: Building context on municipal bill allocations
-- =============================================================
ALTER TABLE municipal_bill_allocations ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES buildings(id);
