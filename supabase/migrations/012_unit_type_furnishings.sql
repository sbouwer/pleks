-- 012_unit_type_furnishings.sql
-- Adds unit_type, furnishing_status (replaces boolean furnished), and
-- unit_furnishings inventory table.  Fully idempotent — safe to re-run.

-- ── Unit type ─────────────────────────────────────────────────────────────────
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_type text;

-- ── Furnishing status (three-way, replaces boolean furnished) ─────────────────
ALTER TABLE units ADD COLUMN IF NOT EXISTS furnishing_status text
  DEFAULT 'unfurnished'
  CHECK (furnishing_status IN ('unfurnished', 'semi_furnished', 'furnished'));

-- Migrate from legacy boolean
UPDATE units SET furnishing_status = 'furnished'   WHERE furnished = true  AND furnishing_status = 'unfurnished';
UPDATE units SET furnishing_status = 'unfurnished' WHERE furnished = false AND furnishing_status = 'unfurnished';

-- ── Furnishing inventory ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unit_furnishings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  unit_id     uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  category    text NOT NULL,     -- kitchen / lounge / dining / bedroom / bathroom / outdoor / general
  item_name   text NOT NULL,
  quantity    int  NOT NULL DEFAULT 1,
  condition   text,              -- excellent / good / fair / poor — set at move-in inspection
  notes       text,              -- 'Samsung 350L silver'
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

-- ── Backfill unit_type for legacy units ───────────────────────────────────────
-- Simple heuristic: bedrooms=0 → studio, otherwise apartment. Commercial
-- units are flagged via the property type and left unset for manual correction.
UPDATE units SET unit_type = 'studio'    WHERE unit_type IS NULL AND bedrooms = 0;
UPDATE units SET unit_type = 'apartment' WHERE unit_type IS NULL AND bedrooms IS NOT NULL AND bedrooms > 0;
-- units with NULL bedrooms remain NULL (agent sets manually)
