-- BUILD_32: Org-level lease branding columns
-- Used by /api/org/branding (GET/PATCH) and LeaseBrandingSection component.
-- lease_logo_path stores a Supabase Storage path; a signed URL is generated at read time.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS lease_logo_path            text,
  ADD COLUMN IF NOT EXISTS lease_display_name         text,
  ADD COLUMN IF NOT EXISTS lease_registration_number  text,
  ADD COLUMN IF NOT EXISTS lease_address              text,
  ADD COLUMN IF NOT EXISTS lease_phone                text,
  ADD COLUMN IF NOT EXISTS lease_email                text,
  ADD COLUMN IF NOT EXISTS lease_website              text,
  ADD COLUMN IF NOT EXISTS lease_accent_color         text;

COMMENT ON COLUMN organisations.lease_logo_path           IS 'Storage path to org logo used on generated leases';
COMMENT ON COLUMN organisations.lease_display_name        IS 'Trading name shown on lease cover page (falls back to name)';
COMMENT ON COLUMN organisations.lease_registration_number IS 'EAAB / company reg number shown on lease cover page';
COMMENT ON COLUMN organisations.lease_accent_color        IS 'Hex accent colour for divider lines on generated lease PDF';
