-- ═══════════════════════════════════════════════════════════════════════════════
-- 010_addenda.sql
-- Merged addenda: tenant portal (010), bank feeds (011), receipt path (012),
--                 operating hours (023), agent profile / multi-role (024),
--                 team member personal fields (025)
-- Replaces the individual 010–012 and 023–024 files.
-- All statements use IF NOT EXISTS / IF EXISTS so re-running is safe.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §1  TENANT PORTAL  (was 010_tenant_portal.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1a. Link tenant records to Supabase auth users
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_tenants_auth_user_id
  ON tenants(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- 1b. Maintenance request portal columns
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS reported_via text
    NOT NULL DEFAULT 'dashboard'
    CHECK (reported_via IN ('dashboard', 'portal', 'email', 'phone')),
  ADD COLUMN IF NOT EXISTS tenant_reported_urgency text
    CHECK (tenant_reported_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic')),
  ADD COLUMN IF NOT EXISTS ai_suggested_urgency text
    CHECK (ai_suggested_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic'));

-- 1c. Tenant portal tokens
CREATE TABLE IF NOT EXISTS tenant_portal_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  lease_id    uuid NOT NULL REFERENCES leases(id),
  token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked     boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_token
  ON tenant_portal_tokens(token)
  WHERE NOT revoked;

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_tenant
  ON tenant_portal_tokens(tenant_id);

ALTER TABLE tenant_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_tenant_portal_tokens" ON tenant_portal_tokens;
CREATE POLICY "org_tenant_portal_tokens" ON tenant_portal_tokens
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));

-- 1d. Inspection reschedule requests
CREATE TABLE IF NOT EXISTS inspection_reschedule_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  inspection_id   uuid NOT NULL REFERENCES inspections(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  reason          text NOT NULL,
  proposed_dates  date[] NOT NULL,
  note            text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'declined', 'countered')),
  agent_response  text,
  resolved_date   date,
  resolved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_inspection
  ON inspection_reschedule_requests(inspection_id);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_tenant
  ON inspection_reschedule_requests(tenant_id);

ALTER TABLE inspection_reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_reschedule_requests" ON inspection_reschedule_requests;
CREATE POLICY "org_reschedule_requests" ON inspection_reschedule_requests
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));

