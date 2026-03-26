-- 038_auth_helpers.sql — Email existence check for onboarding

CREATE OR REPLACE FUNCTION check_email_exists(p_email text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(p_email)
  );
$$ LANGUAGE sql SECURITY DEFINER
   SET search_path = auth, public;
