-- 037_onboarding_flags.sql — Onboarding completion tracking

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_type text
    CHECK (user_type IN ('owner', 'agent', 'agency', 'family', 'exploring'));
