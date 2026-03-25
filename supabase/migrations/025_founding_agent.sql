-- 025_founding_agent.sql — Founding agent 24-month pricing

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS founding_agent_since timestamptz,
  ADD COLUMN IF NOT EXISTS founding_agent_expires_at timestamptz;
