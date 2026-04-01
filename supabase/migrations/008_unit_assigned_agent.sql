-- 008_unit_assigned_agent.sql
-- Add per-unit agent assignment for routing (notifications, maintenance, arrears, inspections)
-- Falls back to property.managing_agent_id when NULL

ALTER TABLE units ADD COLUMN assigned_agent_id uuid REFERENCES auth.users(id);

CREATE INDEX idx_units_assigned_agent ON units(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

COMMENT ON COLUMN units.assigned_agent_id IS 'Letting agent for this unit. NULL = inherits from properties.managing_agent_id. Used for routing notifications, maintenance, arrears, inspections.';
