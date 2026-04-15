-- 011_inspection_storage.sql
-- Creates the inspection-photos storage bucket referenced by:
--   app/api/inspection/[id]/photo/route.ts
--   app/api/inspection/[id]/signature/route.ts
-- Fully idempotent — safe to re-run.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inspection-photos',
  'inspection-photos',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated org members may upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can upload inspection photos'
  ) THEN
    CREATE POLICY "org members can upload inspection photos" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inspection-photos');
  END IF;
END $$;

-- Authenticated org members may read and manage their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'org members can manage inspection photos'
  ) THEN
    CREATE POLICY "org members can manage inspection photos" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'inspection-photos');
  END IF;
END $$;
