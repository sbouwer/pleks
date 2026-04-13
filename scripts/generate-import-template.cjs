// Run: node scripts/generate-import-template.cjs
// Generates public/templates/pleks_import_template.xlsx with rich formatting.

const ExcelJS = require("exceljs")
const path = require("path")

const OUTPUT = path.join(__dirname, "../public/templates/pleks_import_template.xlsx")

// ── Column definitions ────────────────────────────────────────────────────

const COLUMNS = [
  // TENANT (1-26) ─────────────────────────────────────────────────────────
  { header: "tenant_role",               section: "tenant",  width: 14, note: "primary | co_tenant | previous",                         validation: { type: "list", formulae: ['"primary,co_tenant,previous"'] } },
  { header: "first_name",                section: "tenant",  width: 16 },
  { header: "last_name",                 section: "tenant",  width: 16 },
  { header: "company_name",              section: "tenant",  width: 22, note: "Juristic tenant — leave blank for individuals" },
  { header: "email",                     section: "tenant",  width: 26 },
  { header: "phone",                     section: "tenant",  width: 14 },
  { header: "work_phone",                section: "tenant",  width: 14 },
  { header: "id_number",                 section: "tenant",  width: 18 },
  { header: "id_type",                   section: "tenant",  width: 14, note: "sa_id | passport | asylum_permit",                        validation: { type: "list", formulae: ['"sa_id,passport,asylum_permit"'] } },
  { header: "date_of_birth",             section: "tenant",  width: 14, note: "YYYY-MM-DD or DD/MM/YYYY" },
  { header: "nationality",               section: "tenant",  width: 16 },
  { header: "registration_number",       section: "tenant",  width: 20, note: "CIPC / company reg number" },
  { header: "vat_number",                section: "tenant",  width: 14 },
  { header: "marital_status",            section: "tenant",  width: 14, note: "Stored as note" },
  { header: "visa_expiry_date",          section: "tenant",  width: 16, note: "YYYY-MM-DD — stored as note" },
  { header: "work_permit_number",        section: "tenant",  width: 18, note: "Stored as note" },
  { header: "employer_name",             section: "tenant",  width: 20 },
  { header: "employment_type",           section: "tenant",  width: 16, note: "permanent | contract | self_employed | student | unemployed | retired | other", validation: { type: "list", formulae: ['"permanent,contract,self_employed,student,unemployed,retired,other"'] } },
  { header: "occupation",                section: "tenant",  width: 16 },
  { header: "preferred_contact",         section: "tenant",  width: 16, note: "whatsapp | sms | email | call",                           validation: { type: "list", formulae: ['"whatsapp,sms,email,call"'] } },
  { header: "next_of_kin_name",          section: "tenant",  width: 20 },
  { header: "next_of_kin_phone",         section: "tenant",  width: 16 },
  { header: "next_of_kin_relationship",  section: "tenant",  width: 20 },
  { header: "emergency_contact_name",    section: "tenant",  width: 22, note: "Leave blank if same as next of kin" },
  { header: "emergency_contact_phone",   section: "tenant",  width: 22 },
  { header: "vehicle_registration",      section: "tenant",  width: 18, note: "Stored as note" },

  // PROPERTY / UNIT (27-46) ───────────────────────────────────────────────
  { header: "property_name",             section: "unit",    width: 22 },
  { header: "unit_number",               section: "unit",    width: 12 },
  { header: "address_line1",             section: "unit",    width: 28 },
  { header: "suburb",                    section: "unit",    width: 16 },
  { header: "city",                      section: "unit",    width: 16 },
  { header: "province",                  section: "unit",    width: 16, note: "Western Cape | Gauteng | KwaZulu-Natal | etc.", validation: { type: "list", formulae: ['"Western Cape,Eastern Cape,Northern Cape,North West,Free State,KwaZulu-Natal,Gauteng,Limpopo,Mpumalanga"'] } },
  { header: "postal_code",               section: "unit",    width: 12 },
  { header: "property_type",             section: "unit",    width: 14, note: "residential | commercial | mixed",                         validation: { type: "list", formulae: ['"residential,commercial,mixed"'] } },
  { header: "erf_number",                section: "unit",    width: 14 },
  { header: "unit_type",                 section: "unit",    width: 14, note: "flat | house | room | office — stored as note" },
  { header: "floor_level",               section: "unit",    width: 12 },
  { header: "size_sqm",                  section: "unit",    width: 10 },
  { header: "bedrooms",                  section: "unit",    width: 10 },
  { header: "bathrooms",                 section: "unit",    width: 10 },
  { header: "parking_bays",              section: "unit",    width: 12 },
  { header: "furnished",                 section: "unit",    width: 10, note: "yes | no",                                               validation: { type: "list", formulae: ['"yes,no"'] } },
  { header: "pet_friendly",              section: "unit",    width: 12, note: "yes | no — stored as note",                              validation: { type: "list", formulae: ['"yes,no"'] } },
  { header: "water_meter_number",        section: "unit",    width: 18, note: "Stored as note" },
  { header: "electricity_meter_number",  section: "unit",    width: 22, note: "Stored as note" },
  { header: "municipal_account_number",  section: "unit",    width: 22, note: "Stored as note" },

  // LEASE (47-60) ─────────────────────────────────────────────────────────
  { header: "lease_type",                section: "lease",   width: 14, note: "residential | commercial",                               validation: { type: "list", formulae: ['"residential,commercial"'] } },
  { header: "is_fixed_term",             section: "lease",   width: 13, note: "yes | no",                                               validation: { type: "list", formulae: ['"yes,no"'] } },
  { header: "lease_start",               section: "lease",   width: 13, note: "DD/MM/YYYY or YYYY-MM-DD" },
  { header: "lease_end",                 section: "lease",   width: 13, note: "Leave blank for month-to-month" },
  { header: "monthly_rent",              section: "lease",   width: 13, note: "e.g. R 7200.00" },
  { header: "deposit",                   section: "lease",   width: 13 },
  { header: "escalation_percent",        section: "lease",   width: 16, note: "e.g. 10 (for 10%)" },
  { header: "escalation_type",           section: "lease",   width: 16, note: "fixed | cpi | prime_plus",                               validation: { type: "list", formulae: ['"fixed,cpi,prime_plus"'] } },
  { header: "escalation_review_date",    section: "lease",   width: 20, note: "DD/MM/YYYY" },
  { header: "payment_method",            section: "lease",   width: 16, note: "debicheck | eft | cash",                                 validation: { type: "list", formulae: ['"debicheck,eft,cash"'] } },
  { header: "payment_due_day",           section: "lease",   width: 15, note: "1-28 (day of month)" },
  { header: "notice_period_days",        section: "lease",   width: 18, note: "e.g. 20 (CPA default)" },
  { header: "cpa_applies",              section: "lease",   width: 12, note: "yes | no",                                               validation: { type: "list", formulae: ['"yes,no"'] } },
  { header: "special_conditions",        section: "lease",   width: 28 },

  // OWNER (61-67) ─────────────────────────────────────────────────────────
  { header: "owner_name",                section: "owner",   width: 20 },
  { header: "owner_email",               section: "owner",   width: 26 },
  { header: "owner_phone",               section: "owner",   width: 14 },
  { header: "owner_bank_name",           section: "owner",   width: 16 },
  { header: "owner_bank_account",        section: "owner",   width: 18 },
  { header: "owner_bank_branch",         section: "owner",   width: 16 },
  { header: "owner_bank_type",           section: "owner",   width: 14, note: "cheque | savings | transmission",                        validation: { type: "list", formulae: ['"cheque,savings,transmission"'] } },

  // BANK & NOTES (68-71) ──────────────────────────────────────────────────
  { header: "tenant_bank_name",          section: "bank",    width: 16 },
  { header: "tenant_bank_account",       section: "bank",    width: 20, note: "Encrypted — DebiCheck use only" },
  { header: "tenant_bank_branch",        section: "bank",    width: 18 },
  { header: "agent_notes",               section: "notes",   width: 28 },
]