-- 1e. Maintenance delay events
CREATE TABLE IF NOT EXISTS maintenance_delay_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  maintenance_id    uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  delay_type        text NOT NULL CHECK (delay_type IN (
    'tenant_not_available', 'tenant_rescheduled', 'tenant_no_response',
    'tenant_denied_access', 'contractor_no_show', 'contractor_rescheduled',
    'contractor_no_response', 'contractor_returned_incomplete',
    'agent_pending_approval', 'agent_pending_quote_review',
    'agent_pending_landlord_approval', 'parts_on_order', 'weather', 'access_issue_other'
  )),
  attributed_to     text NOT NULL CHECK (attributed_to IN ('tenant', 'contractor', 'agent', 'external')),
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  original_date     date,
  rescheduled_to    date,
  note              text,
  recorded_by       uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_delay_events_request ON maintenance_delay_events(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_maint_delay_events_org     ON maintenance_delay_events(org_id);

ALTER TABLE maintenance_delay_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_delay_events" ON maintenance_delay_events;
CREATE POLICY "org_delay_events" ON maintenance_delay_events
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §2  BANK FEEDS  (was 011_bank_feeds.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE bank_statement_imports
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'upload'
  CHECK (import_source IN ('upload', 'yodlee', 'ofx', 'csv', 'qif'));

ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_stmt_lines_external_id
  ON bank_statement_lines(org_id, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS yodlee_user_id         text,
  ADD COLUMN IF NOT EXISTS yodlee_user_created_at timestamptz;

CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  bank_account_id             uuid REFERENCES bank_accounts(id),
  yodlee_provider_account_id  text NOT NULL,
  yodlee_account_id           text,
  yodlee_provider_id          text,
  bank_name                   text NOT NULL,
  account_mask                text,
  account_type                text,
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_synced_at              timestamptz,
  last_sync_status            text CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_error             text,
  last_sync_txn_count         integer DEFAULT 0,
  last_sync_matched_count     integer DEFAULT 0,
  next_sync_after             timestamptz,
  billing_active              boolean NOT NULL DEFAULT true,
  billing_started_at          timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  disconnected_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bank_feed_conn_org
  ON bank_feed_connections(org_id)
  WHERE status = 'active';

ALTER TABLE bank_feed_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_feed_conn_select ON bank_feed_connections;
CREATE POLICY bank_feed_conn_select ON bank_feed_connections
  FOR SELECT USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_insert ON bank_feed_connections;
CREATE POLICY bank_feed_conn_insert ON bank_feed_connections
  FOR INSERT WITH CHECK (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

DROP POLICY IF EXISTS bank_feed_conn_update ON bank_feed_connections;
CREATE POLICY bank_feed_conn_update ON bank_feed_connections
  FOR UPDATE USING (org_id = (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §3  RECEIPT PATH  (was 012_receipt_path.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_path text;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §4  OPERATING HOURS & EMERGENCY CONTACT  (was 023_operating_hours.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS office_hours_monday           text,
  ADD COLUMN IF NOT EXISTS office_hours_tuesday          text,
  ADD COLUMN IF NOT EXISTS office_hours_wednesday        text,
  ADD COLUMN IF NOT EXISTS office_hours_thursday         text,
  ADD COLUMN IF NOT EXISTS office_hours_friday           text,
  ADD COLUMN IF NOT EXISTS office_hours_saturday         text,
  ADD COLUMN IF NOT EXISTS office_hours_sunday           text,
  ADD COLUMN IF NOT EXISTS office_hours_public_holidays  text,
  ADD COLUMN IF NOT EXISTS emergency_phone               text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name        text,
  ADD COLUMN IF NOT EXISTS emergency_instructions        text,
  ADD COLUMN IF NOT EXISTS emergency_email               text;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §5  AGENT PROFILE & MULTI-ROLE  (was 024_agent_profile.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Personal emergency contact per agent (Portfolio/Firm tier)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS emergency_phone         text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  text;

-- Multi-role support: primary role kept in user_orgs.role for RLS compat
ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS additional_roles text[] NOT NULL DEFAULT '{}';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §6  TEAM MEMBER PERSONAL FIELDS  (new — 025)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extend user_profiles for editable personal details
-- full_name kept for backwards compat; first/last used in team modal
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS title      text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS mobile     text;

COMMENT ON COLUMN user_profiles.title      IS 'Salutation: Mr, Mrs, Ms, Dr, etc.';
COMMENT ON COLUMN user_profiles.first_name IS 'Given name — used to compose full_name';
COMMENT ON COLUMN user_profiles.last_name  IS 'Surname';
COMMENT ON COLUMN user_profiles.mobile     IS 'Personal mobile number';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §7  ORG CUSTOM ROLE LIBRARY  (new — 026)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Free-form role/job-title labels defined per org.
-- user_orgs.role stores either a system slug (owner, property_manager, …) or a
-- custom label from this list.  No permission logic is derived from the value —
-- it is purely a display/organisational label.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS custom_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN organisations.custom_roles IS
  'Org-defined reusable role labels shown in the team member role picker';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §8  ADMIN / USER PERMISSION FLAG  (BUILD_56)
-- ═══════════════════════════════════════════════════════════════════════════════

-- is_admin controls destructive actions (delete/archive, manage team).
-- role stays as a free-text display label — no permission logic derived from it.
-- Owner (role = 'owner') is always implicitly admin; is_admin only matters
-- for non-owner members.

ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_orgs.is_admin IS
  'Grants admin privileges (delete, archive, manage team) to non-owner members. '
  'Owner is always admin regardless of this flag.';

-- Drop the old CHECK constraint that limited role to 5 system slugs.
-- role is now a free-text display label (BUILD_55 custom roles).
ALTER TABLE user_orgs DROP CONSTRAINT IF EXISTS user_orgs_role_check;

-- Re-add a loose constraint: role must be a non-empty string.
ALTER TABLE user_orgs DROP CONSTRAINT IF EXISTS user_orgs_role_nonempty;
ALTER TABLE user_orgs ADD CONSTRAINT user_orgs_role_nonempty
  CHECK (role IS NOT NULL AND length(trim(role)) > 0);

-- Belt-and-suspenders: mark existing owners as is_admin = true.
-- Functionally redundant (owner always isAdmin), but makes audit queries easier.
UPDATE user_orgs SET is_admin = true WHERE role = 'owner' AND is_admin = false;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §9  OWNERSHIP TRANSFERS  (BUILD_56 Phase 1)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tracks pending ownership transfer requests.
-- Owner initiates → new owner receives email → clicks confirm → roles swap.
CREATE TABLE IF NOT EXISTS ownership_transfers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL,
  to_user_id   uuid NOT NULL,
  token        uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_token
  ON ownership_transfers(token)
  WHERE accepted_at IS NULL;

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_ownership_transfers" ON ownership_transfers;
CREATE POLICY "org_ownership_transfers" ON ownership_transfers
  FOR ALL
  USING  (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §10  INSPECTION STORAGE  (was 011_inspection_storage.sql)
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
-- §11  UNIT TYPE & FURNISHINGS  (was 012_unit_type_furnishings.sql)
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
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unit_furnishings_unit ON unit_furnishings(unit_id);

ALTER TABLE unit_furnishings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unit_furnishings'
    AND policyname = 'org unit furnishings access'
  ) THEN
    CREATE POLICY "org unit furnishings access" ON unit_furnishings
      FOR ALL TO authenticated
      USING (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      );
  END IF;
END $$;

-- Backfill unit_type for legacy units
UPDATE units SET unit_type = 'studio'    WHERE unit_type IS NULL AND bedrooms = 0;
UPDATE units SET unit_type = 'apartment' WHERE unit_type IS NULL AND bedrooms IS NOT NULL AND bedrooms > 0;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §12  INSPECTION PROFILES  (was 013_inspection_profiles.sql)
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unit_inspection_profiles'
    AND policyname = 'org unit inspection profiles access'
  ) THEN
    CREATE POLICY "org unit inspection profiles access" ON unit_inspection_profiles
      FOR ALL TO authenticated
      USING (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      );
  END IF;
END $$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unit_inspection_profile_rooms'
    AND policyname = 'org unit inspection profile rooms access'
  ) THEN
    CREATE POLICY "org unit inspection profile rooms access" ON unit_inspection_profile_rooms
      FOR ALL TO authenticated
      USING (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      );
  END IF;
END $$;

ALTER TABLE unit_furnishings ADD COLUMN IF NOT EXISTS room_type text;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §13  LEASE NOTES  (was 014_lease_notes.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lease_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  note_type   text NOT NULL CHECK (note_type IN ('tenant', 'owner', 'general')),
  body        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_notes_lease ON lease_notes(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_notes_org   ON lease_notes(org_id);

ALTER TABLE lease_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lease_notes'
    AND policyname = 'org lease notes access'
  ) THEN
    CREATE POLICY "org lease notes access" ON lease_notes
      FOR ALL TO authenticated
      USING (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      )
      WITH CHECK (
        org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
      );
  END IF;
END $$;

-- Commercial leases should never have cpa_applies = true.
UPDATE leases
  SET cpa_applies = false
  WHERE lease_type = 'commercial'
    AND cpa_applies = true;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §14  LEASE DOCUMENTS  (was 015_lease_documents.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lease_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN (
                    'signed_lease',
                    'welcome_pack_tenant',
                    'welcome_pack_landlord',
                    'lod',
                    's14_notice',
                    'section_4_notice',
                    'tribunal_submission',
                    'statement_tenant',
                    'statement_owner',
                    'inspection_report',
                    'amendment',
                    'other'
                  )),
  title           text NOT NULL,
  storage_path    text NOT NULL,
  file_size_bytes bigint,
  generated_by    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_documents_lease ON lease_documents(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_org   ON lease_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_type  ON lease_documents(doc_type);

ALTER TABLE lease_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lease_docs_org_select" ON lease_documents;
CREATE POLICY "lease_docs_org_select" ON lease_documents
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_insert" ON lease_documents;
CREATE POLICY "lease_docs_org_insert" ON lease_documents
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_delete" ON lease_documents;
CREATE POLICY "lease_docs_org_delete" ON lease_documents
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
