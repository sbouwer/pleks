-- 044_contractor_extended_fields.sql — TPN vendor import fields

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS contact_first_name  text,
  ADD COLUMN IF NOT EXISTS contact_last_name   text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS trust_number        text,
  ADD COLUMN IF NOT EXISTS vat_number          text,
  ADD COLUMN IF NOT EXISTS vendor_type         text,
  ADD COLUMN IF NOT EXISTS tpn_reference       text,
  ADD COLUMN IF NOT EXISTS tpn_entity_id       text,
  ADD COLUMN IF NOT EXISTS created_by          uuid REFERENCES auth.users(id);
