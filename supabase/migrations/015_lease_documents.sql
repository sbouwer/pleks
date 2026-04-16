-- ═══════════════════════════════════════════════════════════════
-- Migration 015 — Lease Documents
-- Central store for documents associated with a lease.
-- Data sources: welcome packs, LODs, s14/s4 notices, statements,
-- inspection reports, tribunal submissions, amendments.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lease_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN (
                    'signed_lease',
                    'welcome_pack_tenant',
                    'welcome_pack_landlord',
                    'lod',
                    's14_notice',
                    'section_4_notice',
                    'tribunal_submission',
                    'statement_tenant',
                    'statement_owner',
                    'inspection_report',
                    'amendment',
                    'other'
                  )),
  title           text NOT NULL,
  storage_path    text NOT NULL,
  file_size_bytes bigint,
  -- 'system' | user uuid | 'docuseal' | 'tenant_portal' etc.
  generated_by    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_documents_lease   ON lease_documents(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_org     ON lease_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_type    ON lease_documents(doc_type);

ALTER TABLE lease_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lease_docs_org_select" ON lease_documents;
CREATE POLICY "lease_docs_org_select" ON lease_documents
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "lease_docs_org_insert" ON lease_documents;
CREATE POLICY "lease_docs_org_insert" ON lease_documents
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "lease_docs_org_delete" ON lease_documents;
CREATE POLICY "lease_docs_org_delete" ON lease_documents
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
