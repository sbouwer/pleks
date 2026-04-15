-- 014_lease_notes.sql
-- Lease-level notes for tenant/owner/general use.
-- Also patches commercial leases that incorrectly have cpa_applies = true.
-- Fully idempotent — safe to re-run.

-- ── Lease notes table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lease_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id),
  lease_id    uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  note_type   text NOT NULL CHECK (note_type IN ('tenant', 'owner', 'general')),
  body        text NOT NULL,
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_notes_lease ON lease_notes(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_notes_org   ON lease_notes(org_id);

ALTER TABLE lease_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lease_notes'
    AND policyname = 'org lease notes access'
  ) THEN
    CREATE POLICY "org lease notes access" ON lease_notes
      FOR ALL TO authenticated
      USING (
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      )
      WITH CHECK (
        org_id IN (
          SELECT org_id FROM user_orgs
          WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- ── CPA data patch ─────────────────────────────────────────────────────────────
-- Commercial leases should never have cpa_applies = true.
-- The Consumer Protection Act (CPA) does not apply to juristic persons /
-- commercial tenants. Patch any commercial leases incorrectly flagged.
UPDATE leases
  SET cpa_applies = false
  WHERE lease_type = 'commercial'
    AND cpa_applies = true;
