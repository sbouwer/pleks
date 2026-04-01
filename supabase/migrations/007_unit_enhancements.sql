-- 007_unit_enhancements.sql
-- Adds deposit_amount_cents and managed_by to units

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer,
  ADD COLUMN IF NOT EXISTS managed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_units_managed_by ON units(managed_by);
