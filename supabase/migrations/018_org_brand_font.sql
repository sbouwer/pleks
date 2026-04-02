-- 018_org_brand_font.sql
-- Adds a brand font selection to organisations.
-- Choices: inter (modern), merriweather (traditional), lato (friendly), playfair (elegant).

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS brand_font text DEFAULT 'inter'
  CHECK (brand_font IN ('inter', 'merriweather', 'lato', 'playfair'));
