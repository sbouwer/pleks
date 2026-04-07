-- 010_organisations.sql
-- All organisation table enhancements consolidated from 012–016 and 018.
-- Idempotent: all ADD COLUMN use IF NOT EXISTS.

-- Identity columns (012_org_details)
-- eaab_number: EAAB Fidelity Fund Certificate (agencies + registered agents)
-- reg_number:  CIPC company registration (already in 001_foundation)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS eaab_number text,
  ADD COLUMN IF NOT EXISTS website     text,
  ADD COLUMN IF NOT EXISTS vat_number  text;

-- Visual branding (013_org_branding)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS brand_logo_path      text,
  ADD COLUMN IF NOT EXISTS brand_accent_color   text DEFAULT '#1a3a5c',
  ADD COLUMN IF NOT EXISTS brand_cover_template text DEFAULT 'classic'
    CHECK (brand_cover_template IN ('classic', 'modern', 'bold', 'minimal'));

-- Personal details for individual landlord / owner org type (014_owner_personal_details)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS title         text,
  ADD COLUMN IF NOT EXISTS first_name    text,
  ADD COLUMN IF NOT EXISTS last_name     text,
  ADD COLUMN IF NOT EXISTS initials      text,
  ADD COLUMN IF NOT EXISTS gender        text CHECK (gender IN ('male', 'female', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS id_number     text,  -- SA ID number (13 digits)
  ADD COLUMN IF NOT EXISTS mobile        text,  -- separate from phone (landline)
  ADD COLUMN IF NOT EXISTS addr_line1    text,
  ADD COLUMN IF NOT EXISTS addr_suburb   text,
  ADD COLUMN IF NOT EXISTS addr_city     text,
  ADD COLUMN IF NOT EXISTS addr_province text CHECK (addr_province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  )),
  ADD COLUMN IF NOT EXISTS addr_postal_code text;

-- Address type and second address block (015_address_types)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS addr_type text DEFAULT 'residential'
    CHECK (addr_type IN ('residential', 'postal', 'work', 'business', 'other')),
  ADD COLUMN IF NOT EXISTS addr2_type        text
    CHECK (addr2_type IN ('residential', 'postal', 'work', 'business', 'other')),
  ADD COLUMN IF NOT EXISTS addr2_line1       text,
  ADD COLUMN IF NOT EXISTS addr2_suburb      text,
  ADD COLUMN IF NOT EXISTS addr2_city        text,
  ADD COLUMN IF NOT EXISTS addr2_province    text
    CHECK (addr2_province IN (
      'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
      'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
    )),
  ADD COLUMN IF NOT EXISTS addr2_postal_code text;

-- Primary contact flag (016_org_primary_contact_flag)
-- Default true. Set to false when the contact is a non-login principal.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS primary_contact_is_user boolean DEFAULT true;

-- Brand font selection (018_org_brand_font)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS brand_font text DEFAULT 'inter'
    CHECK (brand_font IN ('inter', 'merriweather', 'lato', 'playfair'));
