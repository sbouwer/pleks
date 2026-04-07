-- 012_user_preferences.sql
-- Per-user JSON preference bag stored on user_orgs.
-- Used for: properties default view (list/cards), grouping preference, dismissed CTAs.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';
