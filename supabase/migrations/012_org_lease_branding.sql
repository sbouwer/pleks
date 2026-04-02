-- 012_org_lease_branding.sql
-- Lease branding fields for agency letterhead on generated leases.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_logo_path text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_display_name text;         -- may differ from org.name
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_registration_number text;  -- EAAB or company reg
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_address text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_phone text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_email text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_website text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lease_accent_color text;         -- hex, e.g. #1D4ED8
