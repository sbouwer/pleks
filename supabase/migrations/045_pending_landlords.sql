-- 045_pending_landlords.sql
-- SUPERSEDED — pending_landlords staging table replaced by landlords table (005_contacts.sql)
-- Landlords are now first-class contacts with primary_role = 'landlord'.
-- The landlords thin table in 005_contacts.sql replaces the staging pattern.
-- Agent dedup function and invites.metadata column remain useful — kept here.

-- Invites metadata column (used by agent import in BUILD_23)
ALTER TABLE invites ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Agent dedup helper function
CREATE OR REPLACE FUNCTION get_org_member_by_email(
  p_org_id uuid,
  p_email  text
) RETURNS uuid AS $$
  SELECT uo.user_id
  FROM user_orgs uo
  JOIN auth.users u ON u.id = uo.user_id
  WHERE uo.org_id = p_org_id
    AND lower(u.email) = lower(p_email)
    AND uo.deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
