-- ADDENDUM_00B: Organisation operating hours & emergency contact
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS office_hours_weekday text DEFAULT 'Mon–Fri 08:00–17:00';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS office_hours_saturday text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS office_hours_sunday text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS office_hours_public_holidays text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS emergency_phone text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS emergency_instructions text;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS emergency_email text;
