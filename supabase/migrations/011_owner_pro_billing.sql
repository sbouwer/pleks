-- ═══════════════════════════════════════════════════════════════════════════════
-- 011_owner_pro_billing.sql
-- Owner Pro per-lease premium billing infrastructure
-- Adds: premium_enabled to leases, owner_pro columns to subscriptions,
--       subscription_charges table, 'frozen' subscription status
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen subscriptions status constraint to include 'frozen' ───────────────
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'active', 'trialing', 'past_due', 'grace_period',
    'frozen', 'cancelled'
  ));

-- ── 2. Owner Pro columns on subscriptions ─────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS owner_pro_lease_count  int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mandate_id             text,
  ADD COLUMN IF NOT EXISTS mandate_status         text
    CHECK (mandate_status IN ('pending_auth', 'active', 'cancelled', 'failed')),
  ADD COLUMN IF NOT EXISTS mandate_authenticated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_attempt_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_success_at   timestamptz,
  ADD COLUMN IF NOT EXISTS failed_attempts           int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_since              timestamptz;

COMMENT ON COLUMN subscriptions.owner_pro_lease_count IS
  'Number of leases with premium_enabled = true for Owner tier orgs. '
  'Billed amount = owner_pro_lease_count * 9900 cents.';

-- ── 3. Premium columns on leases ──────────────────────────────────────────────
ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS premium_enabled      boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_enabled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS premium_enabled_by   uuid         REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS premium_disabled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS premium_price_cents  int          NOT NULL DEFAULT 9900;

CREATE INDEX IF NOT EXISTS idx_leases_premium
  ON leases(org_id, premium_enabled)
  WHERE premium_enabled = true;

-- ── 4. subscription_charges — billing history ─────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_charges (
  id                    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid  NOT NULL REFERENCES organisations(id),
  subscription_id       uuid  NOT NULL REFERENCES subscriptions(id),
  billing_period_start  date  NOT NULL,
  billing_period_end    date  NOT NULL,
  tier                  text  NOT NULL,
  amount_cents          int   NOT NULL,
  -- Owner Pro: which leases were on premium this period
  premium_lease_ids     uuid[],
  status                text  NOT NULL
    CHECK (status IN ('pending', 'charged', 'failed', 'refunded', 'partial_refund')),
  transaction_id        text,
  invoice_number        text  NOT NULL,
  charged_at            timestamptz,
  failed_reason         text,
  refunded_cents        int   NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_charges_org          ON subscription_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_sub_charges_subscription ON subscription_charges(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_charges_status       ON subscription_charges(status);

ALTER TABLE subscription_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins view own billing" ON subscription_charges
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );
