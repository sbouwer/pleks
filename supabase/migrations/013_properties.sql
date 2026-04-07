-- 013_properties.sql
-- Properties table enhancements: body corporate / sectional title attributes.
-- Managing scheme is a supplier (contractors table).
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_sectional_title  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS managing_scheme_id  uuid REFERENCES contractors(id),
  ADD COLUMN IF NOT EXISTS levy_amount_cents    integer,
  ADD COLUMN IF NOT EXISTS levy_account_number text;
