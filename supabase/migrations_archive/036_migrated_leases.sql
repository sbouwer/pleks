-- 036_migrated_leases.sql — External document storage + migrated flag

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS external_document_path text,
  ADD COLUMN IF NOT EXISTS migrated boolean NOT NULL DEFAULT false;

-- Backfill: existing leases with NULL template_type are migrated
UPDATE leases
  SET migrated = true
WHERE template_type IS NULL
  AND created_at < now() - interval '1 minute';
