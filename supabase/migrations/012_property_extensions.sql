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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
               WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
               WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
               WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
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
  ADD COLUMN IF NOT EXISTS backup_power            text,

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

-- Replay-safe constraint refresh: ADD COLUMN IF NOT EXISTS is a no-op when
-- the column already exists, so any new CHECK values must be applied via
-- DROP/ADD CONSTRAINT to update existing databases.
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_backup_power_check;
ALTER TABLE properties
  ADD CONSTRAINT properties_backup_power_check
  CHECK (backup_power IN ('none','ups','inverter','solar','generator','multiple','unknown'));

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.1  SCENARIO EXPANSION  (BUILD_60 Addendum — 11 → 17 scenarios)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adds r6 (student housing), r7 (farm/smallholding), c5 (standalone retail),
-- c6 (self-storage), m3 (office + residential), m4 (guesthouse / B&B).
-- Also adds 'farm_specialist' to insurance_policy_type.

-- Scenario type CHECK constraint (drop-and-add for idempotency)
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_scenario_type_check;
ALTER TABLE properties
  ADD CONSTRAINT properties_scenario_type_check
  CHECK (scenario_type IN (
    'r1','r2','r3','r4','r5','r6','r7',
    'c1','c2','c3','c4','c5','c6',
    'm1','m2','m3','m4',
    'other'
  ));

-- Insurance policy type gains farm_specialist
ALTER TABLE properties
  DROP CONSTRAINT IF EXISTS properties_insurance_policy_type_check;
ALTER TABLE properties
  ADD CONSTRAINT properties_insurance_policy_type_check
  CHECK (insurance_policy_type IN (
    'standard_buildings','heritage_specialist',
    'commercial_property','sectional_title',
    'farm_specialist','other'
  ));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.2  ADDENDUM_60A: Insurance checklist system
-- ═══════════════════════════════════════════════════════════════════════════════
-- Three tables: catalogue (insurance_checklist_items), per-property instances
-- (property_insurance_checklists), audit (property_insurance_checklist_events).
-- Plus property_insurance_renewal_reminders for the single-reminder lock.
-- Amend-forward into 012_property_extensions.sql — no new migration file.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (a) Catalogue (platform-authored reference data) ─────────────────────────

