-- 047_lease_charges_financials.sql — Extend financials for lease charges

-- Add charge breakdown to rent invoices
ALTER TABLE rent_invoices
  ADD COLUMN IF NOT EXISTS charges_breakdown jsonb DEFAULT '[]';
