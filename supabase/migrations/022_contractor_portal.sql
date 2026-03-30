-- 022_contractor_portal.sql — Contractor portal + quote workflow

-- Extend contractors table for portal access
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS notification_email boolean DEFAULT true;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS notification_sms boolean DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS portal_language text DEFAULT 'en';

-- Maintenance quotes (core new workflow)
CREATE TABLE maintenance_quotes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  request_id            uuid NOT NULL REFERENCES maintenance_requests(id),
  contractor_id         uuid NOT NULL REFERENCES contractors(id),
  quote_type            text NOT NULL DEFAULT 'quote'
                        CHECK (quote_type IN ('quote', 'estimate')),
  quote_number          text,
  line_items            jsonb NOT NULL DEFAULT '[]',
  subtotal_excl_vat_cents integer NOT NULL,
  vat_amount_cents        integer NOT NULL DEFAULT 0,
  total_incl_vat_cents    integer NOT NULL,
  valid_until           date,
  estimated_duration    text,
  scope_of_work         text,
  exclusions            text,
  materials_included    boolean DEFAULT true,
  call_out_included     boolean DEFAULT true,
  contractor_notes      text,
  quote_pdf_path        text,
  status                text NOT NULL DEFAULT 'submitted'
                        CHECK (status IN (
                          'draft', 'submitted', 'approved', 'rejected', 'superseded', 'expired'
                        )),
  reviewed_by           uuid REFERENCES auth.users(id),
  reviewed_at           timestamptz,
  rejection_reason      text,
  landlord_approval_required boolean DEFAULT false,
  landlord_approved_at  timestamptz,
  landlord_rejected_at  timestamptz,
  submitted_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_quotes ENABLE ROW LEVEL SECURITY;

-- Org members can see all quotes
CREATE POLICY "org_quotes" ON maintenance_quotes
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Contractor can see their own quotes
CREATE POLICY "contractor_own_quotes" ON maintenance_quotes
  FOR ALL USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );

CREATE INDEX idx_quotes_request ON maintenance_quotes(request_id);
CREATE INDEX idx_quotes_contractor ON maintenance_quotes(contractor_id);
CREATE INDEX idx_quotes_status ON maintenance_quotes(status);

-- Contractor can see their assigned maintenance requests
CREATE POLICY "contractor_assigned_jobs" ON maintenance_requests
  FOR SELECT USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );

-- Contractor can update status on their own jobs
CREATE POLICY "contractor_update_own_jobs" ON maintenance_requests
  FOR UPDATE USING (
    contractor_id IN (
      SELECT id FROM contractors WHERE auth_user_id = auth.uid()
    )
  );

-- Contractor sees invoices for their own jobs
-- DEFERRED: policy on supplier_invoices (table created later)
-- CREATE POLICY "contractor_own_invoices" ON supplier_invoices
--   FOR ALL USING (contractor_id IN (SELECT id FROM contractors WHERE auth_user_id = auth.uid()));

-- Add new maintenance request statuses for quote workflow
-- (The CHECK constraint on maintenance_requests.status already allows arbitrary text,
-- so no ALTER needed — just document the new valid values:
-- pending_quote, quote_submitted, quote_approved, quote_rejected)
