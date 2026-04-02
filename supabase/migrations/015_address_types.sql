-- 015_address_types.sql
-- Add address type label to primary address and a second address block.
-- Supports e.g. Residential + Postal, or Work + Postal.

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr_type  text DEFAULT 'residential'
  CHECK (addr_type IN ('residential', 'postal', 'work', 'business', 'other'));

-- Second address (optional)
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_type        text
  CHECK (addr2_type IN ('residential', 'postal', 'work', 'business', 'other'));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_line1       text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_suburb      text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_city        text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_province    text
  CHECK (addr2_province IN (
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'
  ));
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS addr2_postal_code text;
