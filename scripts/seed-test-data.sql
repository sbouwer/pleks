-- ============================================================================
-- PLEKS TEST DATA SEED — current schema (rebuilt 2026-06-03)
-- Run in the Supabase SQL editor (or apply via MCP). Idempotent: ON CONFLICT
-- (id) DO NOTHING on every insert, deterministic UUIDs, safe to re-run.
-- Resolves the org + a user from the live tables, so it works on any single-org DB.
--
-- Covers (matched to the live schema — 25A contacts, multi-address, multi-bank,
-- supplier_type x6, lease_co_tenants.is_signatory, maintenance tenant_rating):
--   landlords  — individual x3, company (pty_ltd), trust          (5)
--   tenants    — individual x5, company (pty_ltd) x2 + 1 signatory co-lessee
--   suppliers  — ALL six supplier_types (contractor/recurring/both/
--                managing_scheme/utility/other), companies + a sole trader
--   properties — 5 across WC + Gauteng, residential + commercial, landlord_id linked
--   units      — 14, occupied / notice / vacant mix
--   leases     — 7 (residential, commercial, a FRANCHISE, one in arrears) +
--                a company signatory promoted to a co-lessee (is_signatory)
--   invoices   — rent (paid/open/overdue) + payments + supplier invoices (all statuses)
--   arrears    — 1 open arrears case (3 months overdue)
--   ratings    — maintenance jobs with a deliberate spread:
--                Hannes Plumbing avg 4.7 (good), BuildRight avg 1.5 (bad)
--
-- ID prefixes: c1=individual contact · c2=company contact · c3=company person ·
--   d1=landlord · e1=tenant · f1=contractor · b1=property · b2=unit · b3=lease ·
--   b4=co-tenant · c5=rent invoice · c6=payment · c7=arrears · c8=supplier invoice ·
--   c9=maintenance · a3=address · a4=bank account
-- To clear: delete rows with these id prefixes (children first), or reset the org.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- LAYER A — contacts (incl. 25A company people + signatories) + role records
--           + addresses + bank accounts
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_org uuid; v_user uuid;
BEGIN
  SELECT id INTO v_org FROM organisations ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_user FROM user_orgs WHERE org_id = v_org LIMIT 1;

  INSERT INTO contacts (id, org_id, entity_type, primary_role, first_name, last_name, primary_email, primary_phone, id_type, id_number, id_number_hash, created_by) VALUES
   ('c1000000-0000-0000-0000-000000000001', v_org,'individual','landlord','Marius','Jones','marius.jones@gmail.com','0823334444','sa_id','7008145012089', encode(sha256('7008145012089'::bytea),'hex'), v_user),
   ('c1000000-0000-0000-0000-000000000002', v_org,'individual','landlord','Annelize','Botha','a.botha@outlook.com','0833335555','sa_id','8203120045086', encode(sha256('8203120045086'::bytea),'hex'), v_user),
   ('c1000000-0000-0000-0000-000000000003', v_org,'individual','landlord','Themba','Nala','themba.nala@gmail.com','0844446666',NULL,NULL,NULL, v_user),
   ('c1000000-0000-0000-0000-000000000010', v_org,'individual','tenant','Sipho','Dlamini','sipho.d@gmail.com','0799998877','sa_id','9105125678901', encode(sha256('9105125678901'::bytea),'hex'), v_user),
   ('c1000000-0000-0000-0000-000000000011', v_org,'individual','tenant','Rina','van der Berg','rina.vdb@gmail.com','0724441122','sa_id','7803030045081', encode(sha256('7803030045081'::bytea),'hex'), v_user),
   ('c1000000-0000-0000-0000-000000000012', v_org,'individual','tenant','Kimberly','Osei','kim.osei@yahoo.com','0611234567',NULL,NULL,NULL, v_user),
   ('c1000000-0000-0000-0000-000000000013', v_org,'individual','tenant','Peter','Nkosi','peter.nkosi@outlook.com','0835557890','sa_id','8807055009088', encode(sha256('8807055009088'::bytea),'hex'), v_user),
   ('c1000000-0000-0000-0000-000000000014', v_org,'individual','tenant','Naledi','Khumalo','naledi.k@gmail.com','0726669999',NULL,NULL,NULL, v_user),
   ('c1000000-0000-0000-0000-000000000020', v_org,'individual','contractor','Joe','Witbooi','joe.handyman@gmail.com','0812223333',NULL,NULL,NULL, v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contacts (id, org_id, entity_type, primary_role, company_name, registration_number, vat_number, juristic_type, primary_email, primary_phone, created_by) VALUES
   ('c2000000-0000-0000-0000-000000000001', v_org,'organisation','landlord','Steenberg Investments (Pty) Ltd','2014/118822/07','4530192833','pty_ltd','accounts@steenberg-inv.co.za','0214470000', v_user),
   ('c2000000-0000-0000-0000-000000000002', v_org,'organisation','landlord','Le Roux Family Trust','IT2298/2009',NULL,'trust','admin@lerouxtrust.co.za','0218881212', v_user),
   ('c2000000-0000-0000-0000-000000000010', v_org,'organisation','tenant','Mokoena Consulting (Pty) Ltd','2019/445566/07','4910223344','pty_ltd','accounts@mokoena.co.za','0215557890', v_user),
   ('c2000000-0000-0000-0000-000000000011', v_org,'organisation','tenant','QuickServe Franchising (Pty) Ltd','2017/220011/07','4660111222','pty_ltd','ops@quickserve.co.za','0216669090', v_user),
   ('c2000000-0000-0000-0000-000000000020', v_org,'organisation','contractor','Hannes Plumbing & Roofing','2016/114882/23',NULL,'pty_ltd','hannes@plumb.co.za','0825554127', v_user),
   ('c2000000-0000-0000-0000-000000000021', v_org,'organisation','contractor','Sparkle Cleaning CC','2012/006677/23','4220556677','cc','ops@sparkleclean.co.za','0213334455', v_user),
   ('c2000000-0000-0000-0000-000000000022', v_org,'organisation','contractor','BuildRight Maintenance (Pty) Ltd','2018/334455/07','4770998811','pty_ltd','jobs@buildright.co.za','0217778899', v_user),
   ('c2000000-0000-0000-0000-000000000023', v_org,'organisation','contractor','Sentinel Facilities','2011/009245/07','4920178833','pty_ltd','ops@sentinel.co.za','0214479920', v_user),
   ('c2000000-0000-0000-0000-000000000024', v_org,'organisation','contractor','City of Cape Town','CCT-MUNI',NULL,'other_juristic','accounts@capetown.gov.za','0860103089', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contacts (id, org_id, entity_type, primary_role, organisation_contact_id, company_function, designation, is_primary_contact, is_signatory, id_type, id_number, id_number_hash, first_name, last_name, primary_email, primary_phone, created_by) VALUES
   ('c3000000-0000-0000-0000-000000000001', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000001','owner_director','Managing Director',true,true,'sa_id','7406155013088', encode(sha256('7406155013088'::bytea),'hex'),'Pieter','Steenberg','pieter@steenberg-inv.co.za','0823001001', v_user),
   ('c3000000-0000-0000-0000-000000000002', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000002','owner_director','Trustee',true,true,'sa_id','6809220034082', encode(sha256('6809220034082'::bytea),'hex'),'Hendrik','le Roux','hendrik@lerouxtrust.co.za','0823002002', v_user),
   ('c3000000-0000-0000-0000-000000000010', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000010','owner_director','Director',true,true,'sa_id','8001015009087', encode(sha256('8001015009087'::bytea),'hex'),'Thabo','Mokoena','thabo@mokoena.co.za','0823010010', v_user),
   ('c3000000-0000-0000-0000-000000000011', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000010','accounts','Bookkeeper',false,false,NULL,NULL,NULL,'Sarah','Naidoo','sarah@mokoena.co.za','0823010011', v_user),
   ('c3000000-0000-0000-0000-000000000012', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000011','owner_director','Franchise Principal',true,true,'sa_id','7505065800082', encode(sha256('7505065800082'::bytea),'hex'),'Lindiwe','Zulu','lindiwe@quickserve.co.za','0823011012', v_user),
   ('c3000000-0000-0000-0000-000000000020', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000020','owner_director','Owner',true,false,NULL,NULL,NULL,'Hannes','Pretorius','hannes@plumb.co.za','0825554127', v_user),
   ('c3000000-0000-0000-0000-000000000023', v_org,'individual','company_contact','c2000000-0000-0000-0000-000000000023','account_manager','Operations',true,false,NULL,NULL,NULL,'Marlize','de Wet','ops@sentinel.co.za','0214479920', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO landlords (id, org_id, contact_id, tax_number, payment_method, created_by) VALUES
   ('d1000000-0000-0000-0000-000000000001', v_org,'c1000000-0000-0000-0000-000000000001','9012345678','eft', v_user),
   ('d1000000-0000-0000-0000-000000000002', v_org,'c1000000-0000-0000-0000-000000000002',NULL,'eft', v_user),
   ('d1000000-0000-0000-0000-000000000003', v_org,'c1000000-0000-0000-0000-000000000003',NULL,'eft', v_user),
   ('d1000000-0000-0000-0000-000000000010', v_org,'c2000000-0000-0000-0000-000000000001','9911223344','eft', v_user),
   ('d1000000-0000-0000-0000-000000000011', v_org,'c2000000-0000-0000-0000-000000000002',NULL,'eft', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tenants (id, org_id, contact_id, popia_consent_given, popia_consent_given_at, employment_type, occupation, created_by) VALUES
   ('e1000000-0000-0000-0000-000000000010', v_org,'c1000000-0000-0000-0000-000000000010',true, now(),'permanent','Software Developer', v_user),
   ('e1000000-0000-0000-0000-000000000011', v_org,'c1000000-0000-0000-0000-000000000011',true, now(),'self_employed','Consultant', v_user),
   ('e1000000-0000-0000-0000-000000000012', v_org,'c1000000-0000-0000-0000-000000000012',true, now(),'permanent','Teacher', v_user),
   ('e1000000-0000-0000-0000-000000000013', v_org,'c1000000-0000-0000-0000-000000000013',true, now(),'contract','Driver', v_user),
   ('e1000000-0000-0000-0000-000000000014', v_org,'c1000000-0000-0000-0000-000000000014',true, now(),'permanent','Nurse', v_user),
   ('e1000000-0000-0000-0000-000000000020', v_org,'c2000000-0000-0000-0000-000000000010',true, now(),NULL,NULL, v_user),
   ('e1000000-0000-0000-0000-000000000021', v_org,'c2000000-0000-0000-0000-000000000011',true, now(),NULL,NULL, v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contractors (id, org_id, contact_id, supplier_type, specialities, call_out_rate_cents, hourly_rate_cents, vat_registered, is_active, created_by) VALUES
   ('f1000000-0000-0000-0000-000000000020', v_org,'c2000000-0000-0000-0000-000000000020','contractor', ARRAY['Plumbing','Roofing','Waterproofing'], 65000, 45000, false, true, v_user),
   ('f1000000-0000-0000-0000-000000000021', v_org,'c2000000-0000-0000-0000-000000000021','recurring', ARRAY['Cleaning'], 0, 28000, true, true, v_user),
   ('f1000000-0000-0000-0000-000000000022', v_org,'c2000000-0000-0000-0000-000000000022','both', ARRAY['General Maintenance','Painting','Carpentry'], 50000, 38000, true, true, v_user),
   ('f1000000-0000-0000-0000-000000000023', v_org,'c2000000-0000-0000-0000-000000000023','managing_scheme', ARRAY['Security','Body Corporate','Cleaning'], 0, 0, true, true, v_user),
   ('f1000000-0000-0000-0000-000000000024', v_org,'c2000000-0000-0000-0000-000000000024','utility', ARRAY['Electrical'], 0, 0, false, true, v_user),
   ('f1000000-0000-0000-0000-000000000025', v_org,'c1000000-0000-0000-0000-000000000020','other', ARRAY['General Maintenance','Locksmith'], 35000, 25000, false, true, v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contact_addresses (id, org_id, contact_id, address_type, street_line1, suburb, city, province, postal_code, country, is_primary) VALUES
   ('a3000000-0000-0000-0000-000000000001', v_org,'c2000000-0000-0000-0000-000000000001','physical','12 Steenberg Road','Tokai','Cape Town','Western Cape','7945','South Africa',true),
   ('a3000000-0000-0000-0000-000000000002', v_org,'c2000000-0000-0000-0000-000000000001','postal','PO Box 1182','Tokai','Cape Town','Western Cape','7966','South Africa',false),
   ('a3000000-0000-0000-0000-000000000003', v_org,'c2000000-0000-0000-0000-000000000010','physical','40 Loop Street','City Centre','Cape Town','Western Cape','8001','South Africa',true),
   ('a3000000-0000-0000-0000-000000000004', v_org,'c2000000-0000-0000-0000-000000000010','billing','Suite 5, The Hub','Century City','Cape Town','Western Cape','7441','South Africa',false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO contact_bank_accounts (id, org_id, contact_id, account_type, bank_name, account_number, branch_code, is_primary, created_by) VALUES
   ('a4000000-0000-0000-0000-000000000001', v_org,'c1000000-0000-0000-0000-000000000001','cheque','FNB','62012345678','250655',true, v_user),
   ('a4000000-0000-0000-0000-000000000002', v_org,'c1000000-0000-0000-0000-000000000002','savings','Nedbank','1009887766','198765',true, v_user),
   ('a4000000-0000-0000-0000-000000000010', v_org,'c2000000-0000-0000-0000-000000000001','cheque','Standard Bank','041223344','051001',true, v_user),
   ('a4000000-0000-0000-0000-000000000011', v_org,'c2000000-0000-0000-0000-000000000002','cheque','ABSA','4078123456','632005',true, v_user),
   ('a4000000-0000-0000-0000-000000000020', v_org,'c2000000-0000-0000-0000-000000000020','cheque','FNB','62511223344','250655',true, v_user),
   ('a4000000-0000-0000-0000-000000000021', v_org,'c2000000-0000-0000-0000-000000000021','savings','Capitec','1772334455','470010',true, v_user),
   ('a4000000-0000-0000-0000-000000000024', v_org,'c2000000-0000-0000-0000-000000000024','cheque','Standard Bank','070112233','051001',true, v_user)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- LAYER B — properties + units + leases (+ company signatory co-lessee)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_org uuid; v_user uuid;
BEGIN
  SELECT id INTO v_org FROM organisations ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_user FROM user_orgs WHERE org_id = v_org LIMIT 1;

  INSERT INTO properties (id, org_id, name, address_line1, suburb, city, province, postal_code, type, landlord_id, managed_mode, owner_name, owner_email) VALUES
   ('b1000000-0000-0000-0000-000000000001', v_org,'Oak Manor','14 Oak Avenue','Kenilworth','Cape Town','Western Cape','7708','residential','d1000000-0000-0000-0000-000000000001','managed_for_owner','Marius Jones','marius.jones@gmail.com'),
   ('b1000000-0000-0000-0000-000000000002', v_org,'Vineyard Office Park','22 Vineyard Road','Claremont','Cape Town','Western Cape','7708','commercial','d1000000-0000-0000-0000-000000000010','managed_for_owner','Steenberg Investments (Pty) Ltd','accounts@steenberg-inv.co.za'),
   ('b1000000-0000-0000-0000-000000000003', v_org,'Bayview Apartments','8 Beach Road','Sea Point','Cape Town','Western Cape','8005','residential','d1000000-0000-0000-0000-000000000011','managed_for_owner','Le Roux Family Trust','admin@lerouxtrust.co.za'),
   ('b1000000-0000-0000-0000-000000000004', v_org,'Sandton Heights','45 Rivonia Road','Sandton','Johannesburg','Gauteng','2196','residential','d1000000-0000-0000-0000-000000000002','managed_for_owner','Annelize Botha','a.botha@outlook.com'),
   ('b1000000-0000-0000-0000-000000000005', v_org,'The Stables','3 Vineyard Close','Constantia','Cape Town','Western Cape','7806','residential','d1000000-0000-0000-0000-000000000003','managed_for_owner','Themba Nala','themba.nala@gmail.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO units (id, org_id, property_id, unit_number, bedrooms, bathrooms, size_m2, status, market_rent_cents, asking_rent_cents, deposit_amount_cents) VALUES
   ('b2000000-0000-0000-0000-000000000001', v_org,'b1000000-0000-0000-0000-000000000001','Unit 1',2,1,65,'occupied',850000,850000,1275000),
   ('b2000000-0000-0000-0000-000000000002', v_org,'b1000000-0000-0000-0000-000000000001','Unit 2',2,1,65,'occupied',850000,850000,1275000),
   ('b2000000-0000-0000-0000-000000000003', v_org,'b1000000-0000-0000-0000-000000000001','Unit 3',3,2,90,'notice',1100000,1100000,1650000),
   ('b2000000-0000-0000-0000-000000000004', v_org,'b1000000-0000-0000-0000-000000000001','Unit 4',1,1,45,'vacant',650000,650000,975000),
   ('b2000000-0000-0000-0000-000000000005', v_org,'b1000000-0000-0000-0000-000000000002','Suite A',NULL,NULL,120,'occupied',1800000,1800000,3600000),
   ('b2000000-0000-0000-0000-000000000006', v_org,'b1000000-0000-0000-0000-000000000002','Suite B',NULL,NULL,80,'occupied',1200000,1200000,2400000),
   ('b2000000-0000-0000-0000-000000000007', v_org,'b1000000-0000-0000-0000-000000000002','Suite C',NULL,NULL,60,'vacant',950000,950000,1900000),
   ('b2000000-0000-0000-0000-000000000008', v_org,'b1000000-0000-0000-0000-000000000003','101',2,2,75,'occupied',1450000,1450000,2175000),
   ('b2000000-0000-0000-0000-000000000009', v_org,'b1000000-0000-0000-0000-000000000003','102',1,1,52,'occupied',1100000,1100000,1650000),
   ('b2000000-0000-0000-0000-00000000000a', v_org,'b1000000-0000-0000-0000-000000000003','103',2,2,75,'vacant',1450000,1450000,2175000),
   ('b2000000-0000-0000-0000-00000000000b', v_org,'b1000000-0000-0000-0000-000000000004','A',3,2,110,'occupied',1600000,1600000,2400000),
   ('b2000000-0000-0000-0000-00000000000c', v_org,'b1000000-0000-0000-0000-000000000004','B',2,1,80,'vacant',1200000,1200000,1800000),
   ('b2000000-0000-0000-0000-00000000000d', v_org,'b1000000-0000-0000-0000-000000000005','Cottage',2,1,70,'occupied',1300000,1300000,1950000),
   ('b2000000-0000-0000-0000-00000000000e', v_org,'b1000000-0000-0000-0000-000000000005','Main House',4,3,180,'occupied',2800000,2800000,4200000)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tenants (id, org_id, contact_id, popia_consent_given, popia_consent_given_at, created_by) VALUES
   ('e1000000-0000-0000-0000-000000000030', v_org,'c3000000-0000-0000-0000-000000000010',true, now(), v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO leases (id, org_id, unit_id, property_id, tenant_id, landlord_id, lease_type, tenant_is_juristic, start_date, end_date, is_fixed_term, rent_amount_cents, deposit_amount_cents, payment_due_day, escalation_percent, escalation_type, deposit_interest_to, status, template_source, template_type, is_franchise_agreement, cpa_applies_at_signing, cpa_determination_category, created_by) VALUES
   ('b3000000-0000-0000-0000-000000000001', v_org,'b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010','d1000000-0000-0000-0000-000000000001','residential',false,'2025-07-01','2026-06-30',true,850000,1275000,1,8,'fixed','tenant','active','pleks','pleks_residential',false,'yes','natural_person', v_user),
   ('b3000000-0000-0000-0000-000000000002', v_org,'b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000011','d1000000-0000-0000-0000-000000000001','residential',false,'2025-03-01','2026-02-28',true,850000,1275000,1,8,'fixed','tenant','active','pleks','pleks_residential',false,'yes','natural_person', v_user),
   ('b3000000-0000-0000-0000-000000000003', v_org,'b2000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000012','d1000000-0000-0000-0000-000000000001','residential',false,'2024-09-01','2025-08-31',true,1100000,1650000,1,7,'fixed','tenant','notice','pleks','pleks_residential',false,'yes','natural_person', v_user),
   ('b3000000-0000-0000-0000-000000000004', v_org,'b2000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000020','d1000000-0000-0000-0000-000000000010','commercial',true,'2025-01-01','2027-12-31',true,1800000,3600000,1,9,'fixed','landlord','active','pleks','pleks_commercial',false,'yes','juristic_under_threshold', v_user),
   ('b3000000-0000-0000-0000-000000000005', v_org,'b2000000-0000-0000-0000-000000000006','b1000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000021','d1000000-0000-0000-0000-000000000010','commercial',true,'2025-04-01','2028-03-31',true,1200000,2400000,1,9,'fixed','landlord','active','pleks','pleks_commercial',true,'yes','franchise_agreement', v_user),
   ('b3000000-0000-0000-0000-000000000006', v_org,'b2000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000013','d1000000-0000-0000-0000-000000000011','residential',false,'2025-02-01','2026-01-31',true,1450000,2175000,1,8,'fixed','tenant','active','pleks','pleks_residential',false,'yes','natural_person', v_user),
   ('b3000000-0000-0000-0000-000000000007', v_org,'b2000000-0000-0000-0000-00000000000d','b1000000-0000-0000-0000-000000000005','e1000000-0000-0000-0000-000000000014','d1000000-0000-0000-0000-000000000003','residential',false,'2025-06-01','2026-05-31',true,1300000,1950000,1,8,'fixed','tenant','active','pleks','pleks_residential',false,'yes','natural_person', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO lease_co_tenants (id, org_id, lease_id, tenant_id, is_signatory) VALUES
   ('b4000000-0000-0000-0000-000000000001', v_org,'b3000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000030',true)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- LAYER C — rent invoices + payments + arrears + supplier invoices +
--           maintenance with rating spread (good vs bad suppliers)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_org uuid; v_user uuid;
BEGIN
  SELECT id INTO v_org FROM organisations ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_user FROM user_orgs WHERE org_id = v_org LIMIT 1;

  INSERT INTO rent_invoices (id, org_id, lease_id, unit_id, tenant_id, invoice_number, invoice_date, due_date, period_from, period_to, rent_amount_cents, other_charges_cents, total_amount_cents, status, amount_paid_cents, balance_cents, paid_at) VALUES
   ('c5000000-0000-0000-0000-000000000001', v_org,'b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010','INV-2026-0001','2026-05-01','2026-05-01','2026-05-01','2026-05-31',850000,0,850000,'paid',850000,0,'2026-05-02'),
   ('c5000000-0000-0000-0000-000000000002', v_org,'b3000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010','INV-2026-0002','2026-06-01','2026-06-01','2026-06-01','2026-06-30',850000,0,850000,'open',0,850000,NULL),
   ('c5000000-0000-0000-0000-000000000003', v_org,'b3000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000011','INV-2026-0003','2026-06-01','2026-06-01','2026-06-01','2026-06-30',850000,0,850000,'paid',850000,0,'2026-06-01'),
   ('c5000000-0000-0000-0000-000000000004', v_org,'b3000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000005','e1000000-0000-0000-0000-000000000020','INV-2026-0004','2026-06-01','2026-06-01','2026-06-01','2026-06-30',1800000,0,1800000,'paid',1800000,0,'2026-06-02'),
   ('c5000000-0000-0000-0000-000000000005', v_org,'b3000000-0000-0000-0000-000000000007','b2000000-0000-0000-0000-00000000000d','e1000000-0000-0000-0000-000000000014','INV-2026-0005','2026-06-01','2026-06-01','2026-06-01','2026-06-30',1300000,0,1300000,'paid',1300000,0,'2026-06-03'),
   ('c5000000-0000-0000-0000-000000000010', v_org,'b3000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000008','e1000000-0000-0000-0000-000000000013','INV-2026-0010','2026-04-01','2026-04-01','2026-04-01','2026-04-30',1450000,0,1450000,'overdue',0,1450000,NULL),
   ('c5000000-0000-0000-0000-000000000011', v_org,'b3000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000008','e1000000-0000-0000-0000-000000000013','INV-2026-0011','2026-05-01','2026-05-01','2026-05-01','2026-05-31',1450000,0,1450000,'overdue',0,1450000,NULL),
   ('c5000000-0000-0000-0000-000000000012', v_org,'b3000000-0000-0000-0000-000000000006','b2000000-0000-0000-0000-000000000008','e1000000-0000-0000-0000-000000000013','INV-2026-0012','2026-06-01','2026-06-01','2026-06-01','2026-06-30',1450000,0,1450000,'overdue',0,1450000,NULL)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO payments (id, org_id, invoice_id, lease_id, tenant_id, amount_cents, payment_date, payment_method, reference, recorded_by) VALUES
   ('c6000000-0000-0000-0000-000000000001', v_org,'c5000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010',850000,'2026-05-02','eft','RENT-MAY-DLAMINI', v_user),
   ('c6000000-0000-0000-0000-000000000003', v_org,'c5000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000011',850000,'2026-06-01','eft','RENT-JUN-VDBERG', v_user),
   ('c6000000-0000-0000-0000-000000000004', v_org,'c5000000-0000-0000-0000-000000000004','b3000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000020',1800000,'2026-06-02','eft','RENT-JUN-MOKOENA', v_user),
   ('c6000000-0000-0000-0000-000000000005', v_org,'c5000000-0000-0000-0000-000000000005','b3000000-0000-0000-0000-000000000007','e1000000-0000-0000-0000-000000000014',1300000,'2026-06-03','eft','RENT-JUN-KHUMALO', v_user)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO arrears_cases (id, org_id, lease_id, tenant_id, unit_id, property_id, lease_type, total_arrears_cents, oldest_outstanding_date, months_in_arrears, status) VALUES
   ('c7000000-0000-0000-0000-000000000001', v_org,'b3000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000013','b2000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000003','residential',4350000,'2026-04-01',3,'open')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO supplier_invoices (id, org_id, contractor_id, property_id, invoice_number, invoice_date, description, amount_excl_vat_cents, vat_amount_cents, amount_incl_vat_cents, payment_source, status) VALUES
   ('c8000000-0000-0000-0000-000000000001', v_org,'f1000000-0000-0000-0000-000000000020','b1000000-0000-0000-0000-000000000001','SUP-HP-1001','2026-05-16','Geyser thermostat replacement — Oak Manor Unit 1',421740,63261,485001,'trust','paid'),
   ('c8000000-0000-0000-0000-000000000002', v_org,'f1000000-0000-0000-0000-000000000020','b1000000-0000-0000-0000-000000000001','SUP-HP-1014','2026-05-28','Quote: gutter clean & downpipe — Oak Manor',107826,16174,124000,'trust','approved'),
   ('c8000000-0000-0000-0000-000000000003', v_org,'f1000000-0000-0000-0000-000000000021','b1000000-0000-0000-0000-000000000003','SUP-SC-0442','2026-06-01','Monthly common-area cleaning — Bayview',243478,36522,280000,'agency','pending_payment'),
   ('c8000000-0000-0000-0000-000000000004', v_org,'f1000000-0000-0000-0000-000000000022','b1000000-0000-0000-0000-000000000005','SUP-BR-3310','2026-05-20','Repaint cottage interior — The Stables',695652,104348,800000,'trust','disputed'),
   ('c8000000-0000-0000-0000-000000000005', v_org,'f1000000-0000-0000-0000-000000000023','b1000000-0000-0000-0000-000000000003','SUP-SF-2207','2026-06-01','Estate security & grounds — June',1304348,195652,1500000,'agency','submitted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO maintenance_requests (id, org_id, unit_id, property_id, lease_id, tenant_id, title, description, logged_by, category, urgency, status, contractor_id, completed_at, tenant_rating, tenant_feedback) VALUES
   ('c9000000-0000-0000-0000-000000000001', v_org,'b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010','Geyser leaking','Geyser dripping in the ceiling, no hot water.','tenant','plumbing','urgent','completed','f1000000-0000-0000-0000-000000000020','2026-05-16',5,'Fast, professional, fixed first time.'),
   ('c9000000-0000-0000-0000-000000000002', v_org,'b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000011','Blocked drain','Kitchen drain blocked.','tenant','plumbing','routine','completed','f1000000-0000-0000-0000-000000000020','2026-04-22',4,'Sorted it quickly, slightly late arriving.'),
   ('c9000000-0000-0000-0000-000000000003', v_org,'b2000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000013','Roof leak','Water staining on bedroom ceiling after rain.','tenant','roofing','urgent','completed','f1000000-0000-0000-0000-000000000020','2026-04-10',5,'Excellent — explained everything.'),
   ('c9000000-0000-0000-0000-000000000004', v_org,'b2000000-0000-0000-0000-00000000000d','b1000000-0000-0000-0000-000000000005','b3000000-0000-0000-0000-000000000007','e1000000-0000-0000-0000-000000000014','Interior repaint','Repaint cottage after move-out.','agent','painting','routine','completed','f1000000-0000-0000-0000-000000000022','2026-05-20',2,'Late, messy, paint splatter on floors.'),
   ('c9000000-0000-0000-0000-000000000005', v_org,'b2000000-0000-0000-0000-000000000005','b1000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000020','Aircon servicing','Office aircon not cooling.','tenant','hvac','routine','completed','f1000000-0000-0000-0000-000000000022','2026-05-30',1,'Did not fix it, had to call someone else.'),
   ('c9000000-0000-0000-0000-000000000006', v_org,'b2000000-0000-0000-0000-000000000008','b1000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000013','Common area clean','Monthly deep clean of lobby.','agent','cleaning','routine','completed','f1000000-0000-0000-0000-000000000021','2026-06-01',4,'Good job, reliable.'),
   ('c9000000-0000-0000-0000-000000000007', v_org,'b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000010','Tap washer','Bathroom tap dripping.','tenant','plumbing','routine','in_progress','f1000000-0000-0000-0000-000000000020',NULL,NULL,NULL)
  ON CONFLICT (id) DO NOTHING;
END $$;
