-- ============================================================================
-- PLEKS TEST DATA SEED — Realistic SA Property Management Dataset
-- Run in Supabase SQL Editor
-- All UUIDs use valid hex characters only (0-9, a-f)
-- Safe to re-run: ON CONFLICT DO NOTHING on all inserts
-- ============================================================================

DO $$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id INTO v_org_id FROM organisations LIMIT 1;
  SELECT user_id INTO v_user_id FROM user_orgs WHERE org_id = v_org_id LIMIT 1;
  RAISE NOTICE 'org_id: %, user_id: %', v_org_id, v_user_id;

  -- ── PROPERTIES ──────────────────────────────────────────────────────────
  INSERT INTO properties (id, org_id, name, address_line1, suburb, city, province, type, owner_name, owner_email, owner_phone) VALUES
    ('a0000001-0000-0000-0000-000000000001', v_org_id, 'Oak Manor', '14 Oak Avenue', 'Kenilworth', 'Cape Town', 'Western Cape', 'residential', 'M. Jones Trust', 'mjones@trustsa.co.za', '0218887654')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO properties (id, org_id, name, address_line1, suburb, city, province, type, owner_name, owner_email) VALUES
    ('a0000001-0000-0000-0000-000000000002', v_org_id, 'Vineyard Office Park', '22 Vineyard Road', 'Claremont', 'Cape Town', 'Western Cape', 'commercial', 'Steenberg Investments (Pty) Ltd', 'info@steenberg-inv.co.za')
  ON CONFLICT (id) DO NOTHING;

  -- ── UNITS ───────────────────────────────────────────────────────────────
  INSERT INTO units (id, org_id, property_id, unit_number, bedrooms, bathrooms, size_m2, status, market_rent_cents) VALUES
    ('b0000001-0000-0000-0000-000000000001', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'Unit 1', 2, 1, 65, 'occupied', 850000),
    ('b0000001-0000-0000-0000-000000000002', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'Unit 2', 2, 1, 65, 'occupied', 850000),
    ('b0000001-0000-0000-0000-000000000003', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'Unit 3', 3, 2, 90, 'notice', 1100000),
    ('b0000001-0000-0000-0000-000000000004', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'Unit 4', 1, 1, 45, 'vacant', 650000),
    ('b0000001-0000-0000-0000-000000000005', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'Suite A', NULL, NULL, 120, 'occupied', 1800000),
    ('b0000001-0000-0000-0000-000000000006', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'Suite B', NULL, NULL, 80, 'occupied', 1200000),
    ('b0000001-0000-0000-0000-000000000007', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'Suite C', NULL, NULL, 60, 'vacant', 950000)
  ON CONFLICT (id) DO NOTHING;

  -- ── CONTACTS ────────────────────────────────────────────────────────────
  -- Tenants
  INSERT INTO contacts (id, org_id, entity_type, primary_role, first_name, last_name, primary_email, primary_phone, id_number) VALUES
    ('c0000001-0000-0000-0000-000000000001', v_org_id, 'individual', 'tenant', 'Sipho', 'Dlamini', 'sipho.d@gmail.com', '0799998877', '9105125678901'),
    ('c0000001-0000-0000-0000-000000000002', v_org_id, 'individual', 'tenant', 'Rina', 'van der Berg', 'rina.vdb@gmail.com', '0724441122', '7803030045081'),
    ('c0000001-0000-0000-0000-000000000003', v_org_id, 'individual', 'tenant', 'Kim', 'Osei', 'kim.osei@yahoo.com', '0611234567', NULL),
    ('c0000001-0000-0000-0000-000000000004', v_org_id, 'organisation', 'tenant', 'Thabo', 'Mokoena', 'thabo@mokoena.co.za', '0215557890', NULL),
    ('c0000001-0000-0000-0000-000000000005', v_org_id, 'organisation', 'tenant', 'Lisa', 'Fourie', 'lisa@fourielaw.co.za', '0216661234', NULL),
    ('c0000001-0000-0000-0000-000000000006', v_org_id, 'individual', 'tenant', 'Peter', 'Nkosi', 'peter.nkosi@outlook.com', '0835557890', NULL)
  ON CONFLICT (id) DO NOTHING;

  UPDATE contacts SET company_name = 'Mokoena Consulting (Pty) Ltd' WHERE id = 'c0000001-0000-0000-0000-000000000004';
  UPDATE contacts SET company_name = 'Fourie & Associates' WHERE id = 'c0000001-0000-0000-0000-000000000005';

  -- Landlord 2
  INSERT INTO contacts (id, org_id, entity_type, primary_role, company_name, primary_email, primary_phone) VALUES
    ('c0000001-0000-0000-0000-000000000010', v_org_id, 'organisation', 'landlord', 'Steenberg Investments (Pty) Ltd', 'info@steenberg-inv.co.za', '0219991234')
  ON CONFLICT (id) DO NOTHING;

  -- Contractors
  INSERT INTO contacts (id, org_id, entity_type, primary_role, company_name, primary_email, primary_phone) VALUES
    ('c0000001-0000-0000-0000-000000000020', v_org_id, 'organisation', 'contractor', 'Sparks Electrical', 'info@sparkselectric.co.za', '0824441111'),
    ('c0000001-0000-0000-0000-000000000021', v_org_id, 'organisation', 'contractor', 'Clean Sweep Pest Control', 'book@cleansweep.co.za', '0833332222')
  ON CONFLICT (id) DO NOTHING;

  -- ── TENANTS ─────────────────────────────────────────────────────────────
  INSERT INTO tenants (id, org_id, contact_id, employer_name) VALUES
    ('d0000001-0000-0000-0000-000000000001', v_org_id, 'c0000001-0000-0000-0000-000000000001', 'City of Cape Town'),
    ('d0000001-0000-0000-0000-000000000002', v_org_id, 'c0000001-0000-0000-0000-000000000002', 'Dis-Chem'),
    ('d0000001-0000-0000-0000-000000000003', v_org_id, 'c0000001-0000-0000-0000-000000000003', NULL),
    ('d0000001-0000-0000-0000-000000000004', v_org_id, 'c0000001-0000-0000-0000-000000000004', 'Self-employed'),
    ('d0000001-0000-0000-0000-000000000005', v_org_id, 'c0000001-0000-0000-0000-000000000005', NULL),
    ('d0000001-0000-0000-0000-000000000006', v_org_id, 'c0000001-0000-0000-0000-000000000006', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- ── LANDLORD ────────────────────────────────────────────────────────────
  INSERT INTO landlords (id, org_id, contact_id, created_by) VALUES
    ('a2000001-0000-0000-0000-000000000001', v_org_id, 'c0000001-0000-0000-0000-000000000010', v_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── CONTRACTORS ─────────────────────────────────────────────────────────
  INSERT INTO contractors (id, org_id, contact_id, supplier_type, is_active) VALUES
    ('a3000001-0000-0000-0000-000000000001', v_org_id, 'c0000001-0000-0000-0000-000000000020', 'contractor', true),
    ('a3000001-0000-0000-0000-000000000002', v_org_id, 'c0000001-0000-0000-0000-000000000021', 'contractor', true)
  ON CONFLICT (id) DO NOTHING;

  -- ── LEASES ──────────────────────────────────────────────────────────────
  INSERT INTO leases (id, org_id, unit_id, property_id, tenant_id, start_date, end_date, rent_amount_cents, deposit_amount_cents, escalation_percent, status, lease_type) VALUES
    ('e0000001-0000-0000-0000-000000000001', v_org_id, 'b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', '2025-07-01', '2026-06-30', 850000, 1700000, 8, 'active', 'residential'),
    ('e0000001-0000-0000-0000-000000000002', v_org_id, 'b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000002', '2025-03-01', '2026-02-28', 850000, 1700000, 8, 'active', 'residential'),
    ('e0000001-0000-0000-0000-000000000003', v_org_id, 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000003', '2024-06-01', '2026-05-31', 1100000, 2200000, 10, 'notice', 'residential'),
    ('e0000001-0000-0000-0000-000000000004', v_org_id, 'b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000004', '2025-01-01', '2027-12-31', 1800000, 3600000, 8, 'active', 'commercial'),
    ('e0000001-0000-0000-0000-000000000005', v_org_id, 'b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000005', '2025-04-01', '2027-03-31', 1200000, 2400000, 8, 'active', 'commercial')
  ON CONFLICT (id) DO NOTHING;

  -- Co-tenant
  INSERT INTO lease_co_tenants (id, org_id, lease_id, tenant_id) VALUES
    ('ae000001-0000-0000-0000-000000000001', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000006')
  ON CONFLICT (id) DO NOTHING;

  -- ── RENT INVOICES (Jan–Apr 2026) ────────────────────────────────────────
  -- rent_invoices columns: id, org_id, lease_id, unit_id, tenant_id, invoice_number, invoice_date, due_date, period_from, period_to, rent_amount_cents, total_amount_cents, status, amount_paid_cents
  INSERT INTO rent_invoices (id, org_id, lease_id, unit_id, tenant_id, invoice_number, invoice_date, due_date, period_from, period_to, rent_amount_cents, total_amount_cents, status, amount_paid_cents) VALUES
    -- January (all paid)
    ('f0000001-0000-0000-0000-000000000101', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'INV-2026-0101', '2025-12-25', '2026-01-01', '2026-01-01', '2026-01-31', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000102', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'INV-2026-0102', '2025-12-25', '2026-01-01', '2026-01-01', '2026-01-31', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000103', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'INV-2026-0103', '2025-12-25', '2026-01-01', '2026-01-01', '2026-01-31', 1100000, 1100000, 'paid', 1100000),
    ('f0000001-0000-0000-0000-000000000104', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000004', 'INV-2026-0104', '2025-12-25', '2026-01-01', '2026-01-01', '2026-01-31', 1800000, 1800000, 'paid', 1800000),
    ('f0000001-0000-0000-0000-000000000105', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000005', 'INV-2026-0105', '2025-12-25', '2026-01-01', '2026-01-01', '2026-01-31', 1200000, 1200000, 'paid', 1200000),
    -- February (Kim stops paying)
    ('f0000001-0000-0000-0000-000000000201', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'INV-2026-0201', '2026-01-25', '2026-02-01', '2026-02-01', '2026-02-28', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000202', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'INV-2026-0202', '2026-01-25', '2026-02-01', '2026-02-01', '2026-02-28', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000203', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'INV-2026-0203', '2026-01-25', '2026-02-01', '2026-02-01', '2026-02-28', 1100000, 1100000, 'overdue', 0),
    ('f0000001-0000-0000-0000-000000000204', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000004', 'INV-2026-0204', '2026-01-25', '2026-02-01', '2026-02-01', '2026-02-28', 1800000, 1800000, 'paid', 1800000),
    ('f0000001-0000-0000-0000-000000000205', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000005', 'INV-2026-0205', '2026-01-25', '2026-02-01', '2026-02-01', '2026-02-28', 1200000, 1200000, 'paid', 1200000),
    -- March
    ('f0000001-0000-0000-0000-000000000301', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'INV-2026-0301', '2026-02-25', '2026-03-01', '2026-03-01', '2026-03-31', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000302', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'INV-2026-0302', '2026-02-25', '2026-03-01', '2026-03-01', '2026-03-31', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000303', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'INV-2026-0303', '2026-02-25', '2026-03-01', '2026-03-01', '2026-03-31', 1100000, 1100000, 'overdue', 0),
    ('f0000001-0000-0000-0000-000000000304', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000004', 'INV-2026-0304', '2026-02-25', '2026-03-01', '2026-03-01', '2026-03-31', 1800000, 1800000, 'paid', 1800000),
    ('f0000001-0000-0000-0000-000000000305', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000005', 'INV-2026-0305', '2026-02-25', '2026-03-01', '2026-03-01', '2026-03-31', 1200000, 1200000, 'partial', 600000),
    -- April
    ('f0000001-0000-0000-0000-000000000401', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'INV-2026-0401', '2026-03-25', '2026-04-01', '2026-04-01', '2026-04-30', 850000, 850000, 'paid', 850000),
    ('f0000001-0000-0000-0000-000000000402', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'INV-2026-0402', '2026-03-25', '2026-04-01', '2026-04-01', '2026-04-30', 850000, 850000, 'open', 0),
    ('f0000001-0000-0000-0000-000000000403', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'INV-2026-0403', '2026-03-25', '2026-04-01', '2026-04-01', '2026-04-30', 1100000, 1100000, 'overdue', 0),
    ('f0000001-0000-0000-0000-000000000404', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000004', 'INV-2026-0404', '2026-03-25', '2026-04-01', '2026-04-01', '2026-04-30', 1800000, 1800000, 'paid', 1800000),
    ('f0000001-0000-0000-0000-000000000405', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 'd0000001-0000-0000-0000-000000000005', 'INV-2026-0405', '2026-03-25', '2026-04-01', '2026-04-01', '2026-04-30', 1200000, 1200000, 'open', 0)
  ON CONFLICT (id) DO NOTHING;

  -- ── PAYMENTS ────────────────────────────────────────────────────────────
  INSERT INTO payments (id, org_id, lease_id, tenant_id, invoice_id, amount_cents, payment_date, payment_method, reference) VALUES
    -- Jan
    ('a4000001-0000-0000-0000-000000000101', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000101', 850000, '2026-01-03', 'eft', 'DLAMINI-JAN'),
    ('a4000001-0000-0000-0000-000000000102', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'f0000001-0000-0000-0000-000000000102', 850000, '2026-01-01', 'debicheck', 'DC-VDB-JAN'),
    ('a4000001-0000-0000-0000-000000000103', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'f0000001-0000-0000-0000-000000000103', 1100000, '2026-01-05', 'eft', 'OSEI-JAN'),
    ('a4000001-0000-0000-0000-000000000104', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000004', 'f0000001-0000-0000-0000-000000000104', 1800000, '2026-01-01', 'debicheck', 'DC-MOKOENA-JAN'),
    ('a4000001-0000-0000-0000-000000000105', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000005', 'f0000001-0000-0000-0000-000000000105', 1200000, '2026-01-04', 'eft', 'FOURIE-JAN'),
    -- Feb (Kim stops)
    ('a4000001-0000-0000-0000-000000000201', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000201', 850000, '2026-02-02', 'eft', 'DLAMINI-FEB'),
    ('a4000001-0000-0000-0000-000000000202', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'f0000001-0000-0000-0000-000000000202', 850000, '2026-02-01', 'debicheck', 'DC-VDB-FEB'),
    ('a4000001-0000-0000-0000-000000000204', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000004', 'f0000001-0000-0000-0000-000000000204', 1800000, '2026-02-01', 'debicheck', 'DC-MOKOENA-FEB'),
    ('a4000001-0000-0000-0000-000000000205', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000005', 'f0000001-0000-0000-0000-000000000205', 1200000, '2026-02-03', 'eft', 'FOURIE-FEB'),
    -- Mar (Kim still not paying, Lisa partial)
    ('a4000001-0000-0000-0000-000000000301', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000301', 850000, '2026-03-03', 'eft', 'DLAMINI-MAR'),
    ('a4000001-0000-0000-0000-000000000302', v_org_id, 'e0000001-0000-0000-0000-000000000002', 'd0000001-0000-0000-0000-000000000002', 'f0000001-0000-0000-0000-000000000302', 850000, '2026-03-01', 'debicheck', 'DC-VDB-MAR'),
    ('a4000001-0000-0000-0000-000000000304', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000004', 'f0000001-0000-0000-0000-000000000304', 1800000, '2026-03-01', 'debicheck', 'DC-MOKOENA-MAR'),
    ('a4000001-0000-0000-0000-000000000305', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000005', 'f0000001-0000-0000-0000-000000000305', 600000, '2026-03-15', 'eft', 'FOURIE-MAR-PARTIAL'),
    -- Apr
    ('a4000001-0000-0000-0000-000000000401', v_org_id, 'e0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001', 'f0000001-0000-0000-0000-000000000401', 850000, '2026-04-02', 'eft', 'DLAMINI-APR'),
    ('a4000001-0000-0000-0000-000000000404', v_org_id, 'e0000001-0000-0000-0000-000000000004', 'd0000001-0000-0000-0000-000000000004', 'f0000001-0000-0000-0000-000000000404', 1800000, '2026-04-01', 'debicheck', 'DC-MOKOENA-APR')
  ON CONFLICT (id) DO NOTHING;

  -- ── ARREARS CASES ───────────────────────────────────────────────────────
  INSERT INTO arrears_cases (id, org_id, lease_id, tenant_id, unit_id, property_id, total_arrears_cents, oldest_outstanding_date, current_step, status) VALUES
    ('a5000001-0000-0000-0000-000000000001', v_org_id, 'e0000001-0000-0000-0000-000000000003', 'd0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 3300000, '2026-02-01', 3, 'open'),
    ('a5000001-0000-0000-0000-000000000002', v_org_id, 'e0000001-0000-0000-0000-000000000005', 'd0000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000006', 'a0000001-0000-0000-0000-000000000002', 1800000, '2026-03-01', 1, 'open')
  ON CONFLICT (id) DO NOTHING;

  -- ── DEPOSIT TRANSACTIONS ────────────────────────────────────────────────
  -- deposit_transactions: no transaction_date column; use created_at via default. transaction_type must match CHECK constraint.
  INSERT INTO deposit_transactions (id, org_id, tenant_id, lease_id, amount_cents, direction, transaction_type, description, created_at) VALUES
    ('a6000001-0000-0000-0000-000000000001', v_org_id, 'd0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 1700000, 'credit', 'deposit_received', 'Deposit — Sipho Dlamini', '2025-07-01'),
    ('a6000001-0000-0000-0000-000000000002', v_org_id, 'd0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000002', 1700000, 'credit', 'deposit_received', 'Deposit — Rina van der Berg', '2025-03-01'),
    ('a6000001-0000-0000-0000-000000000003', v_org_id, 'd0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000003', 2200000, 'credit', 'deposit_received', 'Deposit — Kim Osei', '2024-06-01'),
    ('a6000001-0000-0000-0000-000000000004', v_org_id, 'd0000001-0000-0000-0000-000000000004', 'e0000001-0000-0000-0000-000000000004', 3600000, 'credit', 'deposit_received', 'Deposit — Mokoena Consulting', '2025-01-01'),
    ('a6000001-0000-0000-0000-000000000005', v_org_id, 'd0000001-0000-0000-0000-000000000005', 'e0000001-0000-0000-0000-000000000005', 2400000, 'credit', 'deposit_received', 'Deposit — Fourie & Associates', '2025-04-01'),
    ('a6000001-0000-0000-0000-000000000010', v_org_id, 'd0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 8600, 'credit', 'interest_accrued', 'Q1 interest — Sipho', '2026-03-31'),
    ('a6000001-0000-0000-0000-000000000011', v_org_id, 'd0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000002', 12400, 'credit', 'interest_accrued', 'Q1 interest — Rina', '2026-03-31'),
    ('a6000001-0000-0000-0000-000000000012', v_org_id, 'd0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000003', 18200, 'credit', 'interest_accrued', 'Q1 interest — Kim', '2026-03-31')
  ON CONFLICT (id) DO NOTHING;

  -- ── TRUST TRANSACTIONS ──────────────────────────────────────────────────
  INSERT INTO trust_transactions (id, org_id, transaction_type, direction, amount_cents, description, reference, created_at) VALUES
    ('a7000001-0000-0000-0000-000000000001', v_org_id, 'rent_received', 'credit', 850000, 'Rent — Dlamini Apr', 'DLAMINI-APR', '2026-04-02'),
    ('a7000001-0000-0000-0000-000000000002', v_org_id, 'rent_received', 'credit', 1800000, 'Rent — Mokoena Apr', 'DC-MOKOENA-APR', '2026-04-01'),
    ('a7000001-0000-0000-0000-000000000003', v_org_id, 'rent_received', 'credit', 850000, 'Rent — Dlamini Mar', 'DLAMINI-MAR', '2026-03-03'),
    ('a7000001-0000-0000-0000-000000000004', v_org_id, 'rent_received', 'credit', 850000, 'Rent — van der Berg Mar', 'DC-VDB-MAR', '2026-03-01'),
    ('a7000001-0000-0000-0000-000000000005', v_org_id, 'rent_received', 'credit', 1800000, 'Rent — Mokoena Mar', 'DC-MOKOENA-MAR', '2026-03-01'),
    ('a7000001-0000-0000-0000-000000000006', v_org_id, 'rent_received', 'credit', 600000, 'Rent — Fourie partial Mar', 'FOURIE-MAR-PARTIAL', '2026-03-15'),
    ('a7000001-0000-0000-0000-000000000010', v_org_id, 'expense_paid', 'debit', 185000, 'DW Plumbing — blocked drain', 'INV-DW-0042', '2026-02-20'),
    ('a7000001-0000-0000-0000-000000000011', v_org_id, 'expense_paid', 'debit', 450000, 'Sparks Electrical — rewire', 'INV-SP-0018', '2026-03-15'),
    ('a7000001-0000-0000-0000-000000000012', v_org_id, 'expense_paid', 'debit', 95000, 'Clean Sweep — pest control', 'INV-CS-0007', '2026-04-05'),
    ('a7000001-0000-0000-0000-000000000020', v_org_id, 'owner_payment', 'debit', 1420000, 'Owner payout — Bouwer Feb', 'STMT-02-JB', '2026-03-05'),
    ('a7000001-0000-0000-0000-000000000021', v_org_id, 'owner_payment', 'debit', 3200000, 'Owner payout — Steenberg Feb', 'STMT-02-SI', '2026-03-05'),
    ('a7000001-0000-0000-0000-000000000030', v_org_id, 'management_fee', 'debit', 68000, 'Fee 8% — Boegoe Feb', 'FEE-02-B', '2026-03-05'),
    ('a7000001-0000-0000-0000-000000000031', v_org_id, 'management_fee', 'debit', 240000, 'Fee 8% — Vineyard Feb', 'FEE-02-V', '2026-03-05'),
    ('a7000001-0000-0000-0000-000000000040', v_org_id, 'deposit_received', 'credit', 1700000, 'Deposit — Dlamini', 'DEP-SD', '2025-07-01'),
    ('a7000001-0000-0000-0000-000000000041', v_org_id, 'deposit_received', 'credit', 2200000, 'Deposit — Osei', 'DEP-KO', '2024-06-01'),
    ('a7000001-0000-0000-0000-000000000042', v_org_id, 'deposit_received', 'credit', 3600000, 'Deposit — Mokoena', 'DEP-MC', '2025-01-01')
  ON CONFLICT (id) DO NOTHING;

  -- ── MAINTENANCE REQUESTS ────────────────────────────────────────────────
  INSERT INTO maintenance_requests (id, org_id, property_id, unit_id, lease_id, title, description, logged_by, category, urgency, status, work_order_number, actual_cost_cents, created_at, completed_at, contractor_id) VALUES
    ('a8000001-0000-0000-0000-000000000001', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'e0000001-0000-0000-0000-000000000001', 'Blocked kitchen drain', 'Water backing up into sink, tenant unable to use kitchen', 'tenant', 'plumbing', 'urgent', 'completed', 'WO-2026-001', 185000, '2026-02-15', '2026-02-20', 'a3000001-0000-0000-0000-000000000001'),
    ('a8000001-0000-0000-0000-000000000002', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000003', 'e0000001-0000-0000-0000-000000000003', 'DB board tripping', 'Main DB board tripping repeatedly, no power in unit', 'tenant', 'electrical', 'emergency', 'completed', 'WO-2026-002', 450000, '2026-03-10', '2026-03-15', 'a3000001-0000-0000-0000-000000000001'),
    ('a8000001-0000-0000-0000-000000000003', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000005', 'e0000001-0000-0000-0000-000000000004', 'Annual pest treatment', 'Scheduled annual pest control for commercial suite', 'agent', 'pest_control', 'routine', 'completed', 'WO-2026-003', 95000, '2026-03-25', '2026-04-05', 'a3000001-0000-0000-0000-000000000002'),
    ('a8000001-0000-0000-0000-000000000004', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000002', 'e0000001-0000-0000-0000-000000000002', 'Slow-draining shower', 'Possible hair blockage in shower drain', 'tenant', 'plumbing', 'routine', 'in_progress', 'WO-2026-004', NULL, '2026-04-08', NULL, 'a3000001-0000-0000-0000-000000000001'),
    ('a8000001-0000-0000-0000-000000000005', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000006', 'e0000001-0000-0000-0000-000000000005', 'Ceiling leak after rain', 'Water stain appearing on reception ceiling after heavy rain', 'tenant', 'structural', 'urgent', 'approved', 'WO-2026-005', NULL, '2026-04-10', NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  -- ── MAINTENANCE DELAY EVENTS ────────────────────────────────────────────
  INSERT INTO maintenance_delay_events (id, org_id, maintenance_id, delay_type, attributed_to, occurred_at, original_date, rescheduled_to, note, recorded_by) VALUES
    ('a9000001-0000-0000-0000-000000000001', v_org_id, 'a8000001-0000-0000-0000-000000000002', 'contractor_rescheduled', 'contractor', '2026-03-12', '2026-03-12', '2026-03-14', 'Sparks rescheduled — another emergency', v_user_id),
    ('a9000001-0000-0000-0000-000000000002', v_org_id, 'a8000001-0000-0000-0000-000000000004', 'tenant_not_available', 'tenant', '2026-04-10', '2026-04-10', '2026-04-14', 'Tenant not home', v_user_id)
  ON CONFLICT (id) DO NOTHING;

  -- ── SUPPLIER INVOICES ───────────────────────────────────────────────────
  -- supplier_invoices: uses amount_excl_vat_cents + vat_amount_cents + amount_incl_vat_cents (no amount_cents or supplier_name columns)
  INSERT INTO supplier_invoices (id, org_id, property_id, contractor_id, invoice_date, description, amount_excl_vat_cents, vat_amount_cents, amount_incl_vat_cents, payment_source, status) VALUES
    ('aa000001-0000-0000-0000-000000000001', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000001', '2026-02-20', 'Blocked drain repair — Oak Manor Unit 1', 160870, 24130, 185000, 'trust', 'paid'),
    ('aa000001-0000-0000-0000-000000000002', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000001', '2026-03-15', 'DB board rewire — Oak Manor Unit 3', 391304, 58696, 450000, 'trust', 'paid'),
    ('aa000001-0000-0000-0000-000000000003', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'a3000001-0000-0000-0000-000000000002', '2026-04-05', 'Pest treatment — Vineyard Suite A', 82609, 12391, 95000, 'trust', 'paid'),
    ('aa000001-0000-0000-0000-000000000004', v_org_id, 'a0000001-0000-0000-0000-000000000001', NULL, '2026-03-31', 'Monthly garden maintenance — Oak Manor', 304348, 45652, 350000, 'trust', 'paid')
  ON CONFLICT (id) DO NOTHING;

  -- ── OWNER STATEMENTS ────────────────────────────────────────────────────
  INSERT INTO owner_statements (id, org_id, property_id, period_month, period_from, period_to, gross_income_cents, total_expenses_cents, management_fee_cents, management_fee_vat_cents, net_to_owner_cents, status, owner_payment_status) VALUES
    ('ab000001-0000-0000-0000-000000000001', v_org_id, 'a0000001-0000-0000-0000-000000000001', '2026-02-01', '2026-02-01', '2026-02-28', 1700000, 185000, 136000, 20400, 1358600, 'sent', 'paid'),
    ('ab000001-0000-0000-0000-000000000002', v_org_id, 'a0000001-0000-0000-0000-000000000002', '2026-02-01', '2026-02-01', '2026-02-28', 3000000, 0, 240000, 36000, 2724000, 'sent', 'paid'),
    ('ab000001-0000-0000-0000-000000000003', v_org_id, 'a0000001-0000-0000-0000-000000000001', '2026-03-01', '2026-03-01', '2026-03-31', 1700000, 800000, 136000, 20400, 743600, 'sent', 'pending'),
    ('ab000001-0000-0000-0000-000000000004', v_org_id, 'a0000001-0000-0000-0000-000000000002', '2026-03-01', '2026-03-01', '2026-03-31', 2400000, 95000, 192000, 28800, 2084200, 'sent', 'pending')
  ON CONFLICT (id) DO NOTHING;

  -- ── MUNICIPAL BILLS ─────────────────────────────────────────────────────
  -- municipal_bills requires municipal_account_id (FK) — skip for now, needs municipal_accounts records first
  -- TODO: Add municipal_accounts + municipal_bills when testing municipal cost report

  -- ── INSPECTIONS ─────────────────────────────────────────────────────────
  -- inspections: 'routine' is not valid, use 'periodic'
  INSERT INTO inspections (id, org_id, property_id, unit_id, inspection_type, status, scheduled_date) VALUES
    ('ad000001-0000-0000-0000-000000000001', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000003', 'move_out', 'scheduled', '2026-05-25'),
    ('ad000001-0000-0000-0000-000000000002', v_org_id, 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'periodic', 'scheduled', '2026-04-20'),
    ('ad000001-0000-0000-0000-000000000003', v_org_id, 'a0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000005', 'periodic', 'scheduled', '2026-04-05')
  ON CONFLICT (id) DO NOTHING;

  -- ── CONSENT LOG ─────────────────────────────────────────────────────────
  -- consent_log: consent_type CHECK values: credit_check, data_processing, marketing, trust_account_notice, popia_application, lease_template_disclaimer
  -- consent_given (boolean NOT NULL) required
  INSERT INTO consent_log (id, org_id, subject_email, consent_type, consent_given, consent_version, created_at) VALUES
    (gen_random_uuid(), v_org_id, 'sipho.d@gmail.com', 'credit_check', true, '1.0', '2025-06-15'),
    (gen_random_uuid(), v_org_id, 'sipho.d@gmail.com', 'lease_template_disclaimer', true, '1.0', '2025-07-01'),
    (gen_random_uuid(), v_org_id, 'rina.vdb@gmail.com', 'credit_check', true, '1.0', '2025-02-10'),
    (gen_random_uuid(), v_org_id, 'rina.vdb@gmail.com', 'lease_template_disclaimer', true, '1.0', '2025-03-01'),
    (gen_random_uuid(), v_org_id, 'kim.osei@yahoo.com', 'credit_check', true, '1.0', '2024-05-20'),
    (gen_random_uuid(), v_org_id, 'kim.osei@yahoo.com', 'lease_template_disclaimer', true, '1.0', '2024-06-01'),
    (gen_random_uuid(), v_org_id, 'thabo@mokoena.co.za', 'credit_check', true, '1.0', '2024-12-15'),
    (gen_random_uuid(), v_org_id, 'thabo@mokoena.co.za', 'lease_template_disclaimer', true, '1.0', '2025-01-01'),
    (gen_random_uuid(), v_org_id, 'lisa@fourielaw.co.za', 'credit_check', true, '1.0', '2025-03-10'),
    (gen_random_uuid(), v_org_id, 'lisa@fourielaw.co.za', 'lease_template_disclaimer', true, '1.0', '2025-04-01'),
    (gen_random_uuid(), v_org_id, 'kim.osei@yahoo.com', 'data_processing', true, '1.0', '2026-03-10')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Test data seeded successfully';
END $$;
