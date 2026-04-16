function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export const DEMO_DATA = {
  org: {
    id: "demo-org",
    name: "Pleks Demo Properties",
    email: "demo@pleksproperties.co.za",
    phone: "021 555 0100",
    management_scope: "own_and_others",
    tier: "portfolio" as const,
  },

  // ── Properties ───────────────────────────────────────────────────────────────

  properties: [
    {
      id: "demo-prop-1",
      name: "Kirstenhof Court",
      address: "14 Kirstenhof Avenue, Kirstenhof, Cape Town",
      address_line1: "14 Kirstenhof Avenue",
      suburb: "Kirstenhof",
      city: "Cape Town",
      province: "Western Cape",
      type: "residential",
      units_count: 4,
      occupied: 4,
      occupancy_rate: 100,
      monthly_income_cents: 4400000,
      owner_id: "lo1",
      owner: "A. van Wyk",
    },
    {
      id: "demo-prop-2",
      name: "12 Buitenkant",
      address: "12 Buitenkant Street, Gardens, Cape Town",
      address_line1: "12 Buitenkant Street",
      suburb: "Gardens",
      city: "Cape Town",
      province: "Western Cape",
      type: "residential",
      units_count: 1,
      occupied: 1,
      occupancy_rate: 100,
      monthly_income_cents: 780000,
      owner_id: "lo2",
      owner: "S. Petersen",
    },
    {
      id: "demo-prop-3",
      name: "Welgemeend Estate",
      address: "8 Welgemeend Street, Gardens, Cape Town",
      address_line1: "8 Welgemeend Street",
      suburb: "Gardens",
      city: "Cape Town",
      province: "Western Cape",
      type: "mixed_use",
      units_count: 6,
      occupied: 4,
      occupancy_rate: 67,
      monthly_income_cents: 3860000,
      owner_id: "lo3",
      owner: "Welgemeend Trust",
    },
  ],

  // ── Units ────────────────────────────────────────────────────────────────────

  units: [
    { id: "u1",  property_id: "demo-prop-1", unit_number: "101", bedrooms: 2, monthly_rental_cents: 950000,  status: "occupied" },
    { id: "u2",  property_id: "demo-prop-1", unit_number: "102", bedrooms: 2, monthly_rental_cents: 950000,  status: "occupied" },
    { id: "u3",  property_id: "demo-prop-1", unit_number: "201", bedrooms: 3, monthly_rental_cents: 1250000, status: "occupied" },
    { id: "u4",  property_id: "demo-prop-1", unit_number: "202", bedrooms: 3, monthly_rental_cents: 1250000, status: "occupied" },
    { id: "u5",  property_id: "demo-prop-2", unit_number: "1",   bedrooms: 1, monthly_rental_cents: 780000,  status: "occupied" },
    { id: "u6",  property_id: "demo-prop-3", unit_number: "A1",  bedrooms: 2, monthly_rental_cents: 880000,  status: "occupied" },
    { id: "u7",  property_id: "demo-prop-3", unit_number: "A2",  bedrooms: 2, monthly_rental_cents: 880000,  status: "occupied" },
    { id: "u8",  property_id: "demo-prop-3", unit_number: "B1",  bedrooms: 1, monthly_rental_cents: 650000,  status: "vacant" },
    { id: "u9",  property_id: "demo-prop-3", unit_number: "B2",  bedrooms: 1, monthly_rental_cents: 650000,  status: "occupied" },
    { id: "u10", property_id: "demo-prop-3", unit_number: "C1",  bedrooms: 3, monthly_rental_cents: 1150000, status: "occupied" },
    { id: "u11", property_id: "demo-prop-3", unit_number: "C2",  bedrooms: 3, monthly_rental_cents: 1150000, status: "vacant" },
  ],

  // ── Landlords ────────────────────────────────────────────────────────────────

  landlords: [
    {
      id: "lo1",
      name: "Andries van Wyk",
      email: "andries@vwprop.co.za",
      phone: "082 444 1111",
      entity_type: "individual",
      id_number: "7301015012088",
      properties: ["demo-prop-1"],
      portal_status: "active" as const,
      last_statement_sent: daysAgo(12),
      fica_verified: true,
    },
    {
      id: "lo2",
      name: "Sarah Petersen",
      email: "sarah.p@gmail.com",
      phone: "083 555 2222",
      entity_type: "individual",
      id_number: "8505120456082",
      properties: ["demo-prop-2"],
      portal_status: "invited" as const,
      last_statement_sent: daysAgo(12),
      fica_verified: true,
    },
    {
      id: "lo3",
      name: "Welgemeend Trust",
      email: "admin@welgemeend.co.za",
      phone: "021 444 3333",
      entity_type: "trust",
      id_number: "IT3456/2019",
      properties: ["demo-prop-3"],
      portal_status: "none" as const,
      last_statement_sent: null,
      fica_verified: false,
    },
  ],

  // ── Tenants ──────────────────────────────────────────────────────────────────

  tenants: [
    { id: "t1", full_name: "Amahle Dlamini",     email: "amahle@demo.co.za",   phone: "082 111 2233", unit_id: "u1",  employer: "Discovery Health",        payment_method: "debicheck", status: "good_standing" as const },
    { id: "t2", full_name: "Marco van der Berg",  email: "marco@demo.co.za",    phone: "083 222 3344", unit_id: "u2",  employer: "Standard Bank",           payment_method: "eft",       status: "good_standing" as const },
    { id: "t3", full_name: "Priya Naidoo",        email: "priya@demo.co.za",    phone: "084 333 4455", unit_id: "u3",  employer: "UCT",                     payment_method: "debicheck", status: "good_standing" as const },
    { id: "t4", full_name: "James Fortuin",       email: "james@demo.co.za",    phone: "071 444 5566", unit_id: "u5",  employer: "City of Cape Town",       payment_method: "eft",       status: "good_standing" as const },
    { id: "t5", full_name: "Leilah Hendricks",    email: "leilah@demo.co.za",   phone: "072 555 6677", unit_id: "u6",  employer: "Woolworths SA",           payment_method: "debicheck", status: "good_standing" as const },
    { id: "t6", full_name: "Sipho Motaung",       email: "sipho@demo.co.za",    phone: "073 666 7788", unit_id: "u7",  employer: "Self-employed",           payment_method: "eft",       status: "in_arrears"    as const },
    { id: "t7", full_name: "Caitlin Rousseau",    email: "caitlin@demo.co.za",  phone: "074 777 8899", unit_id: "u10", employer: "Cape Town Tourism Board", payment_method: "debicheck", status: "good_standing" as const },
    { id: "t8", full_name: "Thabo Mahlangu",      email: "thabo@demo.co.za",    phone: "076 888 9900", unit_id: "u4",  employer: "Naspers",                 payment_method: "debicheck", status: "on_notice"     as const },
  ],

  // ── Suppliers (contractors) ───────────────────────────────────────────────────

  suppliers: [
    { id: "con1", company: "FixIt Plumbing",             contact: "Johan Viljoen",   phone: "082 111 0001", trade: "Plumbing",    jobs_completed: 12, avg_rating: 4.2, pending_jobs: 1, vat_registered: false },
    { id: "con2", company: "Cape Electrical Solutions",  contact: "Nadia Fransman",  phone: "083 222 0002", trade: "Electrical",  jobs_completed: 8,  avg_rating: 4.5, pending_jobs: 0, vat_registered: true  },
    { id: "con3", company: "Green Gardens CT",           contact: "Peter Nkomo",     phone: "071 333 0003", trade: "Gardening",   jobs_completed: 24, avg_rating: 4.8, pending_jobs: 2, vat_registered: false },
    { id: "con4", company: "CityPaint Renovations",      contact: "Farouk Adams",    phone: "082 444 0004", trade: "Painting",    jobs_completed: 5,  avg_rating: 4.0, pending_jobs: 0, vat_registered: false },
  ],

  // ── Applications ─────────────────────────────────────────────────────────────

  applications: [
    { id: "app1", applicant: "James Ngcobo",    unit: "B1", unit_id: "u8",  property: "Welgemeend Estate", fit_score: 82, status: "screening" as const,  applied: daysAgo(3),  monthly_income_cents: 3800000, employer: "MTN SA" },
    { id: "app2", applicant: "Rebecca Mills",   unit: "C2", unit_id: "u11", property: "Welgemeend Estate", fit_score: 71, status: "approved"  as const,  applied: daysAgo(8),  monthly_income_cents: 4200000, employer: "Capitec Bank" },
    { id: "app3", applicant: "Tshepo Malinga",  unit: "B1", unit_id: "u8",  property: "Welgemeend Estate", fit_score: 45, status: "declined"  as const,  applied: daysAgo(12), monthly_income_cents: 1800000, employer: "Uber Eats" },
    { id: "app4", applicant: "Nina Scholtz",    unit: "C2", unit_id: "u11", property: "Welgemeend Estate", fit_score: null,  status: "new"       as const,  applied: daysAgo(1),  monthly_income_cents: null,    employer: "" },
  ],

  // ── Leases ───────────────────────────────────────────────────────────────────

  leases: [
    { id: "l1", unit_id: "u1",  tenant_id: "t1", property_id: "demo-prop-1", property_name: "Kirstenhof Court",  unit_number: "101", status: "active", lease_type: "residential", rent_amount_cents: 950000,  deposit_amount_cents: 1900000, start_date: daysAgo(280), end_date: daysFromNow(85),  escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: false },
    { id: "l2", unit_id: "u2",  tenant_id: "t2", property_id: "demo-prop-1", property_name: "Kirstenhof Court",  unit_number: "102", status: "active", lease_type: "residential", rent_amount_cents: 950000,  deposit_amount_cents: 1900000, start_date: daysAgo(120), end_date: daysFromNow(245), escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: false },
    { id: "l3", unit_id: "u3",  tenant_id: "t3", property_id: "demo-prop-1", property_name: "Kirstenhof Court",  unit_number: "201", status: "active", lease_type: "residential", rent_amount_cents: 1250000, deposit_amount_cents: 2500000, start_date: daysAgo(200), end_date: daysFromNow(165), escalation_percent: 10, payment_due_day: 1, cpa_notice_sent: false },
    { id: "l4", unit_id: "u5",  tenant_id: "t4", property_id: "demo-prop-2", property_name: "12 Buitenkant",     unit_number: "1",   status: "active", lease_type: "residential", rent_amount_cents: 780000,  deposit_amount_cents: 1560000, start_date: daysAgo(400), end_date: daysFromNow(45),  escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: true },
    { id: "l5", unit_id: "u6",  tenant_id: "t5", property_id: "demo-prop-3", property_name: "Welgemeend Estate", unit_number: "A1",  status: "active", lease_type: "residential", rent_amount_cents: 880000,  deposit_amount_cents: 1760000, start_date: daysAgo(60),  end_date: daysFromNow(305), escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: false },
    { id: "l6", unit_id: "u7",  tenant_id: "t6", property_id: "demo-prop-3", property_name: "Welgemeend Estate", unit_number: "A2",  status: "active", lease_type: "residential", rent_amount_cents: 880000,  deposit_amount_cents: 1760000, start_date: daysAgo(340), end_date: daysFromNow(25),  escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: true },
    { id: "l7", unit_id: "u10", tenant_id: "t7", property_id: "demo-prop-3", property_name: "Welgemeend Estate", unit_number: "C1",  status: "active", lease_type: "residential", rent_amount_cents: 1150000, deposit_amount_cents: 2300000, start_date: daysAgo(90),  end_date: daysFromNow(275), escalation_percent: 10, payment_due_day: 1, cpa_notice_sent: false },
    { id: "l8", unit_id: "u4",  tenant_id: "t8", property_id: "demo-prop-1", property_name: "Kirstenhof Court",  unit_number: "202", status: "active", lease_type: "residential", rent_amount_cents: 1250000, deposit_amount_cents: 2500000, start_date: daysAgo(150), end_date: daysFromNow(215), escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: false },
    { id: "l9", unit_id: "u9",  tenant_id: "t9", property_id: "demo-prop-3", property_name: "Welgemeend Estate", unit_number: "B2",  status: "active", lease_type: "residential", rent_amount_cents: 650000,  deposit_amount_cents: 1300000, start_date: daysAgo(75),  end_date: daysFromNow(290), escalation_percent: 8,  payment_due_day: 1, cpa_notice_sent: false },
  ],

  // ── Invoices (6 months × 8 leases selectively) ───────────────────────────────

  invoices: [
    // Current month
    { id: "inv1",  lease_id: "l1", tenant_id: "t1", tenant_name: "Amahle Dlamini",    status: "paid",    amount_cents: 950000,  due_date: daysAgo(10),  paid_date: daysAgo(8)  },
    { id: "inv2",  lease_id: "l2", tenant_id: "t2", tenant_name: "Marco van der Berg", status: "paid",    amount_cents: 950000,  due_date: daysAgo(10),  paid_date: daysAgo(9)  },
    { id: "inv3",  lease_id: "l3", tenant_id: "t3", tenant_name: "Priya Naidoo",       status: "paid",    amount_cents: 1250000, due_date: daysAgo(10),  paid_date: daysAgo(7)  },
    { id: "inv4",  lease_id: "l4", tenant_id: "t4", tenant_name: "James Fortuin",      status: "paid",    amount_cents: 780000,  due_date: daysAgo(10),  paid_date: daysAgo(10) },
    { id: "inv5",  lease_id: "l5", tenant_id: "t5", tenant_name: "Leilah Hendricks",   status: "paid",    amount_cents: 880000,  due_date: daysAgo(10),  paid_date: daysAgo(8)  },
    { id: "inv6",  lease_id: "l6", tenant_id: "t6", tenant_name: "Sipho Motaung",      status: "overdue", amount_cents: 880000,  due_date: daysAgo(23),  paid_date: null        },
    { id: "inv7",  lease_id: "l7", tenant_id: "t7", tenant_name: "Caitlin Rousseau",   status: "paid",    amount_cents: 1150000, due_date: daysAgo(10),  paid_date: daysAgo(9)  },
    { id: "inv8",  lease_id: "l8", tenant_id: "t8", tenant_name: "Thabo Mahlangu",     status: "paid",    amount_cents: 1250000, due_date: daysAgo(10),  paid_date: daysAgo(6)  },
    // Previous month
    { id: "inv9",  lease_id: "l1", tenant_id: "t1", tenant_name: "Amahle Dlamini",    status: "paid",    amount_cents: 950000,  due_date: daysAgo(40),  paid_date: daysAgo(39) },
    { id: "inv10", lease_id: "l2", tenant_id: "t2", tenant_name: "Marco van der Berg", status: "paid",    amount_cents: 950000,  due_date: daysAgo(40),  paid_date: daysAgo(38) },
    { id: "inv11", lease_id: "l3", tenant_id: "t3", tenant_name: "Priya Naidoo",       status: "paid",    amount_cents: 1250000, due_date: daysAgo(40),  paid_date: daysAgo(37) },
    { id: "inv12", lease_id: "l5", tenant_id: "t5", tenant_name: "Leilah Hendricks",   status: "paid",    amount_cents: 880000,  due_date: daysAgo(40),  paid_date: daysAgo(39) },
    { id: "inv13", lease_id: "l6", tenant_id: "t6", tenant_name: "Sipho Motaung",      status: "paid",    amount_cents: 880000,  due_date: daysAgo(40),  paid_date: daysAgo(36) },
    { id: "inv14", lease_id: "l7", tenant_id: "t7", tenant_name: "Caitlin Rousseau",   status: "paid",    amount_cents: 1150000, due_date: daysAgo(40),  paid_date: daysAgo(40) },
    { id: "inv15", lease_id: "l8", tenant_id: "t8", tenant_name: "Thabo Mahlangu",     status: "paid",    amount_cents: 1250000, due_date: daysAgo(40),  paid_date: daysAgo(38) },
    // 2 months ago
    { id: "inv16", lease_id: "l1", tenant_id: "t1", tenant_name: "Amahle Dlamini",    status: "paid",    amount_cents: 950000,  due_date: daysAgo(70),  paid_date: daysAgo(69) },
    { id: "inv17", lease_id: "l3", tenant_id: "t3", tenant_name: "Priya Naidoo",       status: "paid",    amount_cents: 1250000, due_date: daysAgo(70),  paid_date: daysAgo(68) },
    { id: "inv18", lease_id: "l7", tenant_id: "t7", tenant_name: "Caitlin Rousseau",   status: "paid",    amount_cents: 1150000, due_date: daysAgo(70),  paid_date: daysAgo(67) },
    { id: "inv19", lease_id: "l8", tenant_id: "t8", tenant_name: "Thabo Mahlangu",     status: "paid",    amount_cents: 1250000, due_date: daysAgo(70),  paid_date: daysAgo(65) },
  ],

  // ── Payments ─────────────────────────────────────────────────────────────────

  payments: [
    { id: "p1",  invoice_id: "inv1",  tenant_name: "Amahle Dlamini",    amount_cents: 950000,  method: "DebiCheck", date: daysAgo(8),  reference: "DLAMINI-KIRS-101" },
    { id: "p2",  invoice_id: "inv2",  tenant_name: "Marco van der Berg", amount_cents: 950000,  method: "EFT",       date: daysAgo(9),  reference: "VANDENBERG-KIRS-102" },
    { id: "p3",  invoice_id: "inv3",  tenant_name: "Priya Naidoo",       amount_cents: 1250000, method: "DebiCheck", date: daysAgo(7),  reference: "NAIDOO-KIRS-201" },
    { id: "p4",  invoice_id: "inv4",  tenant_name: "James Fortuin",      amount_cents: 780000,  method: "EFT",       date: daysAgo(10), reference: "FORTUIN-BUIT-1" },
    { id: "p5",  invoice_id: "inv5",  tenant_name: "Leilah Hendricks",   amount_cents: 880000,  method: "DebiCheck", date: daysAgo(8),  reference: "HENDRICKS-WELG-A1" },
    { id: "p6",  invoice_id: "inv7",  tenant_name: "Caitlin Rousseau",   amount_cents: 1150000, method: "DebiCheck", date: daysAgo(9),  reference: "ROUSSEAU-WELG-C1" },
    { id: "p7",  invoice_id: "inv8",  tenant_name: "Thabo Mahlangu",     amount_cents: 1250000, method: "DebiCheck", date: daysAgo(6),  reference: "MAHLANGU-KIRS-202" },
    { id: "p8",  invoice_id: "inv9",  tenant_name: "Amahle Dlamini",    amount_cents: 950000,  method: "DebiCheck", date: daysAgo(39), reference: "DLAMINI-KIRS-101" },
    { id: "p9",  invoice_id: "inv10", tenant_name: "Marco van der Berg", amount_cents: 950000,  method: "EFT",       date: daysAgo(38), reference: "VANDENBERG-KIRS-102" },
    { id: "p10", invoice_id: "inv11", tenant_name: "Priya Naidoo",       amount_cents: 1250000, method: "DebiCheck", date: daysAgo(37), reference: "NAIDOO-KIRS-201" },
    { id: "p11", invoice_id: "inv12", tenant_name: "Leilah Hendricks",   amount_cents: 880000,  method: "DebiCheck", date: daysAgo(39), reference: "HENDRICKS-WELG-A1" },
    { id: "p12", invoice_id: "inv13", tenant_name: "Sipho Motaung",      amount_cents: 880000,  method: "EFT",       date: daysAgo(36), reference: "MOTAUNG-WELG-A2" },
    { id: "p13", invoice_id: "inv14", tenant_name: "Caitlin Rousseau",   amount_cents: 1150000, method: "DebiCheck", date: daysAgo(40), reference: "ROUSSEAU-WELG-C1" },
    { id: "p14", invoice_id: "inv15", tenant_name: "Thabo Mahlangu",     amount_cents: 1250000, method: "DebiCheck", date: daysAgo(38), reference: "MAHLANGU-KIRS-202" },
  ],

  // ── Arrears cases ────────────────────────────────────────────────────────────

  arrears_cases: [
    {
      id: "arr1",
      lease_id: "l6", tenant_id: "t6", unit_id: "u7",
      tenant_name: "Sipho Motaung",
      property_name: "Welgemeend Estate",
      unit_number: "A2",
      total_arrears_cents: 880000,
      interest_accrued_cents: 4200,
      days_overdue: 23,
      months_in_arrears: 1,
      status: "open" as const,
      current_step: 1,
      last_action: daysAgo(5),
    },
    {
      id: "arr2",
      lease_id: "l4", tenant_id: "t4", unit_id: "u5",
      tenant_name: "James Fortuin",
      property_name: "12 Buitenkant",
      unit_number: "1",
      total_arrears_cents: 0,
      interest_accrued_cents: 0,
      days_overdue: 0,
      months_in_arrears: 0,
      status: "resolved" as const,
      current_step: 0,
      last_action: daysAgo(45),
    },
  ],

  // ── Deposits ─────────────────────────────────────────────────────────────────

  deposits: [
    { id: "dep1", tenant_id: "t1", tenant_name: "Amahle Dlamini",    unit: "Kirstenhof Court 101", amount_cents: 1900000, received: daysAgo(280), interest_cents: 28500, lease_end: daysFromNow(85),  status: "held"     as const },
    { id: "dep2", tenant_id: "t2", tenant_name: "Marco van der Berg", unit: "Kirstenhof Court 102", amount_cents: 1900000, received: daysAgo(120), interest_cents: 9500,  lease_end: daysFromNow(245), status: "held"     as const },
    { id: "dep3", tenant_id: "t3", tenant_name: "Priya Naidoo",       unit: "Kirstenhof Court 201", amount_cents: 2500000, received: daysAgo(200), interest_cents: 31250, lease_end: daysFromNow(165), status: "held"     as const },
    { id: "dep4", tenant_id: "t4", tenant_name: "James Fortuin",      unit: "12 Buitenkant 1",      amount_cents: 1560000, received: daysAgo(400), interest_cents: 39000, lease_end: daysFromNow(45),  status: "held"     as const },
    { id: "dep5", tenant_id: "t5", tenant_name: "Leilah Hendricks",   unit: "Welgemeend A1",        amount_cents: 1760000, received: daysAgo(60),  interest_cents: 5280,  lease_end: daysFromNow(305), status: "held"     as const },
    { id: "dep6", tenant_id: "t6", tenant_name: "Sipho Motaung",      unit: "Welgemeend A2",        amount_cents: 1760000, received: daysAgo(340), interest_cents: 37400, lease_end: daysFromNow(25),  status: "held"     as const },
    { id: "dep7", tenant_id: "t7", tenant_name: "Caitlin Rousseau",   unit: "Welgemeend C1",        amount_cents: 2300000, received: daysAgo(90),  interest_cents: 12650, lease_end: daysFromNow(275), status: "held"     as const },
    { id: "dep8", tenant_id: "t8", tenant_name: "Thabo Mahlangu",     unit: "Kirstenhof Court 202", amount_cents: 2500000, received: daysAgo(150), interest_cents: 18750, lease_end: daysFromNow(215), status: "held"     as const },
  ],

  // ── Trust transactions ───────────────────────────────────────────────────────

  trust_transactions: [
    { id: "tt1",  type: "rent_received",  description: "Rent — Amahle Dlamini (101)",       amount_cents:  950000, date: daysAgo(8),  lease_id: "l1", balance_cents: 8745000 },
    { id: "tt2",  type: "rent_received",  description: "Rent — Marco van der Berg (102)",    amount_cents:  950000, date: daysAgo(9),  lease_id: "l2", balance_cents: 7795000 },
    { id: "tt3",  type: "rent_received",  description: "Rent — Priya Naidoo (201)",          amount_cents: 1250000, date: daysAgo(7),  lease_id: "l3", balance_cents: 6845000 },
    { id: "tt4",  type: "rent_received",  description: "Rent — James Fortuin (1)",           amount_cents:  780000, date: daysAgo(10), lease_id: "l4", balance_cents: 5595000 },
    { id: "tt5",  type: "rent_received",  description: "Rent — Leilah Hendricks (A1)",       amount_cents:  880000, date: daysAgo(8),  lease_id: "l5", balance_cents: 4815000 },
    { id: "tt6",  type: "rent_received",  description: "Rent — Caitlin Rousseau (C1)",       amount_cents: 1150000, date: daysAgo(9),  lease_id: "l7", balance_cents: 3935000 },
    { id: "tt7",  type: "rent_received",  description: "Rent — Thabo Mahlangu (202)",        amount_cents: 1250000, date: daysAgo(6),  lease_id: "l8", balance_cents: 2785000 },
    { id: "tt8",  type: "expense_paid",   description: "Plumbing — Geyser repair (201)",     amount_cents: -185000, date: daysAgo(5),  lease_id: "l3", balance_cents: 2600000 },
    { id: "tt9",  type: "management_fee", description: "Management fee — April 2026",        amount_cents: -774000, date: daysAgo(4),  lease_id: null, balance_cents: 1826000 },
    { id: "tt10", type: "owner_payment",  description: "Owner payout — A. van Wyk",         amount_cents: -880000, date: daysAgo(3),  lease_id: null, balance_cents:  946000 },
    { id: "tt11", type: "owner_payment",  description: "Owner payout — S. Petersen",        amount_cents: -390000, date: daysAgo(3),  lease_id: null, balance_cents:  556000 },
    { id: "tt12", type: "rent_received",  description: "Rent — Amahle Dlamini (101)",       amount_cents:  950000, date: daysAgo(39), lease_id: "l1", balance_cents: 1506000 },
    { id: "tt13", type: "rent_received",  description: "Rent — Priya Naidoo (201)",          amount_cents: 1250000, date: daysAgo(37), lease_id: "l3", balance_cents:  556000 },
    { id: "tt14", type: "expense_paid",   description: "Electrical — Intercom repair (Buitenkant)", amount_cents: -95000, date: daysAgo(14), lease_id: "l4", balance_cents: -694000 },
    { id: "tt15", type: "deposit_received", description: "Deposit — Leilah Hendricks",      amount_cents: 1760000, date: daysAgo(60), lease_id: "l5", balance_cents: 1066000 },
  ],

  // ── Owner statements ─────────────────────────────────────────────────────────

  owner_statements: [
    { id: "os1", owner_id: "lo1", owner: "A. van Wyk",      property: "Kirstenhof Court",  period: "March 2026",    gross_cents: 4400000, expenses_cents: 185000, fee_cents: 352000, net_cents: 3863000, status: "sent"   as const, sent_date: daysAgo(12) },
    { id: "os2", owner_id: "lo2", owner: "S. Petersen",     property: "12 Buitenkant",     period: "March 2026",    gross_cents: 780000,  expenses_cents: 95000,  fee_cents: 62400,  net_cents: 622600,  status: "sent"   as const, sent_date: daysAgo(12) },
    { id: "os3", owner_id: "lo3", owner: "Welgemeend Trust",property: "Welgemeend Estate", period: "March 2026",    gross_cents: 3860000, expenses_cents: 220000, fee_cents: 308800, net_cents: 3331200, status: "draft"  as const, sent_date: null       },
    { id: "os4", owner_id: "lo1", owner: "A. van Wyk",      property: "Kirstenhof Court",  period: "February 2026", gross_cents: 4400000, expenses_cents: 95000,  fee_cents: 352000, net_cents: 3953000, status: "sent"   as const, sent_date: daysAgo(42) },
    { id: "os5", owner_id: "lo2", owner: "S. Petersen",     property: "12 Buitenkant",     period: "February 2026", gross_cents: 780000,  expenses_cents: 0,      fee_cents: 62400,  net_cents: 717600,  status: "sent"   as const, sent_date: daysAgo(42) },
    { id: "os6", owner_id: "lo3", owner: "Welgemeend Trust",property: "Welgemeend Estate", period: "February 2026", gross_cents: 3860000, expenses_cents: 0,      fee_cents: 308800, net_cents: 3551200, status: "sent"   as const, sent_date: daysAgo(42) },
  ],

  // ── Supplier invoices ────────────────────────────────────────────────────────

  supplier_invoices: [
    { id: "si1", supplier: "FixIt Plumbing",            description: "Geyser repair — Kirstenhof 201",       amount_cents: 185000, vat_cents: 0,     date: daysAgo(5),  status: "paid"    as const, maintenance_id: "m1" },
    { id: "si2", company: "Cape Electrical Solutions",  description: "Intercom repair — 12 Buitenkant",      amount_cents: 95000,  vat_cents: 0,     date: daysAgo(14), status: "paid"    as const, maintenance_id: "m4" },
    { id: "si3", supplier: "Green Gardens CT",          description: "Monthly garden service — Welgemeend",  amount_cents: 65000,  vat_cents: 0,     date: daysAgo(8),  status: "pending" as const, maintenance_id: null },
    { id: "si4", supplier: "CityPaint Renovations",     description: "Touch-up paint — Kirstenhof lobby",   amount_cents: 120000, vat_cents: 0,     date: daysAgo(20), status: "paid"    as const, maintenance_id: null },
    { id: "si5", supplier: "FixIt Plumbing",            description: "Tap washer replacement — 101",        amount_cents: 45000,  vat_cents: 0,     date: daysAgo(7),  status: "pending" as const, maintenance_id: "m2" },
  ],

  // ── Inspections ──────────────────────────────────────────────────────────────

  inspections: [
    { id: "ins1", unit_id: "u1",  unit_number: "101", property_name: "Kirstenhof Court",  lease_id: "l1", tenant_name: "Amahle Dlamini",   inspection_type: "move_in",  status: "complete",  scheduled_date: daysAgo(280), completed_date: daysAgo(280), overall_condition: "good",      notes: "Unit in excellent condition. Minor scuff on kitchen wall noted." },
    { id: "ins2", unit_id: "u4",  unit_number: "202", property_name: "Kirstenhof Court",  lease_id: "l8", tenant_name: "Thabo Mahlangu",    inspection_type: "move_in",  status: "complete",  scheduled_date: daysAgo(150), completed_date: daysAgo(149), overall_condition: "good",      notes: "Clean and well maintained." },
    { id: "ins3", unit_id: "u7",  unit_number: "A2",  property_name: "Welgemeend Estate", lease_id: "l6", tenant_name: "Sipho Motaung",    inspection_type: "move_out", status: "scheduled", scheduled_date: daysFromNow(10), completed_date: null,         overall_condition: null,        notes: null },
    { id: "ins4", unit_id: "u1",  unit_number: "101", property_name: "Kirstenhof Court",  lease_id: "l1", tenant_name: "Amahle Dlamini",   inspection_type: "periodic", status: "scheduled", scheduled_date: daysFromNow(4),  completed_date: null,         overall_condition: null,        notes: null },
    { id: "ins5", unit_id: "u10", unit_number: "C1",  property_name: "Welgemeend Estate", lease_id: "l7", tenant_name: "Caitlin Rousseau", inspection_type: "periodic", status: "overdue",   scheduled_date: daysAgo(5),   completed_date: null,         overall_condition: null,        notes: "Tenant requested reschedule." },
    { id: "ins6", unit_id: "u3",  unit_number: "201", property_name: "Kirstenhof Court",  lease_id: "l3", tenant_name: "Priya Naidoo",     inspection_type: "periodic", status: "complete",  scheduled_date: daysAgo(45),  completed_date: daysAgo(44), overall_condition: "excellent", notes: "No issues." },
  ],

  // ── Maintenance ──────────────────────────────────────────────────────────────

  maintenance: [
    { id: "m1", unit_id: "u3",  unit_number: "201", property_name: "Kirstenhof Court",  tenant_name: "Priya Naidoo",     title: "Geyser making noise",     description: "Hot water geyser vibrating loudly when heating.", category: "plumbing",   priority: "high",   status: "in_progress", reported_date: daysAgo(3),  contractor_id: "con1", sla_hours: 4,  resolved_date: null          },
    { id: "m2", unit_id: "u1",  unit_number: "101", property_name: "Kirstenhof Court",  tenant_name: "Amahle Dlamini",   title: "Kitchen tap dripping",    description: "Cold water tap dripping continuously.",           category: "plumbing",   priority: "medium", status: "open",        reported_date: daysAgo(7),  contractor_id: null,    sla_hours: 72, resolved_date: null          },
    { id: "m3", unit_id: "u10", unit_number: "C1",  property_name: "Welgemeend Estate", tenant_name: "Caitlin Rousseau", title: "Bedroom window won't close", description: "Second bedroom window frame is warped.",       category: "general",    priority: "medium", status: "open",        reported_date: daysAgo(2),  contractor_id: null,    sla_hours: 72, resolved_date: null          },
    { id: "m4", unit_id: "u5",  unit_number: "1",   property_name: "12 Buitenkant",     tenant_name: "James Fortuin",    title: "Intercom not working",    description: "Building intercom unit in flat unresponsive.",    category: "electrical", priority: "low",    status: "resolved",    reported_date: daysAgo(14), contractor_id: "con2",  sla_hours: 72, resolved_date: daysAgo(10)   },
    { id: "m5", unit_id: "u6",  unit_number: "A1",  property_name: "Welgemeend Estate", tenant_name: "Leilah Hendricks", title: "Burst pipe in bathroom",  description: "Pipe under basin burst overnight.",               category: "plumbing",   priority: "high",   status: "complete",    reported_date: daysAgo(20), contractor_id: "con1",  sla_hours: 4,  resolved_date: daysAgo(20)   },
  ],

  // ── Financial summary ────────────────────────────────────────────────────────

  financials: {
    trust_balance_cents: 8745000,
    total_deposits_held_cents: 17180000,
    monthly_rental_income_cents: 7740000,
    management_fee_cents: 774000,
    outstanding_cents: 880000,
    unmatched_payments_cents: 0,
    arrears_cents: 880000,
  },

  // ── Reports ──────────────────────────────────────────────────────────────────

  reports: {
    available: 25,
    categories: ["Financial", "Tenant", "Property", "Compliance", "Operations", "Agency"],
    sample_pdf_url: "/demo/sample-report.html",
  },

  // ── Compliance ───────────────────────────────────────────────────────────────

  compliance: {
    cpa_notices_due: 2,
    inspections_upcoming: 3,
    inspections_overdue: 1,
    leases_expiring_30d: 2,
    leases_expiring_60d: 3,
  },
}

export type DemoData = typeof DEMO_DATA
