-- 031_payment_interest_allocation.sql — Track interest portion of each payment

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS interest_applied_cents integer NOT NULL DEFAULT 0;
