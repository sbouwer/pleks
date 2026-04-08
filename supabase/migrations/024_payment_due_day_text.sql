-- 024_payment_due_day_text.sql
-- Change payment_due_day from integer to text to support "last_day" and "last_working_day"
-- in addition to numeric day-of-month values.
-- Drops the BETWEEN 1 AND 28 check constraint, migrates existing values as text.

ALTER TABLE leases
  ALTER COLUMN payment_due_day TYPE text USING payment_due_day::text;

ALTER TABLE leases
  ALTER COLUMN payment_due_day SET DEFAULT '1';

COMMENT ON COLUMN leases.payment_due_day IS
  'Day rent is due. Numeric string ("1"–"28") for a fixed day, "last_day" for last calendar day, "last_working_day" for last business day.';
