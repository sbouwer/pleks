-- 009_lease_co_tenants.sql
-- Co-tenants on leases: jointly and severally liable parties beyond the primary tenant.
-- Primary tenant remains as leases.tenant_id (no breaking change).
-- Co-tenants are linked via this junction table.

CREATE TABLE lease_co_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  is_signatory boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lease_id, tenant_id)
);

CREATE INDEX idx_lease_co_tenants_lease   ON lease_co_tenants(lease_id);
CREATE INDEX idx_lease_co_tenants_tenant  ON lease_co_tenants(tenant_id);

ALTER TABLE lease_co_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_lease_co_tenants" ON lease_co_tenants
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

COMMENT ON TABLE lease_co_tenants IS
  'Co-tenants (co-lessees) on a lease. Primary tenant is leases.tenant_id. Co-tenants are jointly and severally liable.';
