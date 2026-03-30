-- 023_opening_balances.sql — Migration support: opening balance flag

-- Flag opening balance entries in trust_transactions
ALTER TABLE trust_transactions ADD COLUMN IF NOT EXISTS
  is_opening_balance boolean DEFAULT false;

-- Add opening_balance transaction types
-- (existing CHECK constraint allows arbitrary text, so just document:
-- 'opening_balance_deposit', 'opening_balance_arrears', 'opening_balance_rent')

-- Index for filtering opening balances in reports
CREATE INDEX IF NOT EXISTS idx_trust_txn_opening_balance
  ON trust_transactions(is_opening_balance) WHERE is_opening_balance = true;
