-- 032_lease_clause_library.sql — Configurable lease clause system

-- ─── Clause library (platform-level, read-only) ─────────────

CREATE TABLE lease_clause_library (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_key            text NOT NULL UNIQUE,
  title                 text NOT NULL,
  body_template         text NOT NULL,
  lease_type            text NOT NULL DEFAULT 'both'
    CHECK (lease_type IN ('residential', 'commercial', 'both')),
  is_required           boolean NOT NULL DEFAULT false,
  is_enabled_by_default boolean NOT NULL DEFAULT true,
  depends_on            text[] DEFAULT '{}',
  sort_order            integer NOT NULL,
  description           text,
  toggle_label          text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── Org clause defaults ─────────────────────────────────────

CREATE TABLE org_lease_clause_defaults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  clause_key  text NOT NULL
    REFERENCES lease_clause_library(clause_key),
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, clause_key)
);

ALTER TABLE org_lease_clause_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_clause_defaults" ON org_lease_clause_defaults
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ─── Per-lease clause selections ─────────────────────────────

CREATE TABLE lease_clause_selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid NOT NULL REFERENCES leases(id),
  clause_key  text NOT NULL
    REFERENCES lease_clause_library(clause_key),
  enabled     boolean NOT NULL DEFAULT true,
  custom_body text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lease_id, clause_key)
);

ALTER TABLE lease_clause_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lease_selections" ON lease_clause_selections
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ─── Org custom lease templates ──────────────────────────────

CREATE TABLE org_lease_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id),
  name         text NOT NULL,
  lease_type   text NOT NULL DEFAULT 'both'
    CHECK (lease_type IN ('residential', 'commercial', 'both')),
  storage_path text NOT NULL,
  variable_map jsonb DEFAULT '{}',
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_lease_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lease_templates" ON org_lease_templates
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

-- ─── Additions to leases table ───────────────────────────────

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS template_type text
    CHECK (template_type IN (
      'pleks_residential', 'pleks_commercial', 'custom'
    )),
  ADD COLUMN IF NOT EXISTS generated_doc_path text,
  ADD COLUMN IF NOT EXISTS clause_snapshot jsonb;
