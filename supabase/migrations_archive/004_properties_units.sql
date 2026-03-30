-- 004_properties_units.sql
-- Properties, units, unit status history, property documents, property photos

-- =============================================================
-- Properties
-- =============================================================
CREATE TABLE properties (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  name              text NOT NULL,
  address_line1     text NOT NULL,
  address_line2     text,
  suburb            text,
  city              text NOT NULL,
  province          text NOT NULL CHECK (province IN (
                      'Western Cape', 'Eastern Cape', 'Northern Cape',
                      'North West', 'Free State', 'KwaZulu-Natal',
                      'Gauteng', 'Limpopo', 'Mpumalanga'
                    )),
  postal_code       text,
  country           text NOT NULL DEFAULT 'South Africa',
  erf_number        text,
  sectional_title_number text,
  lightstone_id     text,
  deeds_id          text,
  google_place_id   text,
  gps_lat           numeric(10,7),
  gps_lng           numeric(10,7),
  type              text NOT NULL DEFAULT 'residential'
                    CHECK (type IN ('residential', 'commercial', 'mixed')),
  description       text,
  notes             text,
  managing_agent_id uuid REFERENCES auth.users(id),
  owner_id          uuid,
  hoa_id            uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_properties_org_id ON properties(org_id);
CREATE INDEX idx_properties_deleted_at ON properties(deleted_at);

-- =============================================================
-- Units
-- =============================================================
CREATE TABLE units (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_number     text NOT NULL,
  floor           integer,
  size_m2         numeric(8,2),
  bedrooms        integer,
  bathrooms       numeric(3,1),
  parking_bays    integer DEFAULT 0,
  furnished       boolean DEFAULT false,
  features        text[] DEFAULT '{}',
  status          text NOT NULL DEFAULT 'vacant'
                  CHECK (status IN ('vacant','occupied','notice','maintenance','archived')),
  is_archived     boolean NOT NULL DEFAULT false,
  market_rent_cents     integer,
  asking_rent_cents     integer,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_units_org_id ON units(org_id);
CREATE INDEX idx_units_property_id ON units(property_id);
CREATE INDEX idx_units_status ON units(status);

-- =============================================================
-- Unit status history (append-only)
-- =============================================================
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

CREATE INDEX idx_unit_status_history_unit_id ON unit_status_history(unit_id);

-- =============================================================
-- Property documents vault
-- =============================================================
CREATE TABLE property_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  property_id   uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
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

CREATE TRIGGER update_property_documents_updated_at
  BEFORE UPDATE ON property_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_property_documents_property_id ON property_documents(property_id);

-- =============================================================
-- Property photos
-- =============================================================
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

CREATE INDEX idx_property_photos_property_id ON property_photos(property_id);
CREATE INDEX idx_property_photos_unit_id ON property_photos(unit_id);

-- =============================================================
-- RLS Policies
-- =============================================================
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_properties" ON properties
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_units" ON units
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

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

ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_documents" ON property_documents
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

ALTER TABLE property_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_photos" ON property_photos
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- =============================================================
-- Active unit count function (for tier limit enforcement)
-- =============================================================
CREATE OR REPLACE FUNCTION get_active_unit_count(p_org_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM units
  WHERE org_id = p_org_id
  AND is_archived = false
  AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
