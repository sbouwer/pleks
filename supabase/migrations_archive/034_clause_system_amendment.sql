-- 034_clause_system_amendment.sql — Clause system amendment
-- Remove org_lease_templates, make lease_clause_selections.lease_id nullable

-- Drop custom templates table (not building DOCX upload flow)
DROP TABLE IF EXISTS org_lease_templates;

-- Make lease_id nullable for org-level custom clause wording
ALTER TABLE lease_clause_selections
  ALTER COLUMN lease_id DROP NOT NULL;

-- Replace unique constraint to handle nulls
ALTER TABLE lease_clause_selections
  DROP CONSTRAINT IF EXISTS lease_clause_selections_lease_id_clause_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS lease_clause_selections_unique
  ON lease_clause_selections (
    org_id, clause_key,
    COALESCE(lease_id, '00000000-0000-0000-0000-000000000000')
  );
