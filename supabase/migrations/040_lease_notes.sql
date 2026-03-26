-- 040_lease_notes.sql — Freetext notes field for import data
ALTER TABLE leases ADD COLUMN IF NOT EXISTS notes text;
