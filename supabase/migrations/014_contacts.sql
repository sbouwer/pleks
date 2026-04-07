-- 014_contacts.sql
-- FICA fields for the mandated signatory (director / authorised person)
-- on juristic/company tenant records.
-- contact_first_name / contact_last_name already exist in 002_contacts.sql.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_id_type        text,
  ADD COLUMN IF NOT EXISTS contact_id_number      text,
  ADD COLUMN IF NOT EXISTS contact_id_number_hash text,
  ADD COLUMN IF NOT EXISTS contact_date_of_birth  date,
  ADD COLUMN IF NOT EXISTS contact_phone          text,
  ADD COLUMN IF NOT EXISTS contact_email          text;
