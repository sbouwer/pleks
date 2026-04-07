-- 009_unit_clause_defaults.sql
-- Per-unit clause toggle overrides.
-- Stores ONLY the clauses that differ from org defaults for this unit.
-- Driven by unit physical features (garden, aircon, pool, etc.)
-- Does NOT store custom wording — that lives at org or per-lease level.
-- Idempotent: CREATE TABLE IF NOT EXISTS, policy wrapped in DO $$.

CREATE TABLE IF NOT EXISTS unit_clause_defaults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  unit_id     uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  clause_key  text NOT NULL REFERENCES lease_clause_library(clause_key),
  enabled     boolean NOT NULL,
  auto_set    boolean NOT NULL DEFAULT false,  -- true if set by feature auto-mapping
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unit_id, clause_key)
);

CREATE INDEX IF NOT EXISTS idx_unit_clause_defaults_unit ON unit_clause_defaults(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_clause_defaults_org  ON unit_clause_defaults(org_id);

ALTER TABLE unit_clause_defaults ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'unit_clause_defaults'
    AND policyname = 'org_unit_clause_defaults'
  ) THEN
    CREATE POLICY "org_unit_clause_defaults" ON unit_clause_defaults
      FOR ALL USING (
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_unit_clause_defaults_updated_at'
  ) THEN
    CREATE TRIGGER update_unit_clause_defaults_updated_at
      BEFORE UPDATE ON unit_clause_defaults
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE unit_clause_defaults IS
  'Per-unit optional clause overrides. Stores only toggles that differ from org_lease_clause_defaults. '
  'auto_set=true means this was set by feature-to-clause auto-mapping and can be recalculated if features change.';
