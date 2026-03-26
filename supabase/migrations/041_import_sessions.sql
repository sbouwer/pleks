-- 041_import_sessions.sql — Import session tracking

CREATE TABLE import_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  created_by            uuid NOT NULL REFERENCES auth.users(id),
  status                text NOT NULL DEFAULT 'mapping'
                        CHECK (status IN (
                          'mapping', 'reviewing', 'importing',
                          'complete', 'partial', 'failed'
                        )),
  source_filename       text,
  source_row_count      int,
  detected_entities     jsonb,
  column_mapping        jsonb,
  extra_column_routing  jsonb,
  conflict_resolutions  jsonb,
  expired_lease_action  text CHECK (expired_lease_action IN (
                          'skip', 'import_as_expired'
                        )),
  per_row_overrides     jsonb,
  rows_imported         int DEFAULT 0,
  rows_skipped          int DEFAULT 0,
  rows_errored          int DEFAULT 0,
  error_report          jsonb,
  discarded_columns     jsonb,
  extra_data            jsonb,
  extra_data_expires_at timestamptz,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_sessions_org_id ON import_sessions(org_id);

ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_import_sessions" ON import_sessions
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
