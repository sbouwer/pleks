-- ADDENDUM_18A: HOA Levy Calculation Engine — floor area column
-- The levy calculation engine queries units(floor_area_m2, ...) for the
-- floor_area_m2 method. units already has size_m2 (gross unit size), but
-- floor_area_m2 is the net lettable / sectionable area used for levy splits.
-- They are conceptually different; both are kept.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS floor_area_m2 numeric(8,2);

COMMENT ON COLUMN units.floor_area_m2 IS
  'Net floor area in m² used for HOA levy calculations (floor_area_m2 method). '
  'Distinct from size_m2 which is gross unit size.';
