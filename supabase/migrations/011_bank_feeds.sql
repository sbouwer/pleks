-- Migration 011: Bank Feeds (BUILD_50)
-- OFX/CSV/QIF structured import + Yodlee live bank feeds

-- ─── bank_statement_imports: add import_source ───────────────────────────────
ALTER TABLE bank_statement_imports
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'upload'
  CHECK (import_source IN ('upload', 'yodlee', 'ofx', 'csv', 'qif'));

-- ─── bank_statement_lines: add external_id for dedup ─────────────────────────
ALTER TABLE bank_statement_lines
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_stmt_lines_external_id
  ON bank_statement_lines(org_id, external_id)
  WHERE external_id IS NOT NULL;

-- ─── organisations: Yodlee user mapping ──────────────────────────────────────
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS yodlee_user_id text,
  ADD COLUMN IF NOT EXISTS yodlee_user_created_at timestamptz;

-- ─── bank_feed_connections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_feed_connections (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organisations(id),
  bank_account_id             uuid REFERENCES bank_accounts(id),

  -- Yodlee identifiers
  yodlee_provider_account_id  text NOT NULL,
  yodlee_account_id           text,
  yodlee_provider_id          text,

  -- Display
  bank_name                   text NOT NULL,
  account_mask                text,
  account_type                text,

  -- Sync state
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_synced_at              timestamptz,
  last_sync_status            text CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_error             text,
  last_sync_txn_count         integer DEFAULT 0,
  last_sync_matched_count     integer DEFAULT 0,
  next_sync_after             timestamptz,

  -- Billing
  billing_active              boolean NOT NULL DEFAULT true,
  billing_started_at          timestamptz NOT NULL DEFAULT now(),

  -- Meta
  created_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  disconnected_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bank_feed_conn_org
  ON bank_feed_connections(org_id)
  WHERE status = 'active';

ALTER TABLE bank_feed_connections ENABLE ROW LEVEL SECURITY;

-- RLS: org-scoped access
CREATE POLICY bank_feed_conn_select ON bank_feed_connections
  FOR SELECT USING (org_id = (
    SELECT org_id FROM user_orgs
    WHERE user_id = auth.uid() AND deleted_at IS NULL
    LIMIT 1
  ));

CREATE POLICY bank_feed_conn_insert ON bank_feed_connections
  FOR INSERT WITH CHECK (org_id = (
    SELECT org_id FROM user_orgs
    WHERE user_id = auth.uid() AND deleted_at IS NULL
    LIMIT 1
  ));

CREATE POLICY bank_feed_conn_update ON bank_feed_connections
  FOR UPDATE USING (org_id = (
    SELECT org_id FROM user_orgs
    WHERE user_id = auth.uid() AND deleted_at IS NULL
    LIMIT 1
  ));
