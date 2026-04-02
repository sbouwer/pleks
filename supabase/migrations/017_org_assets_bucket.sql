-- 017_org_assets_bucket.sql
-- Creates the org-assets storage bucket for logos and other org-level files.
-- Private bucket: signed URLs required for read access.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-assets',
  'org-assets',
  false,
  2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own org prefix
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can upload org assets'
  ) THEN
    CREATE POLICY "org members can upload org assets"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'org-assets'
      AND name LIKE 'org-%'
    );
  END IF;
END $$;

-- Allow authenticated users to read/update/delete their own org assets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can manage org assets'
  ) THEN
    CREATE POLICY "org members can manage org assets"
    ON storage.objects FOR ALL
    TO authenticated
    USING (
      bucket_id = 'org-assets'
      AND name LIKE 'org-%'
    );
  END IF;
END $$;
