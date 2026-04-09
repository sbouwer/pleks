-- Run this in Supabase SQL Editor to enable Category 7 (RLS Policy Audit)
-- This function allows the security audit script to inspect all RLS policies.

CREATE OR REPLACE FUNCTION get_rls_audit()
RETURNS TABLE(
  tablename text,
  policyname text,
  permissive text,
  roles text[],
  cmd text,
  qual text,
  with_check text,
  rls_enabled boolean
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    t.tablename::text,
    COALESCE(p.policyname, '(none)')::text,
    COALESCE(p.permissive, 'N/A')::text,
    COALESCE(p.roles, ARRAY['(none)']::text[]),
    COALESCE(p.cmd, 'N/A')::text,
    COALESCE(p.qual::text, '(none)'),
    COALESCE(p.with_check::text, '(none)'),
    t.rowsecurity
  FROM pg_tables t
  LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
  WHERE t.schemaname = 'public'
    AND t.tablename NOT LIKE 'pg_%'
    AND t.tablename NOT LIKE '_realtime%'
    AND t.tableowner != 'supabase_admin'
  ORDER BY t.tablename, p.policyname;
$$;
