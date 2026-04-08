-- 019_contractor_portal_status.sql
-- ADDENDUM_19A: Adds explicit portal_status column to contractors.
-- Derived state can be computed from existing columns but 'suspended'
-- requires a separate field. Status is updated by portal invite flow.

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS portal_status text DEFAULT 'none'
  CHECK (portal_status IN ('none', 'invited', 'active', 'suspended'));

-- Back-fill from existing columns for existing rows
UPDATE contractors
  SET portal_status =
    CASE
      WHEN portal_access_enabled = true AND auth_user_id IS NOT NULL THEN 'active'
      WHEN portal_access_enabled = true AND auth_user_id IS NULL     THEN 'invited'
      ELSE 'none'
    END
  WHERE portal_status = 'none';
