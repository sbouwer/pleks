-- ADDENDUM_42A: Lease creation path fork
-- template_source distinguishes Pleks-template leases from user-uploaded leases.
-- Drives: prerequisite checks, clause config visibility, signing options.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS template_source TEXT NOT NULL DEFAULT 'pleks'
  CHECK (template_source IN ('pleks', 'uploaded'));

COMMENT ON COLUMN leases.template_source IS
  'pleks = created via Pleks 7-step wizard; uploaded = user brought own lease document';