const SECTION_META = {
  tenant: { label: "TENANT",            fill: "DBEAFE", font: "1E40AF" }, // blue
  unit:   { label: "PROPERTY / UNIT",   fill: "DCFCE7", font: "166534" }, // green
  lease:  { label: "LEASE",             fill: "FEF3C7", font: "92400E" }, // amber
  owner:  { label: "OWNER",             fill: "F3E8FF", font: "6B21A8" }, // purple
  bank:   { label: "BANK",              fill: "ECFDF5", font: "065F46" }, // teal
  notes:  { label: "NOTES",             fill: "FEF9C3", font: "713F12" }, // yellow
}

const SAMPLE_ROWS = [
  [
    "primary","John","Smith","","john.smith@gmail.com","0821234567","","8501015009087","sa_id","1985-01-01",
    "South African","","","Married","","","Absa Bank","permanent","Accountant","whatsapp",
    "Mary Smith","0821234568","Spouse","","","",
    "Sunrise Estate","Flat 2A","3 Sunflower Street","Bellville","Cape Town","Western Cape","7530",
    "residential","","flat","2","65","2","1","1","yes","no","W001","","",
    "residential","yes","01/03/2024","28/02/2026","R 7200.00","R 14400.00","10","fixed","","debicheck","1","20","yes","No pets.",
    "Jane Owner","jane@owner.co.za","0219991234","FNB","62012345678","250655","cheque",
    "Standard Bank","123456789","051001","Prefers WhatsApp.",
  ],
  [
    "co_tenant","Mary","Smith","","mary.smith@gmail.com","0831234567","","8808080045081","sa_id","",
    "","","","","","","Woolworths SA","permanent","","",
    "","","","","","",
    "Sunrise Estate","Flat 2A","","","","","",
    "","","","","","","","","","","","","",
    "","","","","","","","","","","","","",
    "","","","","","","",
    "","","","",
  ],
  [
    "previous","Thandi","Nkosi","","thandi.nkosi@gmail.com","0611112222","","8912124567890","sa_id","",
    "South African","","","","","","","unemployed","","",
    "","","","","","",
    "Oak Manor","Unit 7","","","","","",
    "","","","","","","","","","","","","",
    "","01/01/2021","31/12/2022","R 4800.00","R 9600.00","","","","","","","",
    "Prior tenant - deposit returned 2023-01-14.",
    "","","","","","","",
    "","","","",
  ],
]

