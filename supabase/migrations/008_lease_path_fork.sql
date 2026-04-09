-- 008_lease_path_fork.sql
-- Add template_source to leases to distinguish Pleks-generated vs user-uploaded leases.

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS template_source text NOT NULL DEFAULT 'pleks'
    CHECK (template_source IN ('pleks', 'uploaded'));
