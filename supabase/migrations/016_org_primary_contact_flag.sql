-- 016_org_primary_contact_flag.sql
-- Tracks whether the primary contact (director/principal) is also a system user.
-- Default true. Set to false when the contact is a non-login principal.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS primary_contact_is_user boolean DEFAULT true;
