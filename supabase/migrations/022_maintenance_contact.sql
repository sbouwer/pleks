-- 022_maintenance_contact.sql
-- Adds contact_name / contact_phone to maintenance_requests so the form can
-- record who will provide access for the maintenance visit (tenant, agent, or landlord).

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_phone text;

COMMENT ON COLUMN maintenance_requests.contact_name  IS
  'Name of the person who will provide access for the maintenance visit.';
COMMENT ON COLUMN maintenance_requests.contact_phone IS
  'Phone number of the access contact.';
