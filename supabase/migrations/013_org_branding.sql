-- 013_org_branding.sql
-- Visual branding fields — presentation layer only.
-- Organisation identity (name, address, etc.) lives in the main org columns.
-- Previous lease_* prefixed branding columns (012_org_lease_branding.sql) have
-- been removed; brand_* columns are the canonical branding source.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS brand_logo_path      text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS brand_accent_color   text DEFAULT '#1a3a5c';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS brand_cover_template text DEFAULT 'classic'
  CHECK (brand_cover_template IN ('classic', 'modern', 'bold', 'minimal'));
