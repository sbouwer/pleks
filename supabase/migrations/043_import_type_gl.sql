-- 043_import_type_gl.sql — Add GL history import type

-- Add import_type column if not exists
ALTER TABLE import_sessions
  ADD COLUMN IF NOT EXISTS import_type text DEFAULT 'contacts';
