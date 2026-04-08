-- 021_landlord_portal_comms_payment.sql
-- Consolidates: landlord portal access, maintenance contact fields,
-- communication log/preferences, and payment_due_day type change.
-- Fully idempotent — safe to re-run on any DB state.

-- ═══════════════════════════════════════════════════════════════════════
-- Landlord portal: auth + RLS
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS auth_user_id         uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS portal_access_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_status        text DEFAULT 'none'
    CHECK (portal_status IN ('none', 'invited', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS portal_invited_at    timestamptz,
  ADD COLUMN IF NOT EXISTS portal_last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_landlords_auth_user_id
  ON landlords(auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'landlords' AND policyname = 'landlord_portal_self') THEN
    CREATE POLICY "landlord_portal_self" ON landlords
      FOR SELECT USING (auth_user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'landlord_portal_properties') THEN
    CREATE POLICY "landlord_portal_properties" ON properties
      FOR SELECT USING (
        landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'units' AND policyname = 'landlord_portal_units') THEN
    CREATE POLICY "landlord_portal_units" ON units
      FOR SELECT USING (
        property_id IN (
          SELECT id FROM properties WHERE landlord_id IN (
            SELECT id FROM landlords WHERE auth_user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_requests' AND policyname = 'landlord_portal_maintenance') THEN
    CREATE POLICY "landlord_portal_maintenance" ON maintenance_requests
      FOR SELECT USING (
        property_id IN (
          SELECT id FROM properties WHERE landlord_id IN (
            SELECT id FROM landlords WHERE auth_user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'owner_statements' AND policyname = 'landlord_portal_statements') THEN
    CREATE POLICY "landlord_portal_statements" ON owner_statements
      FOR SELECT USING (
        landlord_id IN (SELECT id FROM landlords WHERE auth_user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leases' AND policyname = 'landlord_portal_leases') THEN
    CREATE POLICY "landlord_portal_leases" ON leases
      FOR SELECT USING (
        property_id IN (
          SELECT id FROM properties WHERE landlord_id IN (
            SELECT id FROM landlords WHERE auth_user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- Maintenance: access contact fields
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS contact_name       text,
  ADD COLUMN IF NOT EXISTS contact_phone      text,
  ADD COLUMN IF NOT EXISTS contact_preference text;

COMMENT ON COLUMN maintenance_requests.contact_name  IS 'Name of the person who will provide access for the maintenance visit.';
COMMENT ON COLUMN maintenance_requests.contact_phone IS 'Phone number of the access contact.';


-- ═══════════════════════════════════════════════════════════════════════
-- Communication log: patch existing table + create preferences
-- ═══════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE comm_channel AS ENUM ('email', 'sms', 'whatsapp_future');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comm_status AS ENUM ('sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS template_key   text,
  ADD COLUMN IF NOT EXISTS recipient_name text;

CREATE INDEX IF NOT EXISTS idx_comm_log_org       ON communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_entity    ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_recipient ON communication_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_template  ON communication_log(template_key, org_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_provider  ON communication_log(external_id) WHERE external_id IS NOT NULL;

ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "comm_log_org_select" ON communication_log
    FOR SELECT USING (
      org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS communication_preferences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES organisations(id),
  contact_id            uuid        REFERENCES contacts(id),
  email                 text,
  unsubscribe_token     text        DEFAULT encode(gen_random_bytes(24), 'hex'),
  email_applications    boolean     NOT NULL DEFAULT true,
  email_maintenance     boolean     NOT NULL DEFAULT true,
  email_arrears         boolean     NOT NULL DEFAULT true,
  email_inspections     boolean     NOT NULL DEFAULT true,
  email_lease           boolean     NOT NULL DEFAULT true,
  email_statements      boolean     NOT NULL DEFAULT true,
  sms_maintenance       boolean     NOT NULL DEFAULT true,
  sms_arrears           boolean     NOT NULL DEFAULT true,
  sms_inspections       boolean     NOT NULL DEFAULT true,
  unsubscribed_at       timestamptz,
  email_hard_bounced    boolean     NOT NULL DEFAULT false,
  email_hard_bounced_at timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Patch columns in case the table existed but was partially created
ALTER TABLE communication_preferences
  ADD COLUMN IF NOT EXISTS contact_id            uuid REFERENCES contacts(id),
  ADD COLUMN IF NOT EXISTS email                 text,
  ADD COLUMN IF NOT EXISTS unsubscribe_token     text DEFAULT encode(gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS email_applications    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_maintenance     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_arrears         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_inspections     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_lease           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_statements      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_maintenance       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_arrears           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_inspections       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unsubscribed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS email_hard_bounced    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_hard_bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz NOT NULL DEFAULT now();

-- Deduplicate before adding UNIQUE constraints
DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid
    AND a.unsubscribe_token IS NOT NULL
    AND a.unsubscribe_token = b.unsubscribe_token;

DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid
    AND a.org_id = b.org_id
    AND a.contact_id IS NOT NULL
    AND a.contact_id = b.contact_id;

DELETE FROM communication_preferences a USING communication_preferences b
  WHERE a.ctid < b.ctid
    AND a.org_id = b.org_id
    AND a.email IS NOT NULL
    AND a.email = b.email;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_token_unique' AND conrelid = 'communication_preferences'::regclass
  ) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_token_unique UNIQUE (unsubscribe_token);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_org_contact' AND conrelid = 'communication_preferences'::regclass
  ) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_contact UNIQUE (org_id, contact_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comm_prefs_org_email' AND conrelid = 'communication_preferences'::regclass
  ) THEN
    ALTER TABLE communication_preferences ADD CONSTRAINT comm_prefs_org_email UNIQUE (org_id, email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comm_prefs_contact ON communication_preferences(contact_id);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email   ON communication_preferences(email);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_token   ON communication_preferences(unsubscribe_token);

ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "comm_prefs_org" ON communication_preferences
    FOR ALL USING (
      org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE communication_log         IS 'Immutable log of every outbound email/SMS. Status updated via provider webhooks.';
COMMENT ON TABLE communication_preferences IS 'Per-recipient communication opt-out preferences. Mandatory templates bypass these checks.';


-- ═══════════════════════════════════════════════════════════════════════
-- leases.payment_due_day: drop integer CHECK constraint, change to text
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leases'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%payment_due_day%'
  LOOP
    EXECUTE format('ALTER TABLE leases DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE leases
  ALTER COLUMN payment_due_day TYPE text USING payment_due_day::text;

ALTER TABLE leases
  ALTER COLUMN payment_due_day SET DEFAULT '1';

COMMENT ON COLUMN leases.payment_due_day IS
  'Day rent is due. Numeric string ("1"–"28") for a fixed day, "last_day" for last calendar day, "last_working_day" for last business day.';