// ── Build workbook ────────────────────────────────────────────────────────

async function main() {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Pleks"
  wb.lastModifiedBy = "Pleks Import Template Generator"
  wb.created = new Date()

  // ── Sheet 1: Template ──────────────────────────────────────────────────
  const ws = wb.addWorksheet("Template", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 2 }],
  })

  // Row 1: section banners (merged)
  const sectionBannerRow = ws.addRow([])
  let prevSection = null
  let sectionStart = 1
  const sectionRanges = []
  for (let i = 0; i < COLUMNS.length; i++) {
    const col = COLUMNS[i]
    const next = COLUMNS[i + 1]
    if (col.section !== prevSection) {
      if (prevSection !== null) {
        sectionRanges.push({ section: prevSection, start: sectionStart, end: i })
      }
      prevSection = col.section
      sectionStart = i + 1
    }
    if (!next) {
      sectionRanges.push({ section: col.section, start: sectionStart, end: i + 1 })
    }
  }

  for (const range of sectionRanges) {
    const meta = SECTION_META[range.section]
    const cell = sectionBannerRow.getCell(range.start)
    cell.value = meta.label
    cell.font = { bold: true, size: 10, color: { argb: "FF" + meta.font } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + meta.fill } }
    cell.alignment = { horizontal: "center", vertical: "middle" }
    if (range.end > range.start) {
      ws.mergeCells(1, range.start, 1, range.end)
    }
  }
  sectionBannerRow.height = 20

  // Row 2: column headers
  const headerRow = ws.addRow(COLUMNS.map((c) => c.header))
  headerRow.height = 22
  headerRow.eachCell((cell, colNumber) => {
    const col = COLUMNS[colNumber - 1]
    if (!col) return
    const meta = SECTION_META[col.section]
    cell.font = { bold: true, size: 9, color: { argb: "FF" + meta.font } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + meta.fill } }
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: false }
    cell.border = {
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    }
  })

  // Set column widths
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width
  })

  // Sample data rows (rows 3-5)
  for (const sample of SAMPLE_ROWS) {
    const dataRow = ws.addRow(sample)
    dataRow.height = 18
    dataRow.eachCell((cell) => {
      cell.font = { size: 9 }
    })
  }

  // Add 15 empty rows for agent data entry
  for (let i = 0; i < 15; i++) {
    const emptyRow = ws.addRow(new Array(COLUMNS.length).fill(""))
    emptyRow.height = 18
  }

  // Data validation (rows 3-200)
  for (let colIdx = 0; colIdx < COLUMNS.length; colIdx++) {
    const col = COLUMNS[colIdx]
    if (!col.validation) continue
    const colLetter = ws.getColumn(colIdx + 1).letter
    ws.dataValidations.add(`${colLetter}3:${colLetter}200`, {
      ...col.validation,
      showErrorMessage: false,
      showDropDown: false,
    })
  }

  // Note annotations on header row (row 2) using cell notes
  COLUMNS.forEach((col, i) => {
    if (!col.note) return
    const cell = headerRow.getCell(i + 1)
    cell.note = col.note
  })

  // ── Sheet 2: Instructions ──────────────────────────────────────────────
  const wsInst = wb.addWorksheet("Instructions")
  wsInst.getColumn(1).width = 30
  wsInst.getColumn(2).width = 60

  const instRows = [
    ["PLEKS IMPORT TEMPLATE", ""],
    [""],
    ["HOW TO USE", ""],
    ["1.", "Fill in the Template sheet. Delete the 3 sample rows first."],
    ["2.", "Each row = one tenant. Co-tenants repeat property_name + unit_number with tenant_role = co_tenant."],
    ["3.", "Most columns are optional. The only required fields are: first_name (or company_name), email, property_name, unit_number, lease_start, monthly_rent."],
    ["4.", "Save as CSV or keep as XLSX — both formats are supported."],
    ["5.", "Upload in Settings → Import."],
    [""],
    ["TENANT_ROLE", "primary | co_tenant | previous"],
    ["ID_TYPE", "sa_id | passport | asylum_permit"],
    ["EMPLOYMENT_TYPE", "permanent | contract | self_employed | student | unemployed | retired | other"],
    ["PREFERRED_CONTACT", "whatsapp | sms | email | call"],
    [""],
    ["LEASE_TYPE", "residential | commercial"],
    ["IS_FIXED_TERM / CPA_APPLIES", "yes | no"],
    ["ESCALATION_TYPE", "fixed | cpi | prime_plus"],
    ["PAYMENT_METHOD", "debicheck | eft | cash"],
    ["PAYMENT_DUE_DAY", "1-28 (day of month rent is due)"],
    ["NOTICE_PERIOD_DAYS", "20 (CPA default for residential)"],
    [""],
    ["PROPERTY_TYPE", "residential | commercial | mixed"],
    ["PROVINCE", "Western Cape | Eastern Cape | Northern Cape | North West | Free State | KwaZulu-Natal | Gauteng | Limpopo | Mpumalanga"],
    ["FURNISHED / PET_FRIENDLY", "yes | no"],
    [""],
    ["OWNER_BANK_TYPE", "cheque | savings | transmission"],
    [""],
    ["DATE FORMAT", "DD/MM/YYYY or YYYY-MM-DD — both work"],
    ["CURRENCY FORMAT", "R 7200.00  or  7200  or  720000 (cents) — all formats handled"],
    [""],
    ["NOTES-ONLY FIELDS", "These are stored as tenant/unit notes, not in dedicated fields:"],
    ["", "marital_status, visa_expiry_date, work_permit_number, vehicle_registration"],
    ["", "unit_type, pet_friendly, water_meter_number, electricity_meter_number, municipal_account_number"],
  ]

  for (const row of instRows) {
    const r = wsInst.addRow(row)
    if (row[0] && row[1] === "" && row[0] !== "1." && row[0] !== "2." && row[0] !== "3." && row[0] !== "4." && row[0] !== "5.") {
      r.getCell(1).font = { bold: true, size: 10 }
    }
  }

  await wb.xlsx.writeFile(OUTPUT)
  console.log("Generated:", OUTPUT)
}

main().catch(console.error)
