-- 013_inspection_profiles.sql
-- Unit inspection profile: stores the room list that drives inspection templates.
-- Each unit has at most one profile (UNIQUE constraint on unit_id).
-- Fully idempotent — safe to re-run.

-- ── Profile header ─────────────────────────────────────────────────────────────
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
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- ── Profile rooms ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_inspection_profile_rooms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  profile_id  uuid NOT NULL REFERENCES unit_inspection_profiles(id) ON DELETE CASCADE,
  room_type   text NOT NULL,   -- canonical type: kitchen, bedroom, bathroom, etc.
  label       text NOT NULL,   -- display name (editable by agent)
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
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- ── Link furnishings to rooms ──────────────────────────────────────────────────
-- Allows each furnishing item to reference which room it belongs to.
-- room_type is denormalised (not FK'd to profile_rooms) for simplicity.
ALTER TABLE unit_furnishings ADD COLUMN IF NOT EXISTS room_type text;
