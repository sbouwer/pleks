-- ═══════════════════════════════════════════════════════════════════════════════
-- 012_property_extensions.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Property-adjacent feature enhancements:
--   • Inspection storage bucket
--   • Unit type + furnishings (BUILD_57A/B)
--   • Unit inspection profiles (BUILD_57A)
--   • Property insurance (BUILD_59 — moved from buildings to properties)
--   • Buildings replacement value & valuation date
--   • Insurance broker contact role
--   • Property brokers (one broker per property)
--   • Managing schemes (body corporate / HOA / share block)
--   • Maintenance severity + insurance-claim flags
--   • Incident notifications audit log
--
-- AMEND-FORWARD RULE: new property/unit/inspection-layer features, insurance
-- enhancements, managing-scheme features, or anything that extends the
-- property → building → unit → inspection hierarchy goes as a new §N section
-- at the bottom of this file.
--
-- Fully idempotent — safe to re-run on any DB state.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §1  INSPECTION STORAGE BUCKET
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-photos',
  'inspection-photos',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can upload inspection photos'
  ) THEN
    CREATE POLICY "org members can upload inspection photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inspection-photos');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can manage inspection photos'
  ) THEN
    CREATE POLICY "org members can manage inspection photos" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'inspection-photos');
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §2  UNIT TYPE & FURNISHINGS  (BUILD_57A/B)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_type text;

ALTER TABLE units ADD COLUMN IF NOT EXISTS furnishing_status text
  DEFAULT 'unfurnished'
  CHECK (furnishing_status IN ('unfurnished', 'semi_furnished', 'furnished'));

-- Migrate from legacy boolean
UPDATE units SET furnishing_status = 'furnished'   WHERE furnished = true  AND furnishing_status = 'unfurnished';
UPDATE units SET furnishing_status = 'unfurnished' WHERE furnished = false AND furnishing_status = 'unfurnished';

CREATE TABLE IF NOT EXISTS unit_furnishings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  unit_id     uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  category    text NOT NULL,
  item_name   text NOT NULL,
  quantity    int  NOT NULL DEFAULT 1,
  condition   text,
  notes       text,
  is_custom   boolean NOT NULL DEFAULT false,
  room_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_furnishings_unit ON unit_furnishings(unit_id);

ALTER TABLE unit_furnishings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org unit furnishings access" ON unit_furnishings;
CREATE POLICY "org unit furnishings access" ON unit_furnishings
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Backfill unit_type for legacy units
UPDATE units SET unit_type = 'studio'    WHERE unit_type IS NULL AND bedrooms = 0;
UPDATE units SET unit_type = 'apartment' WHERE unit_type IS NULL AND bedrooms IS NOT NULL AND bedrooms > 0;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §3  UNIT INSPECTION PROFILES  (BUILD_57A)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS unit_inspection_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  unit_id     uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id)
);

CREATE INDEX IF NOT EXISTS idx_uip_unit ON unit_inspection_profiles(unit_id);
CREATE INDEX IF NOT EXISTS idx_uip_org  ON unit_inspection_profiles(org_id);

ALTER TABLE unit_inspection_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org unit inspection profiles access" ON unit_inspection_profiles;
CREATE POLICY "org unit inspection profiles access" ON unit_inspection_profiles
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE TABLE IF NOT EXISTS unit_inspection_profile_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  profile_id  uuid NOT NULL REFERENCES unit_inspection_profiles(id) ON DELETE CASCADE,
  room_type   text NOT NULL,
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  is_custom   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uipr_profile ON unit_inspection_profile_rooms(profile_id);
CREATE INDEX IF NOT EXISTS idx_uipr_org     ON unit_inspection_profile_rooms(org_id);

ALTER TABLE unit_inspection_profile_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org unit inspection profile rooms access" ON unit_inspection_profile_rooms;
CREATE POLICY "org unit inspection profile rooms access" ON unit_inspection_profile_rooms
  FOR ALL TO authenticated
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §4  PROPERTY INSURANCE  (BUILD_59 — moved from buildings to properties)
-- ═══════════════════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════════════════
-- §5  BUILDINGS: REPLACEMENT VALUE  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Insurance moved to properties (§4 above); per-building replacement value
-- kept for underwriting granularity. Legacy insurance columns on buildings
-- are dropped if they exist (live DBs that ran old 003 had them created).

ALTER TABLE buildings
  DROP COLUMN IF EXISTS insurance_policy_number,
  DROP COLUMN IF EXISTS insurance_provider,
  DROP COLUMN IF EXISTS insurance_type,
  DROP COLUMN IF EXISTS insurance_renewal_date,
  DROP COLUMN IF EXISTS insurance_replacement_value_cents;

ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS replacement_value_cents bigint,
  ADD COLUMN IF NOT EXISTS last_valuation_date     date;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §6  CONTACTS: INSURANCE BROKER ROLE  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_primary_role_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_primary_role_check
  CHECK (primary_role IN (
    'tenant', 'landlord', 'contractor', 'agent',
    'body_corporate', 'guarantor', 'insurance_broker', 'other'
  ));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §7  PROPERTY BROKERS  (BUILD_59 — one broker per property)
