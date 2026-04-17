-- Migration 015: Tighten storage bucket RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014 created overly-permissive policies that allow ANY authenticated
-- user to read/write any file in the three buckets — the only guard was
-- auth.uid() IS NOT NULL.
--
-- Server actions use the service-role client (bypasses RLS), so this doesn't
-- affect current code paths. But any future client-side storage access would
-- expose:
--   - signatures/{other_org}/{other_user}/... readable by any logged-in user
--   - lease-templates/{other_org}/... readable by any logged-in user
--   - property-documents/{other_org}/... readable by any logged-in user
--
-- These policies use storage.foldername(name) to scope access by folder prefix:
--   signatures        → [1] = org_id, [2] = user_id  (user's own subfolder)
--   lease-templates   → [1] = org_id  (any member of the org)
--   property-documents → [1] = org_id  (any member of the org)
--
-- Note: policies reference user_orgs (not org_members) — that is the table
-- created in 001_foundation.sql that links auth.users to organisations.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Signatures ────────────────────────────────────────────────────────────────
-- Path structure: {org_id}/{user_id}/{filename}
-- Users may only access their own subfolder inside their org.

DROP POLICY IF EXISTS "signatures_user_access" ON storage.objects;

CREATE POLICY "signatures_user_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ── Lease templates ───────────────────────────────────────────────────────────
-- Path structure: {org_id}/{filename}
-- Any member of the org may read/write their org's folder.

DROP POLICY IF EXISTS "lease_templates_org_access" ON storage.objects;

CREATE POLICY "lease_templates_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ── Property documents ────────────────────────────────────────────────────────
-- Path structure: {org_id}/{property_id}/{document_type}/{filename}
-- Any member of the org may read/write their org's folder.

DROP POLICY IF EXISTS "property_documents_org_access" ON storage.objects;

CREATE POLICY "property_documents_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'property-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'property-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
