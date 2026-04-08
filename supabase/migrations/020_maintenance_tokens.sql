-- Migration 020: Add work order + landlord approval tokens to maintenance_requests
-- These are used for public token-authenticated pages (/wo/... and /approve/...)

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS work_order_token   text UNIQUE,
  ADD COLUMN IF NOT EXISTS landlord_approval_token text UNIQUE;

-- Index for fast token lookups on public pages
CREATE INDEX IF NOT EXISTS idx_maintenance_wo_token       ON maintenance_requests(work_order_token) WHERE work_order_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_approval_token ON maintenance_requests(landlord_approval_token) WHERE landlord_approval_token IS NOT NULL;