CREATE TABLE IF NOT EXISTS insurance_checklist_items (
  code                 text PRIMARY KEY,
  label                text NOT NULL,
  description          text NOT NULL,
  help_text            text,
  regulatory_note      text,
  applies_to_scenarios text[] NOT NULL DEFAULT ARRAY[]::text[],
                       -- ARRAY['*'] = universal; specific codes = scenario-gated
  applies_when         jsonb DEFAULT '{}'::jsonb,
                       -- e.g. {"furnishing_status": ["partly_furnished","fully_furnished"]}
  severity             text NOT NULL CHECK (severity IN ('critical', 'important', 'optional')),
  sort_order           integer NOT NULL DEFAULT 0,
  is_auto_derived      boolean NOT NULL DEFAULT false,
                       -- true for POLICY_HEADER — state computed from properties.* fields
  auto_derive_spec     jsonb DEFAULT '{}'::jsonb,
                       -- e.g. {"requires_all_of": ["insurance_provider", ...]}
  evidence_type        text NOT NULL DEFAULT 'agent_confirmation'
                         CHECK (evidence_type IN (
                           'agent_confirmation',
                           'document_upload',
                           'broker_email',
                           'auto_derived'
                         )),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE insurance_checklist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_checklist_items" ON insurance_checklist_items;
CREATE POLICY "auth_read_checklist_items" ON insurance_checklist_items
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_checklist_items_active_sort
  ON insurance_checklist_items(is_active, sort_order);

DROP TRIGGER IF EXISTS update_checklist_items_updated_at ON insurance_checklist_items;
CREATE TRIGGER update_checklist_items_updated_at
  BEFORE UPDATE ON insurance_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── (b) Per-property checklist instances ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS property_insurance_checklists (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES organisations(id),
  property_id            uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  item_code              text NOT NULL REFERENCES insurance_checklist_items(code),
  state                  text NOT NULL DEFAULT 'unknown'
                           CHECK (state IN ('confirmed', 'unknown', 'not_applicable')),
  confirmed_by           uuid REFERENCES auth.users(id),
  confirmed_at           timestamptz,
  confirmed_via          text CHECK (confirmed_via IN (
                           'agent_inline',
                           'owner_response',
                           'broker_pdf_reply',
                           'auto_derived',
                           'document_upload'
                         )),
  evidence_document_id   uuid REFERENCES property_documents(id),
  notes                  text,
  last_renewal_review_at timestamptz,
  renewal_reset_at       timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  UNIQUE (property_id, item_code)
);

ALTER TABLE property_insurance_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_property_insurance_checklists" ON property_insurance_checklists;
CREATE POLICY "org_property_insurance_checklists" ON property_insurance_checklists
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_checklist_property
  ON property_insurance_checklists(property_id, state);
CREATE INDEX IF NOT EXISTS idx_checklist_org_state
  ON property_insurance_checklists(org_id, state)
  WHERE state = 'unknown';

DROP TRIGGER IF EXISTS update_property_checklists_updated_at ON property_insurance_checklists;
CREATE TRIGGER update_property_checklists_updated_at
  BEFORE UPDATE ON property_insurance_checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── (c) Per-state-transition audit ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS property_insurance_checklist_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  uuid NOT NULL REFERENCES property_insurance_checklists(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN (
                  'initialized',
                  'confirmed',
                  'unconfirmed',
                  'marked_not_applicable',
                  'unmarked_not_applicable',
                  'renewal_reset',
                  'evidence_attached',
                  'note_added'
                )),
  prior_state   text,
  new_state     text,
  actor_user_id uuid REFERENCES auth.users(id),
                -- NULL for system actors (auto-derive, cron)
  source        text NOT NULL DEFAULT 'agent'
                  CHECK (source IN ('agent', 'owner', 'broker', 'auto', 'cron')),
  payload       jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE property_insurance_checklist_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_checklist_events" ON property_insurance_checklist_events;
CREATE POLICY "org_checklist_events" ON property_insurance_checklist_events
  FOR ALL USING (
    checklist_id IN (
      SELECT id FROM property_insurance_checklists
      WHERE org_id IN (SELECT org_id FROM user_orgs
                       WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_checklist_events_checklist
  ON property_insurance_checklist_events(checklist_id, created_at DESC);

-- ── (d) Renewal reminder lock (one row per property, upserted each cycle) ────

CREATE TABLE IF NOT EXISTS property_insurance_renewal_reminders (
  property_id  uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  org_id       uuid NOT NULL REFERENCES organisations(id),
  renewal_date date NOT NULL,
  reminded_at  timestamptz NOT NULL DEFAULT now(),
  comm_log_id  uuid REFERENCES communication_log(id)
);

ALTER TABLE property_insurance_renewal_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_renewal_reminders" ON property_insurance_renewal_reminders;
CREATE POLICY "org_renewal_reminders" ON property_insurance_renewal_reminders
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs
               WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.3  FIX: properties.managing_scheme_id → contractors FK (was silently missing)
--   §07 added the column with `... REFERENCES contractors(id)`, but via ADD COLUMN IF NOT
--   EXISTS — so when the column already existed from an earlier run the FK was skipped. Without
--   it PostgREST can't resolve the `contractors!managing_scheme_id` embed, so the owner-tier
--   /properties select 400'd and silently returned null → "No property yet". Re-add it.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'properties_managing_scheme_id_fkey' AND conrelid = 'properties'::regclass
  ) THEN
    ALTER TABLE properties
      ADD CONSTRAINT properties_managing_scheme_id_fkey
      FOREIGN KEY (managing_scheme_id) REFERENCES contractors(id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.4  PRE-SCALE PERFORMANCE INDEXES (properties / units / inspections)
--   Gap-fill ahead of scale (target ~160k properties): hot list ORDER, calendar
--   date-range scans (scheduled_date had no index), and join/cascade FKs flagged by
--   the Supabase performance advisor. Additive + idempotent. See also 004 / 005 / 011.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Properties list: WHERE org_id AND deleted_at IS NULL ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_properties_org_created_active
  ON properties(org_id, created_at DESC) WHERE deleted_at IS NULL;

-- Units in a building (building detail + FK cascade)
CREATE INDEX IF NOT EXISTS idx_units_building
  ON units(building_id) WHERE building_id IS NOT NULL;

-- Inspections calendar: WHERE org_id AND scheduled_date BETWEEN … (no date index existed)
CREATE INDEX IF NOT EXISTS idx_inspections_org_scheduled
  ON inspections(org_id, scheduled_date);

-- Inspections by property (property detail + FK cascade)
CREATE INDEX IF NOT EXISTS idx_inspections_property
  ON inspections(property_id) WHERE property_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.5  BUILD_69 Phase 1: durable-vs-per-lease field model (the ONE genuinely net-new field)
-- ═══════════════════════════════════════════════════════════════════════════════
-- BUILD_69 Component D classifies every property/lease field durable / per-lease / straddle. CC grounding
-- (2026-06-11) found all but one already have a live column — including the durable inspection ROOM TEMPLATE,
-- which already exists as unit_inspection_profiles + unit_inspection_profile_rooms (BUILD_57 §2 above) and is
-- what moment-5 (ingoing) reads. The single net-new field:
--   STRADDLE — a default lease period stored on the unit (advertised at listing, confirmed/overridden per
--   lease). No durable default existed; leases carry only the per-lease start_date/end_date.
-- (The column also existed live ad-hoc; this records it so a fresh replay matches prod — drift → zero.)
ALTER TABLE units ADD COLUMN IF NOT EXISTS default_lease_period_months integer;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §12.6  ADDENDUM_69A: durable default deposit amount on the unit (separable)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A durable deposit-AMOUNT prefill (distinct from deposit interest), advertised/confirmed per lease the
-- same way default_lease_period_months is. Low legal risk (a prefill the agent confirms, not a binding
-- rule); sets up O-22 (furnishing-based deposit). Decoupled from the accounts/interest core.
ALTER TABLE units ADD COLUMN IF NOT EXISTS default_deposit_cents integer;
