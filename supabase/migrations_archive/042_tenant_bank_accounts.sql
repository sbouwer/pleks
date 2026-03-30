-- 042_tenant_bank_accounts.sql — Extend tenant bank accounts with encryption fields

-- Table may already exist from earlier migration — add missing columns
ALTER TABLE tenant_bank_accounts
  ADD COLUMN IF NOT EXISTS account_number_enc text,
  ADD COLUMN IF NOT EXISTS account_number_hash text,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS imported_from text,
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_given boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenant_bank_accounts_hash
  ON tenant_bank_accounts(account_number_hash)
  WHERE account_number_hash IS NOT NULL;
