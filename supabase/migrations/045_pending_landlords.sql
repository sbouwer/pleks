-- 045_pending_landlords.sql — Landlord import staging + invites metadata

CREATE TABLE IF NOT EXISTS pending_landlords (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  import_session_id   uuid REFERENCES import_sessions(id),
  first_name          text,
  last_name           text,
  full_name           text,
  company_name        text,
  email               text,
  phone               text,
  id_number           text,
  passport_number     text,
  vat_number          text,
  trading_as          text,
  tpn_reference       text,
  tpn_entity_id       text,
  address_raw         text,
  linked_property_id  uuid REFERENCES properties(id),
  linked_at           timestamptz,
  linked_by           uuid REFERENCES auth.users(id),
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pending_landlords_org_id ON pending_landlords(org_id);
CREATE INDEX IF NOT EXISTS idx_pending_landlords_email ON pending_landlords(email);

ALTER TABLE pending_landlords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_pending_landlords" ON pending_landlords
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- Invites metadata column
ALTER TABLE invites ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Agent dedup helper function
CREATE OR REPLACE FUNCTION get_org_member_by_email(
  p_org_id uuid,
  p_email  text
) RETURNS uuid AS $$
  SELECT uo.user_id
  FROM user_orgs uo
  JOIN auth.users u ON u.id = uo.user_id
  WHERE uo.org_id = p_org_id
    AND lower(u.email) = lower(p_email)
    AND uo.deleted_at IS NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
