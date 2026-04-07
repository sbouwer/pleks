-- Add prospective tenant fields to units so teams can record intended tenants
-- before a lease is formally created. When set, the unit displays as
-- "Finalising lease" rather than "Vacant".
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS prospective_tenant_id      uuid REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prospective_co_tenant_id   uuid REFERENCES tenants(id) ON DELETE SET NULL;
