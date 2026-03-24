-- 003_invites.sql
-- Team invite system

CREATE TABLE invites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id),
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN (
                  'owner', 'property_manager', 'agent',
                  'accountant', 'maintenance_manager',
                  'tenant', 'contractor'
                )),
  token         text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by    uuid REFERENCES auth.users(id),
  accepted_at   timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites_select" ON invites
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "org_invites_insert" ON invites
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "org_invites_update" ON invites
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'property_manager')
      AND deleted_at IS NULL
    )
  );

CREATE INDEX idx_invites_org_id ON invites(org_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);
