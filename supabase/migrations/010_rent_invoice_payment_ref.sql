-- ADDENDUM_07A: payment_reference on rent_invoices
-- Format: {SURNAME}-{UNIT} e.g. "SMITH-F2"
-- Set at invoice creation, consistent across all months.

ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS idx_rent_invoices_payment_ref
  ON rent_invoices(payment_reference)
  WHERE payment_reference IS NOT NULL;
