-- ═══════════════════════════════════════════════════════════════════════
-- 010_tenant_portal.sql
-- Tenant portal: auth link, token access, delay tracking, reschedule requests
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Link tenant records to Supabase auth users ──────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_tenants_auth_user_id
  ON tenants(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- ── 2. Maintenance request portal columns ──────────────────────────────

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS reported_via text
    NOT NULL DEFAULT 'dashboard'
    CHECK (reported_via IN ('dashboard', 'portal', 'email', 'phone')),
  ADD COLUMN IF NOT EXISTS tenant_reported_urgency text
    CHECK (tenant_reported_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic')),
  ADD COLUMN IF NOT EXISTS ai_suggested_urgency text
    CHECK (ai_suggested_urgency IN ('emergency', 'urgent', 'routine', 'cosmetic'));

-- ── 3. Tenant portal tokens (token-based access fallback) ──────────────

CREATE TABLE IF NOT EXISTS tenant_portal_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  lease_id    uuid NOT NULL REFERENCES leases(id),
  token       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked     boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_token
  ON tenant_portal_tokens(token)
  WHERE NOT revoked;

CREATE INDEX IF NOT EXISTS idx_tenant_portal_tokens_tenant
  ON tenant_portal_tokens(tenant_id);

ALTER TABLE tenant_portal_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_tenant_portal_tokens" ON tenant_portal_tokens;
CREATE POLICY "org_tenant_portal_tokens" ON tenant_portal_tokens
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- ── 4. Inspection reschedule requests ──────────────────────────────────

CREATE TABLE IF NOT EXISTS inspection_reschedule_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  inspection_id   uuid NOT NULL REFERENCES inspections(id),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  reason          text NOT NULL,
  proposed_dates  date[] NOT NULL,
  note            text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'declined', 'countered')),
  agent_response  text,
  resolved_date   date,
  resolved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_inspection
  ON inspection_reschedule_requests(inspection_id);

CREATE INDEX IF NOT EXISTS idx_reschedule_requests_tenant
  ON inspection_reschedule_requests(tenant_id);

ALTER TABLE inspection_reschedule_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_reschedule_requests" ON inspection_reschedule_requests;
CREATE POLICY "org_reschedule_requests" ON inspection_reschedule_requests
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- ── 5. Maintenance delay events ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_delay_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  maintenance_id    uuid NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  delay_type        text NOT NULL CHECK (delay_type IN (
    'tenant_not_available',
    'tenant_rescheduled',
    'tenant_no_response',
    'tenant_denied_access',
    'contractor_no_show',
    'contractor_rescheduled',
    'contractor_no_response',
    'contractor_returned_incomplete',
    'agent_pending_approval',
    'agent_pending_quote_review',
    'agent_pending_landlord_approval',
    'parts_on_order',
    'weather',
    'access_issue_other'
  )),
  attributed_to     text NOT NULL CHECK (attributed_to IN ('tenant', 'contractor', 'agent', 'external')),
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  original_date     date,
  rescheduled_to    date,
  note              text,
  recorded_by       uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maint_delay_events_request
  ON maintenance_delay_events(maintenance_id);

CREATE INDEX IF NOT EXISTS idx_maint_delay_events_org
  ON maintenance_delay_events(org_id);

ALTER TABLE maintenance_delay_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_delay_events" ON maintenance_delay_events;
CREATE POLICY "org_delay_events" ON maintenance_delay_events
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  )
  WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
