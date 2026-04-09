-- =============================================================================
-- 016: Schema drift fixes (identified by scripts/check-schema-drift.mjs)
-- Safe to run multiple times (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fix 1: lease_charges.payable_to_contractor_id → payable_to_supplier_id
-- Migration 004 created the column with the old name; it was renamed in the
-- DB without a migration. Bring migration state in line with the DB.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'lease_charges'
      AND column_name  = 'payable_to_contractor_id'
  ) THEN
    ALTER TABLE lease_charges RENAME COLUMN payable_to_contractor_id TO payable_to_supplier_id;
  END IF;
END $$;

-- Ensure the correctly-named column exists on a fresh DB
ALTER TABLE lease_charges
  ADD COLUMN IF NOT EXISTS payable_to_supplier_id uuid;

-- ---------------------------------------------------------------------------
-- Fix 2: deposit_interest_config — UNIQUE constraint (no_overlapping_configs)
-- Defined inline in CREATE TABLE IF NOT EXISTS, so it was silently skipped
-- on existing databases where the table already existed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema   = 'public'
      AND table_name     = 'deposit_interest_config'
      AND constraint_name = 'no_overlapping_configs'
  ) THEN
    ALTER TABLE deposit_interest_config
      ADD CONSTRAINT no_overlapping_configs
      UNIQUE (org_id, property_id, unit_id, effective_from);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Fix 3: units.prospective_co_tenant_id (singular)
-- The DB has this column (with FK) but it was never in any migration.
-- Migration 007 only added the plural prospective_co_tenant_ids (uuid[]).
-- ---------------------------------------------------------------------------
ALTER TABLE units
  ADD COLUMN IF NOT EXISTS prospective_co_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
