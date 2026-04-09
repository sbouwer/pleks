-- ADDENDUM_06A: Maintenance cost split — tenant charge recovery
-- Adds 'maintenance_recovery' to lease_charges.charge_type so tenant charges
-- created during maintenance sign-off can be tracked as a distinct type.

ALTER TABLE lease_charges
  DROP CONSTRAINT IF EXISTS lease_charges_charge_type_check;

ALTER TABLE lease_charges
  ADD CONSTRAINT lease_charges_charge_type_check
  CHECK (charge_type IN (
    'body_corporate_levy', 'special_levy', 'parking',
    'water_flat_rate', 'electricity_flat_rate',
    'garden_service', 'security', 'internet',
    'maintenance_recovery', 'other'
  ));

COMMENT ON COLUMN lease_charges.charge_type IS
  'maintenance_recovery = charge created via maintenance sign-off cost split';
