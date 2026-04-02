-- 014_owner_personal_details.sql
-- Personal detail columns for individual landlord / owner org type.
-- Structured address replaces the single-line address field for owners.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS title         text;  -- Mr / Mrs / Ms / Dr / Prof / Adv etc.
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS first_name    text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS last_name     text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS initials      text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS gender        text CHECK (gender IN ('male', 'female', 'prefer_not_to_say'));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS id_number     text;  -- SA ID number (13 digits)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS mobile        text;  -- separate from phone (landline)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_line1    text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_suburb   text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_city     text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_province text CHECK (addr_province IN (
  'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
  'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_postal_code text;
