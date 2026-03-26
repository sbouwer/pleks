-- 035_lease_customisation.sql — Confirmation gate + custom template requests

-- Clause edit confirmation (fires once per org)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS clause_edit_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS clause_edit_confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS clause_edit_confirmed_ip text;

-- Custom template activation on org
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS custom_template_path text,
  ADD COLUMN IF NOT EXISTS custom_template_active boolean NOT NULL DEFAULT false;

-- Custom template request tracking
CREATE TABLE custom_lease_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL REFERENCES organisations(id),
  submitted_by             uuid NOT NULL REFERENCES auth.users(id),
  template_path            text NOT NULL,
  notes                    text,
  status                   text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','invoice_sent','paid','in_progress','complete','rejected')),
  rejection_reason         text,
  admin_notes              text,
  compliance_confirmed_at  timestamptz,
  compliance_confirmed_by  uuid REFERENCES auth.users(id),
  compliance_confirmed_ip  text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_lease_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_custom_lease_requests" ON custom_lease_requests
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
