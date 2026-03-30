-- 024_trial_subscriptions.sql — 14-day migration trial system

-- Add trial fields to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_tier text
    CHECK (trial_tier IS NULL OR trial_tier IN ('steward','portfolio','firm')),
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_converted boolean DEFAULT false;

-- Add 'trialing' to status CHECK — must drop + recreate
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'past_due', 'grace_period', 'cancelled', 'trialing'));

-- Generated column for is_trial (computed, not stored — Supabase doesn't support STORED generated for boolean well)
-- Instead, use a view or function. For simplicity, we'll query the fields directly.

-- Founding agent fields on organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS founding_agent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_agent_price_cents integer;

-- Index for trial expiry cron
CREATE INDEX IF NOT EXISTS idx_subscriptions_trialing
  ON subscriptions(status, trial_ends_at)
  WHERE status = 'trialing';
