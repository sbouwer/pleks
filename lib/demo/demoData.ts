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

  properties: [
    {
      id: "demo-prop-1",
      name: "Kirstenhof Court",
      address_line1: "14 Kirstenhof Avenue",
      suburb: "Kirstenhof",
      city: "Cape Town",
      province: "Western Cape",
      units_count: 4,
      property_type: "residential",
    },
    {
      id: "demo-prop-2",
      name: "12 Buitenkant",
      address_line1: "12 Buitenkant Street",
      suburb: "Gardens",
      city: "Cape Town",
      province: "Western Cape",
      units_count: 1,
      property_type: "residential",
    },
    {
      id: "demo-prop-3",
      name: "Welgemeend Estate",
      address_line1: "8 Welgemeend Street",
      suburb: "Gardens",
      city: "Cape Town",
      province: "Western Cape",
      units_count: 6,
      property_type: "mixed_use",
    },
  ],

  units: [
    { id: "u1", property_id: "demo-prop-1", unit_number: "101", bedrooms: 2, monthly_rental_cents: 950000, status: "occupied" },
    { id: "u2", property_id: "demo-prop-1", unit_number: "102", bedrooms: 2, monthly_rental_cents: 950000, status: "occupied" },
    { id: "u3", property_id: "demo-prop-1", unit_number: "201", bedrooms: 3, monthly_rental_cents: 1250000, status: "occupied" },
    { id: "u4", property_id: "demo-prop-1", unit_number: "202", bedrooms: 3, monthly_rental_cents: 1250000, status: "occupied" },
    { id: "u5", property_id: "demo-prop-2", unit_number: "1", bedrooms: 1, monthly_rental_cents: 780000, status: "occupied" },
    { id: "u6", property_id: "demo-prop-3", unit_number: "A1", bedrooms: 2, monthly_rental_cents: 880000, status: "occupied" },
    { id: "u7", property_id: "demo-prop-3", unit_number: "A2", bedrooms: 2, monthly_rental_cents: 880000, status: "occupied" },
    { id: "u8", property_id: "demo-prop-3", unit_number: "B1", bedrooms: 1, monthly_rental_cents: 650000, status: "vacant" },
    { id: "u9", property_id: "demo-prop-3", unit_number: "B2", bedrooms: 1, monthly_rental_cents: 650000, status: "occupied" },
    { id: "u10", property_id: "demo-prop-3", unit_number: "C1", bedrooms: 3, monthly_rental_cents: 1150000, status: "occupied" },
    { id: "u11", property_id: "demo-prop-3", unit_number: "C2", bedrooms: 3, monthly_rental_cents: 1150000, status: "vacant" },
  ],

  tenants: [
    { id: "t1", full_name: "Amahle Dlamini", email: "amahle@demo.co.za", phone: "082 111 2233", unit_id: "u1" },
    { id: "t2", full_name: "Marco van der Berg", email: "marco@demo.co.za", phone: "083 222 3344", unit_id: "u2" },
    { id: "t3", full_name: "Priya Naidoo", email: "priya@demo.co.za", phone: "084 333 4455", unit_id: "u3" },
    { id: "t4", full_name: "James Fortuin", email: "james@demo.co.za", phone: "071 444 5566", unit_id: "u5" },
    { id: "t5", full_name: "Leilah Hendricks", email: "leilah@demo.co.za", phone: "072 555 6677", unit_id: "u6" },
    { id: "t6", full_name: "Sipho Motaung", email: "sipho@demo.co.za", phone: "073 666 7788", unit_id: "u7" },
    { id: "t7", full_name: "Caitlin Rousseau", email: "caitlin@demo.co.za", phone: "074 777 8899", unit_id: "u10" },
    { id: "t8", full_name: "Thabo Mahlangu", email: "thabo@demo.co.za", phone: "076 888 9900", unit_id: "u4" },
  ],

  leases: [
    { id: "l1", unit_id: "u1", tenant_id: "t1", property_id: "demo-prop-1", status: "active", lease_type: "residential", rent_amount_cents: 950000, deposit_amount_cents: 1900000, start_date: daysAgo(280), end_date: daysFromNow(85), escalation_percent: 8, payment_due_day: 1 },
    { id: "l2", unit_id: "u2", tenant_id: "t2", property_id: "demo-prop-1", status: "active", lease_type: "residential", rent_amount_cents: 950000, deposit_amount_cents: 1900000, start_date: daysAgo(120), end_date: daysFromNow(245), escalation_percent: 8, payment_due_day: 1 },
    { id: "l3", unit_id: "u3", tenant_id: "t3", property_id: "demo-prop-1", status: "active", lease_type: "residential", rent_amount_cents: 1250000, deposit_amount_cents: 2500000, start_date: daysAgo(200), end_date: daysFromNow(165), escalation_percent: 10, payment_due_day: 1 },
    { id: "l4", unit_id: "u5", tenant_id: "t4", property_id: "demo-prop-2", status: "active", lease_type: "residential", rent_amount_cents: 780000, deposit_amount_cents: 1560000, start_date: daysAgo(400), end_date: daysFromNow(45), escalation_percent: 8, payment_due_day: 1 },
    { id: "l5", unit_id: "u6", tenant_id: "t5", property_id: "demo-prop-3", status: "active", lease_type: "residential", rent_amount_cents: 880000, deposit_amount_cents: 1760000, start_date: daysAgo(60), end_date: daysFromNow(305), escalation_percent: 8, payment_due_day: 1 },
    { id: "l6", unit_id: "u7", tenant_id: "t6", property_id: "demo-prop-3", status: "active", lease_type: "residential", rent_amount_cents: 880000, deposit_amount_cents: 1760000, start_date: daysAgo(340), end_date: daysFromNow(25), escalation_percent: 8, payment_due_day: 1 },
    { id: "l7", unit_id: "u10", tenant_id: "t7", property_id: "demo-prop-3", status: "active", lease_type: "residential", rent_amount_cents: 1150000, deposit_amount_cents: 2300000, start_date: daysAgo(90), end_date: daysFromNow(275), escalation_percent: 10, payment_due_day: 1 },
    { id: "l8", unit_id: "u4", tenant_id: "t8", property_id: "demo-prop-1", status: "active", lease_type: "residential", rent_amount_cents: 1250000, deposit_amount_cents: 2500000, start_date: daysAgo(150), end_date: daysFromNow(215), escalation_percent: 8, payment_due_day: 1 },
  ],

  invoices: [
    { id: "inv1", lease_id: "l1", tenant_id: "t1", tenant_name: "Amahle Dlamini", status: "paid", amount_cents: 950000, due_date: daysAgo(10), paid_date: daysAgo(8) },
    { id: "inv2", lease_id: "l2", tenant_id: "t2", tenant_name: "Marco van der Berg", status: "paid", amount_cents: 950000, due_date: daysAgo(10), paid_date: daysAgo(9) },
    { id: "inv3", lease_id: "l6", tenant_id: "t6", tenant_name: "Sipho Motaung", status: "overdue", amount_cents: 880000, due_date: daysAgo(23), paid_date: null },
    { id: "inv4", lease_id: "l5", tenant_id: "t5", tenant_name: "Leilah Hendricks", status: "open", amount_cents: 880000, due_date: daysFromNow(0), paid_date: null },
  ],

  arrears_cases: [
    {
      id: "arr1", lease_id: "l6", tenant_id: "t6", unit_id: "u7",
      tenant_name: "Sipho Motaung", property_name: "Welgemeend Estate", unit_number: "A2",
      total_arrears_cents: 880000,
      interest_accrued_cents: 4200,
      days_overdue: 23,
      months_in_arrears: 1,
      status: "open",
      current_step: 1,
    },
  ],

  inspections: [
    { id: "ins1", unit_id: "u1", unit_number: "101", property_name: "Kirstenhof Court", lease_id: "l1", tenant_name: "Amahle Dlamini", inspection_type: "incoming", status: "complete", scheduled_date: daysAgo(280), completed_date: daysAgo(280), overall_condition: "good", notes: "Unit in excellent condition. Minor scuff on kitchen wall noted." },
    { id: "ins2", unit_id: "u4", unit_number: "202", property_name: "Kirstenhof Court", lease_id: "l8", tenant_name: "Thabo Mahlangu", inspection_type: "incoming", status: "complete", scheduled_date: daysAgo(150), completed_date: daysAgo(149), overall_condition: "good", notes: "Clean and well maintained." },
    { id: "ins3", unit_id: "u7", unit_number: "A2", property_name: "Welgemeend Estate", lease_id: "l6", tenant_name: "Sipho Motaung", inspection_type: "outgoing", status: "scheduled", scheduled_date: daysFromNow(10), completed_date: null, overall_condition: null, notes: null },
  ],

  maintenance: [
    { id: "m1", unit_id: "u3", unit_number: "201", property_name: "Kirstenhof Court", tenant_name: "Priya Naidoo", title: "Geyser making noise", description: "Hot water geyser vibrating loudly when heating.", category: "plumbing", priority: "high", status: "in_progress", reported_date: daysAgo(3) },
    { id: "m2", unit_id: "u1", unit_number: "101", property_name: "Kirstenhof Court", tenant_name: "Amahle Dlamini", title: "Kitchen tap dripping", description: "Cold water tap dripping continuously.", category: "plumbing", priority: "medium", status: "open", reported_date: daysAgo(7) },
    { id: "m3", unit_id: "u10", unit_number: "C1", property_name: "Welgemeend Estate", tenant_name: "Caitlin Rousseau", title: "Bedroom window won't close", description: "Second bedroom window frame is warped — won't seal.", category: "general", priority: "medium", status: "open", reported_date: daysAgo(2) },
    { id: "m4", unit_id: "u5", unit_number: "1", property_name: "12 Buitenkant", tenant_name: "James Fortuin", title: "Intercom not working", description: "Building intercom unit in flat unresponsive.", category: "electrical", priority: "low", status: "resolved", reported_date: daysAgo(14) },
  ],

  financials: {
    trust_balance_cents: 8745000,
    total_deposits_held_cents: 17180000,
    monthly_rental_income_cents: 7740000,
    management_fee_cents: 774000,
    outstanding_cents: 880000,
  },
}

export type DemoData = typeof DEMO_DATA
