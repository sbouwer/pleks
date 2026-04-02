-- 012_org_details.sql
-- Add missing organisation identity columns.
-- eaab_number is separate from reg_number:
--   reg_number = CIPC company registration (agencies)
--   eaab_number = EAAB Fidelity Fund Certificate (agencies + registered agents)

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS eaab_number text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS website    text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS vat_number text;
