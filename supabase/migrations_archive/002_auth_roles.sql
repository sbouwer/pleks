-- 002_auth_roles.sql
-- Auto-create profile on signup, helper functions

-- Auto-create user_profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Helper: get current user's org_id
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM user_orgs
  WHERE user_id = auth.uid()
  AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get current user's tier
CREATE OR REPLACE FUNCTION get_current_tier()
RETURNS text AS $$
  SELECT s.tier FROM subscriptions s
  JOIN user_orgs uo ON uo.org_id = s.org_id
  WHERE uo.user_id = auth.uid()
  AND uo.deleted_at IS NULL
  AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: does current org have confirmed trust account?
CREATE OR REPLACE FUNCTION org_has_trust_account()
RETURNS boolean AS $$
  SELECT COALESCE(has_trust_account, false)
  FROM organisations
  WHERE id = get_current_org_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
