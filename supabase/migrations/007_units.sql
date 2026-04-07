-- 007_units.sql
-- All units table enhancements consolidated from 007, 008, 021.
-- Idempotent: all ADD COLUMN use IF NOT EXISTS, indexes use IF NOT EXISTS.

-- Deposit amount and managing user (007_unit_enhancements)
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer,
  ADD COLUMN IF NOT EXISTS managed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_units_managed_by ON units(managed_by);

-- Per-unit agent assignment for routing (008_unit_assigned_agent)
-- Falls back to property.managing_agent_id when NULL
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_units_assigned_agent
  ON units(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

COMMENT ON COLUMN units.assigned_agent_id IS
  'Letting agent for this unit. NULL = inherits from properties.managing_agent_id. '
  'Used for routing notifications, maintenance, arrears, inspections.';

-- Prospective tenant tracking (021_unit_prospective_tenants)
-- When set, unit displays as "Finalising lease" rather than "Vacant".
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS prospective_tenant_id     uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prospective_co_tenant_ids uuid[] NOT NULL DEFAULT '{}';
