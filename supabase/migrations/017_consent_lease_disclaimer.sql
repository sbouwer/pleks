-- 017_consent_lease_disclaimer.sql
-- Add 'lease_template_disclaimer' to the consent_log.consent_type CHECK constraint.
-- Idempotent: drops the existing CHECK (found by scanning pg_constraint) then re-creates it.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'consent_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%consent_type%'
  LOOP
    EXECUTE format('ALTER TABLE consent_log DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE consent_log ADD CONSTRAINT consent_log_consent_type_check
  CHECK (consent_type IN (
    'credit_check', 'data_processing', 'marketing',
    'trust_account_notice', 'popia_application',
    'lease_template_disclaimer'
  ));
