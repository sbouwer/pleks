-- User preferences: per-user JSON bag stored on user_orgs
-- Used for: properties default view (list/cards), grouping preference, dismissed CTAs

ALTER TABLE user_orgs
  ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';
