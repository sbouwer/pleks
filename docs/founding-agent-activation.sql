-- Founding Agent Activation
-- Run this SQL in Supabase Dashboard → SQL Editor for each founding agent.
-- Replace '[org_id]' with the actual organisation UUID.
--
-- This gives the org 24 months at R299/month for Steward tier.
-- After 24 months, standard pricing (R599/month) applies automatically.

UPDATE organisations SET
  founding_agent = true,
  founding_agent_price_cents = 29900,
  founding_agent_since = now(),
  founding_agent_expires_at = now() + interval '24 months'
WHERE id = '[org_id]';

-- Verify:
-- SELECT name, founding_agent, founding_agent_price_cents,
--        founding_agent_since, founding_agent_expires_at
-- FROM organisations WHERE id = '[org_id]';
