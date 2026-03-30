-- 039_fix_user_orgs_rls.sql — Fix infinite recursion in user_orgs RLS

-- The user_orgs_org_select policy causes infinite recursion because
-- it subqueries user_orgs FROM user_orgs. Postgres evaluates ALL
-- policies (OR'd), so the recursive one fires even when the simple
-- user_orgs_own_select would suffice.

-- Drop the recursive policy
DROP POLICY IF EXISTS "user_orgs_org_select" ON user_orgs;

-- The remaining policies are:
--   user_orgs_own_select: user can see their own memberships
--   user_orgs_insert: user can insert their own membership
--
-- For viewing other org members (team page), use service client
-- or a SECURITY DEFINER function.