-- ═══════════════════════════════════════════════════════════════════════════════

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
DROP POLICY IF EXISTS "org_property_brokers" ON property_brokers;
CREATE POLICY "org_property_brokers" ON property_brokers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_property_brokers_broker ON property_brokers(broker_contact_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §8  MANAGING SCHEMES  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Replaces contractor-based Body Corporate pattern. Each scheme can manage
-- multiple properties (via properties.managing_scheme_id FK, re-pointed below).

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
DROP POLICY IF EXISTS "org_managing_schemes" ON managing_schemes;
CREATE POLICY "org_managing_schemes" ON managing_schemes
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_managing_schemes_org     ON managing_schemes(org_id);
CREATE INDEX IF NOT EXISTS idx_managing_schemes_deleted ON managing_schemes(deleted_at);

-- Re-point properties.managing_scheme_id to managing_schemes table
-- (was previously typed as a contractor reference in 007_enhancements.sql).
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_managing_scheme_id_fkey;

ALTER TABLE properties
  ADD CONSTRAINT properties_managing_scheme_id_fkey
  FOREIGN KEY (managing_scheme_id) REFERENCES managing_schemes(id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §9  MAINTENANCE SEVERITY + INSURANCE CLAIM FLAGS  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════════════════
-- §10  INCIDENT NOTIFICATIONS AUDIT LOG  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════

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
DROP POLICY IF EXISTS "org_incident_notifications" ON incident_notifications;
CREATE POLICY "org_incident_notifications" ON incident_notifications
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_incident_notif_request ON incident_notifications(maintenance_request_id);
CREATE INDEX IF NOT EXISTS idx_incident_notif_party   ON incident_notifications(notified_party);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §11  TRIGGERS  (BUILD_59)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Sync has_managing_scheme on managing_scheme_id change
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

-- updated_at triggers for new tables
DROP TRIGGER IF EXISTS update_property_brokers_updated_at ON property_brokers;
CREATE TRIGGER update_property_brokers_updated_at
  BEFORE UPDATE ON property_brokers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_managing_schemes_updated_at ON managing_schemes;
CREATE TRIGGER update_managing_schemes_updated_at
  BEFORE UPDATE ON managing_schemes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ═══════════════════════════════════════════════════════════════════════════════
-- §12  SMART PROPERTY SETUP  (BUILD_60)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Scenario-driven property creation: scenario type, property profile JSONB,
-- universal property questions (WiFi, cell signal, backup power), commercial
-- operating hours, is_lettable flag on units, industrial unit attributes,
-- business use flag on residential units.

-- ── (a) Properties: scenario, managed mode, profile, operating hours ─────────

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS scenario_type text
    CHECK (scenario_type IN (
      'r1','r2','r3','r4','r5',
      'c1','c2','c3','c4',
      'm1','m2',
      'other'
    )),
  ADD COLUMN IF NOT EXISTS scenario_pick_at                timestamptz,
  ADD COLUMN IF NOT EXISTS managed_mode                    text NOT NULL DEFAULT 'self_owned'
    CHECK (managed_mode IN ('self_owned', 'managed_for_owner')),
  ADD COLUMN IF NOT EXISTS property_profile                jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_pct        integer DEFAULT 0
    CHECK (onboarding_completed_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_widget_dismissed_at  timestamptz,

  -- Universal property questions
  ADD COLUMN IF NOT EXISTS wifi_available          text
    CHECK (wifi_available IN ('yes','no','unknown')),
  ADD COLUMN IF NOT EXISTS cell_signal_quality     text
    CHECK (cell_signal_quality IN ('good','patchy','none','unknown')),
  ADD COLUMN IF NOT EXISTS backup_power            text
    CHECK (backup_power IN ('none','ups','inverter','solar','generator','multiple','unknown')),

  -- Commercial operating hours
  ADD COLUMN IF NOT EXISTS operating_hours_preset  text
    CHECK (operating_hours_preset IN (
      'standard_business','extended','retail','24_7','custom'
    )),
  ADD COLUMN IF NOT EXISTS operating_hours_details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS after_hours_access      text
    CHECK (after_hours_access IN ('unrestricted','with_notice','not_permitted')),
  ADD COLUMN IF NOT EXISTS after_hours_notice_hours integer,
  ADD COLUMN IF NOT EXISTS after_hours_notes       text;

-- ── (b) Units: is_lettable + industrial attributes + business use ─────────────

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS is_lettable             boolean NOT NULL DEFAULT true,

  -- Industrial-specific (nullable — only populated for industrial unit types)
  ADD COLUMN IF NOT EXISTS roller_door_count       integer,
  ADD COLUMN IF NOT EXISTS loading_bay_type        text
    CHECK (loading_bay_type IN ('none','drive_in','dock_level','mixed')),
  ADD COLUMN IF NOT EXISTS three_phase_power       boolean,
  ADD COLUMN IF NOT EXISTS three_phase_amps        integer,
  ADD COLUMN IF NOT EXISTS floor_loading           text
    CHECK (floor_loading IN ('standard','heavy','heavy_plus')),
  ADD COLUMN IF NOT EXISTS clear_height_category   text
    CHECK (clear_height_category IN ('3_5m','5_8m','8m_plus')),
  ADD COLUMN IF NOT EXISTS office_component_pct    text
    CHECK (office_component_pct IN ('none','lt_10','10_25','gt_25')),
  ADD COLUMN IF NOT EXISTS has_crane               boolean,
  ADD COLUMN IF NOT EXISTS crane_tonnage           numeric(6,2),
  ADD COLUMN IF NOT EXISTS hazmat_approved         boolean,
  ADD COLUMN IF NOT EXISTS rail_siding             boolean,

  -- Business use flag (residential)
  ADD COLUMN IF NOT EXISTS business_use_permitted  text
    CHECK (business_use_permitted IN (
      'not_permitted','home_office_only','practice_consultancy','commercial_activity'
    )) DEFAULT 'not_permitted';

-- Index for scenario queries
CREATE INDEX IF NOT EXISTS idx_properties_scenario_type ON properties(scenario_type)
  WHERE scenario_type IS NOT NULL;
