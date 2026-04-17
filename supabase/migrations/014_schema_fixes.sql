-- Migration 014: Schema fixes
-- (a) Add missing custom lease metadata columns to organisations
-- (b) Create storage buckets idempotently with RLS

-- ── (a) organisations: custom lease filename + upload timestamp ───────────────
-- custom_template_path already exists (001_foundation.sql)
-- Add the companion metadata columns referenced by the templates UI
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS custom_template_filename    text,
  ADD COLUMN IF NOT EXISTS custom_template_uploaded_at timestamptz;

-- ── (b) Storage buckets ───────────────────────────────────────────────────────
-- Supabase storage buckets cannot be created in SQL directly via the JS client,
-- but they CAN be created idempotently using the storage schema's internal table.
-- If you are running this against the Supabase hosted service, create these
-- buckets in the Dashboard (Storage → New bucket) with the settings below,
-- OR run: supabase storage create <name> --public false
--
-- Buckets required:
--   signatures       — user signature images (private)
--   lease-templates  — custom lease PDF/DOCX uploads (private)
--   property-documents — compliance and property docs (private)
--
-- The INSERT below is idempotent via ON CONFLICT DO NOTHING and works when
-- running migrations locally via the Supabase CLI.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('signatures',          'signatures',          false, 5242880,   ARRAY['image/png','image/jpeg','image/webp']),
  ('lease-templates',     'lease-templates',     false, 10485760,  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('property-documents',  'property-documents',  false, 20971520,  NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can read/write their own org's files
-- Signatures bucket: users can read/write within their own org folder
CREATE POLICY "signatures_user_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'signatures'
    AND auth.uid() IS NOT NULL
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND auth.uid() IS NOT NULL
  );

-- Lease templates: org members can access their org's folder
CREATE POLICY "lease_templates_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'lease-templates'
    AND auth.uid() IS NOT NULL
  )
  WITH CHECK (
    bucket_id = 'lease-templates'
    AND auth.uid() IS NOT NULL
  );

-- Property documents: org members can access their org's folder
CREATE POLICY "property_documents_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'property-documents'
    AND auth.uid() IS NOT NULL
  )
  WITH CHECK (
    bucket_id = 'property-documents'
    AND auth.uid() IS NOT NULL
  );
