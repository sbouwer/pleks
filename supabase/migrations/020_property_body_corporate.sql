-- Body corporate / sectional title attributes on properties
-- Managing scheme is a supplier (contractors table)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_sectional_title  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS managing_scheme_id  uuid REFERENCES contractors(id),
  ADD COLUMN IF NOT EXISTS levy_amount_cents    integer,
  ADD COLUMN IF NOT EXISTS levy_account_number text;
