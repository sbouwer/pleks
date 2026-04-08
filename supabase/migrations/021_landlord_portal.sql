-- Migration 021: Landlord portal access
-- Adds auth fields to landlords table + RLS policies for portal access

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS auth_user_id          uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS portal_status         text DEFAULT 'none'
    CHECK (portal_status IN ('none', 'invited', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS portal_invited_at     timestamptz,
  ADD COLUMN IF NOT EXISTS portal_last_login_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_landlords_auth_user_id ON landlords(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ── RLS: landlords can read their own record ─────────────────────────
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'landlords' AND policyname = 'landlord_portal_self'
  ) THEN
    CREATE POLICY "landlord_portal_self" ON landlords
      FOR SELECT USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- ── RLS: landlords can read their own properties ─────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'properties' AND policyname = 'landlord_portal_properties'
  ) THEN
    CREATE POLICY "landlord_portal_properties" ON properties
      FOR SELECT USING (
        landlord_id IN (
          SELECT id FROM landlords WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── RLS: landlords can read units for their properties ───────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'units' AND policyname = 'landlord_portal_units'
  ) THEN
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

-- ── RLS: landlords can read maintenance for their properties ─────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'maintenance_requests' AND policyname = 'landlord_portal_maintenance'
  ) THEN
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

-- ── RLS: landlords can read their owner statements ───────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'owner_statements' AND policyname = 'landlord_portal_statements'
  ) THEN
    CREATE POLICY "landlord_portal_statements" ON owner_statements
      FOR SELECT USING (
        landlord_id IN (
          SELECT id FROM landlords WHERE auth_user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ── RLS: landlords can read leases for their properties (name only in UI) ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'leases' AND policyname = 'landlord_portal_leases'
  ) THEN
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
