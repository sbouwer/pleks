-- 007_leases.sql
-- Property rules, lease templates, leases, lease amendments

-- =============================================================
-- Property rules (Addendum C) — set at property level
-- =============================================================
CREATE TABLE property_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  version         integer NOT NULL DEFAULT 1,
  pets_allowed    boolean DEFAULT false,
  pets_conditions text,
  smoking_allowed boolean DEFAULT false,
  parking_rules   text,
  noise_rules     text,
  visitor_rules   text,
  common_area_rules text,
  garden_rules    text,
  braai_rules     text,
  refuse_rules    text,
  alterations_rule text,
  additional_rules text[] DEFAULT '{}',
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_property_rules_updated_at
  BEFORE UPDATE ON property_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE property_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_property_rules" ON property_rules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================================
-- Lease templates (core document versions)
-- =============================================================
CREATE TABLE lease_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid,
  template_type   text NOT NULL CHECK (template_type IN ('residential', 'commercial')),
  version         text NOT NULL,
  name            text NOT NULL,
  docuseal_template_id text,
  is_active       boolean DEFAULT true,
  is_system       boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE lease_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lease_templates" ON lease_templates
  FOR ALL USING (
    org_id IS NULL OR org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- =============================================================
-- Leases
-- =============================================================
CREATE TABLE leases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id),
  unit_id             uuid NOT NULL REFERENCES units(id),
  property_id         uuid NOT NULL REFERENCES properties(id),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  landlord_id         uuid,
  lease_type          text NOT NULL DEFAULT 'residential'
                      CHECK (lease_type IN ('residential', 'commercial')),
  tenant_is_juristic  boolean NOT NULL DEFAULT false,
  cpa_applies         boolean NOT NULL DEFAULT true,
  -- Addendum A
  start_date          date NOT NULL,
  end_date            date,
  is_fixed_term       boolean NOT NULL DEFAULT true,
  notice_period_days  integer NOT NULL DEFAULT 20,
  -- Addendum B
  rent_amount_cents   integer NOT NULL,
  payment_due_day     integer NOT NULL DEFAULT 1 CHECK (payment_due_day BETWEEN 1 AND 28),
  escalation_percent  numeric(5,2) NOT NULL DEFAULT 10.00,
  escalation_type     text NOT NULL DEFAULT 'fixed'
                      CHECK (escalation_type IN ('fixed', 'cpi', 'prime_plus')),
  escalation_review_date date,
  deposit_amount_cents integer,
  deposit_interest_to text NOT NULL DEFAULT 'tenant'
                      CHECK (deposit_interest_to IN ('tenant', 'landlord')),
  -- Addendum C
  property_rules_id   uuid REFERENCES property_rules(id),
  property_rules_version integer,
  -- Addendum D
  special_terms       jsonb DEFAULT '[]',
  -- Document assembly
  core_template_id    uuid REFERENCES lease_templates(id),
  docuseal_submission_id text,
  docuseal_document_url text,
  -- Status
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN (
                        'draft', 'pending_signing', 'active', 'notice',
                        'expired', 'cancelled', 'month_to_month'
                      )),
  -- Notice
  notice_given_by     text CHECK (notice_given_by IN ('tenant', 'landlord')),
  notice_given_date   date,
  notice_period_end   date,
  -- CPA
  auto_renewal_notice_sent_at timestamptz,
  auto_renewal_notice_due     date,
  -- DebiCheck
  debicheck_mandate_id  text,
  debicheck_mandate_status text CHECK (debicheck_mandate_status IN (
                              'not_created', 'pending', 'active', 'cancelled'
                            )) DEFAULT 'not_created',
  -- Meta
  created_by          uuid REFERENCES auth.users(id),
  signed_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);

CREATE TRIGGER update_leases_updated_at
  BEFORE UPDATE ON leases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_leases_org_id ON leases(org_id);
CREATE INDEX idx_leases_unit_id ON leases(unit_id);
CREATE INDEX idx_leases_tenant_id ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status);
CREATE INDEX idx_leases_end_date ON leases(end_date);

ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_leases" ON leases
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "tenant_own_lease" ON leases
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_orgs_tenants WHERE user_id = auth.uid())
    AND status IN ('active', 'notice', 'month_to_month')
  );

-- =============================================================
-- Lease amendments
-- =============================================================
CREATE TABLE lease_amendments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id),
  amendment_type  text NOT NULL CHECK (amendment_type IN (
                    'rent_escalation', 'deposit_top_up', 'special_term_change',
                    'term_extension', 'early_termination', 'other'
                  )),
  previous_values jsonb,
  new_values      jsonb,
  effective_date  date NOT NULL,
  requires_signature boolean NOT NULL DEFAULT true,
  docuseal_submission_id text,
  docuseal_document_url  text,
  signed_at       timestamptz,
  notes           text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lease_amendments_lease_id ON lease_amendments(lease_id);

ALTER TABLE lease_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lease_amendments" ON lease_amendments
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
