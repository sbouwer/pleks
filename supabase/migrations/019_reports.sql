-- 019_reports.sql — Report configurations and scheduled reports

-- Saved report configurations
CREATE TABLE report_configs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  report_type     text NOT NULL CHECK (report_type IN (
                    'portfolio_summary',
                    'occupancy',
                    'income_collection',
                    'arrears_aging',
                    'maintenance_costs',
                    'lease_expiry',
                    'application_pipeline',
                    'owner_portfolio',
                    'rent_roll',
                    'annual_tax_summary'
                  )),
  name            text NOT NULL,
  -- Filters
  property_ids    uuid[] DEFAULT '{}',
  period_type     text CHECK (period_type IN (
                    'this_month','last_month','this_quarter',
                    'last_quarter','this_tax_year','last_tax_year',
                    'custom'
                  )),
  -- Schedule (Firm tier)
  is_scheduled    boolean DEFAULT false,
  schedule_day    integer CHECK (schedule_day IS NULL OR (schedule_day >= 1 AND schedule_day <= 28)),
  recipient_emails text[],
  last_sent_at    timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE report_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_report_configs" ON report_configs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

CREATE INDEX idx_report_configs_org ON report_configs(org_id);
CREATE INDEX idx_report_configs_scheduled ON report_configs(is_scheduled, schedule_day) WHERE is_scheduled = true;
