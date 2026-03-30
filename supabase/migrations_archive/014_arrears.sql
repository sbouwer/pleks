-- 014_arrears.sql
-- Arrears cases, sequences, steps, actions

CREATE TABLE arrears_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  lease_id          uuid NOT NULL REFERENCES leases(id),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  unit_id           uuid NOT NULL REFERENCES units(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  lease_type        text NOT NULL DEFAULT 'residential',
  total_arrears_cents       integer NOT NULL DEFAULT 0,
  oldest_outstanding_date   date,
  months_in_arrears         integer DEFAULT 0,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN (
                      'open', 'payment_arrangement', 'legal', 'tribunal',
                      'eviction_notice', 'resolved', 'written_off', 'vacated_with_debt'
                    )),
  current_step      integer DEFAULT 0,
  sequence_id       uuid,
  sequence_paused   boolean DEFAULT false,
  sequence_paused_reason text,
  arrangement_amount_cents    integer,
  arrangement_start_date      date,
  arrangement_end_date        date,
  arrangement_notes           text,
  referred_to_attorney        boolean DEFAULT false,
  referred_at                 timestamptz,
  attorney_name               text,
  attorney_reference          text,
  tpn_listed                  boolean DEFAULT false,
  tpn_listed_at               timestamptz,
  tpn_listing_reference       text,
  tpn_removed_at              timestamptz,
  rha_s4_notice_sent          boolean DEFAULT false,
  rha_s4_notice_sent_at       timestamptz,
  resolved_at                 timestamptz,
  resolved_by                 uuid REFERENCES auth.users(id),
  resolution_notes            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_arrears_cases_updated_at
  BEFORE UPDATE ON arrears_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_arrears_org ON arrears_cases(org_id);
CREATE INDEX idx_arrears_lease ON arrears_cases(lease_id);
CREATE INDEX idx_arrears_status ON arrears_cases(status);
CREATE INDEX idx_arrears_tenant ON arrears_cases(tenant_id);

ALTER TABLE arrears_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_arrears" ON arrears_cases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears sequences (configurable per org)
CREATE TABLE arrears_sequences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  name            text NOT NULL DEFAULT 'Default Sequence',
  lease_type      text NOT NULL DEFAULT 'residential',
  is_default      boolean DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE arrears_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_arrears_sequences" ON arrears_sequences
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Sequence steps
CREATE TABLE arrears_sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  sequence_id     uuid NOT NULL REFERENCES arrears_sequences(id) ON DELETE CASCADE,
  step_number     integer NOT NULL,
  trigger_days    integer NOT NULL,
  action_type     text NOT NULL CHECK (action_type IN (
                    'sms', 'email', 'whatsapp', 'formal_email',
                    'letter_of_demand', 'pre_legal_notice', 'agent_task'
                  )),
  tone            text NOT NULL DEFAULT 'friendly'
                  CHECK (tone IN ('friendly', 'firm', 'formal', 'legal')),
  ai_draft        boolean DEFAULT true,
  template_override text,
  requires_agent_approval boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE arrears_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_arrears_steps" ON arrears_sequence_steps
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Arrears actions log (immutable)
CREATE TABLE arrears_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  case_id         uuid NOT NULL REFERENCES arrears_cases(id),
  step_number     integer,
  action_type     text NOT NULL,
  channel         text,
  subject         text,
  body            text,
  ai_drafted      boolean DEFAULT false,
  ai_model        text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  delivery_status text,
  external_ref    text,
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  tenant_responded      boolean DEFAULT false,
  tenant_response_notes text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_arrears_actions_case ON arrears_actions(case_id);

ALTER TABLE arrears_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_arrears_actions_read" ON arrears_actions
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_arrears_actions_insert" ON arrears_actions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
