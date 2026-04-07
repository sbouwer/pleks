import { createServiceClient } from "@/lib/supabase/server"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
import { parseClauseBody, buildSelfLookup } from "./parseClauseBody"
import { renderClauseBodyToDocx } from "./renderClauseDocx"
import { getOrgDisplayName, getOrgLegalName } from "@/lib/org/displayName"

// ─── Types ───────────────────────────────────────────────────

export interface LeaseVariables {
  lessor_name: string
  lessor_reg_number: string
  lessor_address: string
  lessor_email: string
  lessor_contact: string
  agent_name: string
  agent_company: string
  lessee_name: string
  lessee_id_reg: string
  lessee_address: string
  lessee_email: string
  lessee_contact: string
  lessee2_name: string
  lessee2_id: string
  property_address: string
  unit_number: string
  building_name: string
  erf_description: string
  commencement_date: string
  end_date: string
  lease_period_months: string
  lease_period_words: string
  is_fixed_term: string
  notice_period_days: string
  renewal_period: string
  monthly_rent_formatted: string
  deposit_formatted: string
  escalation_percent: string
  annual_escalation_formatted: string
  payment_due_day: string
  rate_per_sqm: string
  unit_size_sqm: string
  lease_type_description: string
  arrears_interest_margin: string
  arrears_interest_margin_words: string
  deposit_interest_rate: string
  lessor_bank_name: string
  lessor_account_holder: string
  lessor_account_number: string
  lessor_branch_code: string
  lessor_bank_details: string
  signature_date: string
  date_formatted: string
  vat_rate: string
}

export interface ResolvedClause {
  number: number
  title: string
  body: string
  clauseKey: string
}

// ─── Main generation function ────────────────────────────────

export async function generateLeaseDocument(
  leaseId: string,
  orgId: string,
  previewOnly = false
): Promise<{ storagePath: string; clauseSnapshot: Record<string, number> }> {
  const supabase = await createServiceClient()

  // Load lease + related data
  const { data: lease } = await supabase
    .from("leases")
    .select(`
      *,
      units(*, properties(*)),
      tenant_view(*)
    `)
    .eq("id", leaseId)
    .single()

  if (!lease) throw new Error(`Lease ${leaseId} not found`)

  // Load org
  const { data: org } = await supabase
    .from("organisations")
    .select("*")
    .eq("id", orgId)
    .single()

  // Load clause library + co-tenants in parallel
  const leaseType = lease.lease_type ?? "residential"
  const [libraryRes, coTenantsRes, leaseSelectionsRes, orgCustomRes, orgDefaultsRes] = await Promise.all([
    supabase.from("lease_clause_library").select("*").in("lease_type", [leaseType, "both"]).order("sort_order"),
    supabase.from("lease_co_tenants").select("tenant_id", { count: "exact", head: true }).eq("lease_id", leaseId),
    supabase.from("lease_clause_selections").select("clause_key, enabled, custom_body").eq("lease_id", leaseId),
    supabase.from("lease_clause_selections").select("clause_key, enabled, custom_body").eq("org_id", orgId).is("lease_id", null),
    supabase.from("org_lease_clause_defaults").select("clause_key, enabled").eq("org_id", orgId),
  ])

  const library = libraryRes.data
  const hasCoTenants = (coTenantsRes.count ?? 0) > 0

  // Evaluate a clause's condition field — returns true if the clause passes its condition
  function conditionMet(condition: string | null): boolean {
    if (!condition) return true
    if (condition === "co_tenants_present") return hasCoTenants
    return true // unknown conditions default to included
  }

  const leaseSelMap = new Map(leaseSelectionsRes.data?.map((s) => [s.clause_key, s]) ?? [])
  const orgCustomMap = new Map(orgCustomRes.data?.map((s) => [s.clause_key, s]) ?? [])
  const orgDefaultMap = new Map(orgDefaultsRes.data?.map((d) => [d.clause_key, d.enabled]) ?? [])

  // Determine which clauses are enabled (condition check first, then 3-level priority)
  const enabledClauses = (library ?? []).filter((clause) => {
    // Condition gates inclusion entirely — if not met, clause is always excluded
    if (!conditionMet(clause.condition as string | null)) return false
    if (clause.is_required) return true
    // 1. Per-lease selection
    const leaseSel = leaseSelMap.get(clause.clause_key)
    if (leaseSel !== undefined) return leaseSel.enabled
    // 2. Org-level custom
    const orgCust = orgCustomMap.get(clause.clause_key)
    if (orgCust !== undefined) return orgCust.enabled
    // 3. Org toggle defaults
    const orgDef = orgDefaultMap.get(clause.clause_key)
    if (orgDef !== undefined) return orgDef
    // 4. Library default
    return clause.is_enabled_by_default
  })

  // Assign sequential numbers (1-based)
  const clauseSnapshot: Record<string, number> = {}
  enabledClauses.forEach((clause, i) => {
    clauseSnapshot[clause.clause_key] = i + 1
  })

  // Build lease variables
  const bankDetails = await getLessorBankDetails(orgId)
  const tenant = lease.tenant_view as Record<string, string> | null
  const unit = lease.units as Record<string, unknown> | null
  const property = (unit?.properties ?? null) as Record<string, string> | null

  const orgFields = {
    name: org?.name ?? "",
    type: (org?.type as string) ?? "agency",
    user_type: org?.user_type as string | null | undefined,
    trading_as: org?.trading_as as string | null | undefined,
    title: org?.title as string | null | undefined,
    first_name: org?.first_name as string | null | undefined,
    last_name: org?.last_name as string | null | undefined,
    initials: org?.initials as string | null | undefined,
  }

  const variables: LeaseVariables = {
    lessor_name: getOrgLegalName(orgFields),
    lessor_reg_number: org?.reg_number ?? "",
    lessor_address: org?.address ?? "",
    lessor_email: org?.email ?? "",
    lessor_contact: org?.phone ?? "",
    agent_name: getOrgDisplayName(orgFields),
    agent_company: org?.name ?? "",
    lessee_name: tenant?.full_name ?? `${tenant?.first_name ?? ""} ${tenant?.last_name ?? ""}`.trim(),
    lessee_id_reg: tenant?.id_number ?? "",
    lessee_address: tenant?.address ?? "",
    lessee_email: tenant?.email ?? "",
    lessee_contact: tenant?.phone ?? "",
    lessee2_name: "",
    lessee2_id: "",
    property_address: property?.address ?? property?.address_line1 ?? "",
    unit_number: (unit?.unit_number as string) ?? "",
    building_name: property?.name ?? "",
    erf_description: property?.address ?? "",
    commencement_date: formatDateLong(lease.start_date),
    end_date: lease.end_date ? formatDateLong(lease.end_date) : "",
    lease_period_months: String(lease.lease_period_months ?? 12),
    lease_period_words: numberToWords(lease.lease_period_months ?? 12),
    is_fixed_term: lease.is_fixed_term ? "yes" : "no",
    notice_period_days: String(lease.notice_period_days ?? 20),
    renewal_period: "2 months",
    monthly_rent_formatted: formatZARDocument(lease.rent_amount_cents ?? 0),
    deposit_formatted: formatZARDocument(lease.deposit_amount_cents ?? 0),
    escalation_percent: String(lease.escalation_percent ?? 10),
    annual_escalation_formatted: `${lease.escalation_percent ?? 10}% per annum`,
    payment_due_day: ordinal(lease.payment_due_day ?? 1),
    rate_per_sqm: "",
    unit_size_sqm: String((unit?.size_sqm as string) ?? ""),
    lease_type_description: leaseType,
    arrears_interest_margin: String(lease.arrears_interest_margin_percent ?? 2),
    arrears_interest_margin_words: numberToWords(lease.arrears_interest_margin_percent ?? 2),
    deposit_interest_rate: String(lease.deposit_interest_rate_percent ?? 5),
    lessor_bank_name: bankDetails.bankName,
    lessor_account_holder: bankDetails.accountHolder,
    lessor_account_number: bankDetails.accountNumber,
    lessor_branch_code: bankDetails.branchCode,
    lessor_bank_details: bankDetails.fullDetails,
    signature_date: formatDateLong(new Date().toISOString()),
    date_formatted: formatDateLong(new Date().toISOString()),
    vat_rate: "15",
  }

  // Resolve all tokens in each clause body (3-level priority for custom_body)
  const resolvedClauses: ResolvedClause[] = enabledClauses.map((clause) => {
    const leaseSel = leaseSelMap.get(clause.clause_key)
    const orgCust = orgCustomMap.get(clause.clause_key)
    let body: string = leaseSel?.custom_body ?? orgCust?.custom_body ?? clause.body_template

    // Resolve {{ref:key}} — external clause references
    body = body.replaceAll(/\{\{ref:([a-z_]+)\}\}/g, (_, key: string) => {
      const num = clauseSnapshot[key]
      return num ? `clause ${num}.0` : "[not included in this agreement]"
    })

    // NOTE: {{self:N}} is NOT resolved here — it needs the parsed sub-clause
    // numbers which are only available after parseClauseBody() runs in buildDocx.

    // Resolve {{var:field}} — lease variable values
    body = body.replaceAll(/\{\{var:([a-z_]+)\}\}/g, (_, field: string) => {
      const val = (variables as unknown as Record<string, string>)[field]
      return val ?? `[${field}]`
    })

    const selfNum = clauseSnapshot[clause.clause_key]
    return {
      number: selfNum,
      title: clause.title,
      body,
      clauseKey: clause.clause_key,
    }
  })

  // Generate DOCX via the docx library
  const docxBuffer = await buildDocx(leaseType, variables, resolvedClauses, lease.special_terms)

  const fileName = previewOnly ? "lease_preview.docx" : "lease_draft.docx"
  const storagePath = `orgs/${orgId}/leases/${leaseId}/${fileName}`

  await supabase.storage
    .from("documents")
    .upload(storagePath, docxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    })

  if (!previewOnly) {
    await supabase
      .from("leases")
      .update({
        clause_snapshot: clauseSnapshot,
        generated_doc_path: storagePath,
        template_type: leaseType === "commercial" ? "pleks_commercial" : "pleks_residential",
      })
      .eq("id", leaseId)

    await supabase.from("audit_log").insert({
      org_id: orgId,
      table_name: "leases",
      record_id: leaseId,
      action: "UPDATE",
      new_values: {
        action: "lease_document_generated",
        clauses_included: enabledClauses.length,
        clause_snapshot: clauseSnapshot,
      },
    })
  }

  return { storagePath, clauseSnapshot }
}

// ─── DOCX builder ────────────────────────────────────────────

export async function buildDocx(
  leaseType: string,
  variables: LeaseVariables,
  clauses: ResolvedClause[],
  specialTerms: unknown,
  watermark = false
): Promise<Buffer> {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, HeadingLevel, PageBreak, BorderStyle, WidthType,
    Header, Footer, PageNumber,
  } = await import("docx")

  const borderNone = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
  }

  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 1 },
    bottom: { style: BorderStyle.SINGLE, size: 1 },
    left: { style: BorderStyle.SINGLE, size: 1 },
    right: { style: BorderStyle.SINGLE, size: 1 },
  }

  function labelCell(text: string) {
    return new TableCell({
      width: { size: 3000, type: WidthType.DXA },
      borders: thinBorder,
      children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: "Calibri" })] })],
    })
  }

  function valueCell(text: string, width = 6000) {
    return new TableCell({
      width: { size: width, type: WidthType.DXA },
      borders: thinBorder,
      children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "Calibri" })] })],
    })
  }

  function detailRow(label: string, value: string) {
    return new TableRow({ children: [labelCell(label), valueCell(value)] })
  }

  // ─── Title page ──────────────────────────────────────────

  // Use explicit type for mixed content arrays
  type DocChild = InstanceType<typeof Paragraph> | InstanceType<typeof Table>

  // ─── Cover page ───────────────────────────────────────

  // Helper: two-cell label/value row for the cover party table
  function coverRow(label: string, value: string) {
    return new TableRow({ children: [
      new TableCell({ borders: borderNone, width: { size: 1800, type: WidthType.DXA }, children: [
        new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, font: "Calibri", color: "888888" })] }),
      ]}),
      new TableCell({ borders: borderNone, width: { size: 5200, type: WidthType.DXA }, children: [
        new Paragraph({ children: [new TextRun({ text: value, size: 18, font: "Calibri" })] }),
      ]}),
    ]})
  }

  // Managing agent row: only show when agent differs from lessor (i.e. an agency manages on behalf)
  const showAgent = variables.agent_name && variables.agent_name !== variables.lessor_name

  // Lessee rows: primary lessee plus optional second lessee
  const lesseeValue = variables.lessee2_name
    ? `${variables.lessee_name}\n${variables.lessee2_name}`
    : variables.lessee_name

  const coverPartyRows = [
    coverRow("LESSOR",   variables.lessor_name),
    coverRow("",         variables.lessor_address),
    ...(showAgent ? [
      coverRow("AGENT",  variables.agent_name),
      coverRow("",       [variables.lessor_contact, variables.lessor_email].filter(Boolean).join("  ·  ")),
    ] : []),
    coverRow("LESSEE",   lesseeValue),
    coverRow("",         variables.lessee_address),
    coverRow("",         [variables.lessee_contact, variables.lessee_email].filter(Boolean).join("  ·  ")),
  ]

  const titleChildren: DocChild[] = [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "LEASE AGREEMENT", bold: true, size: 28, font: "Calibri" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 500 },
      children: [new TextRun({
        text: `${leaseType.charAt(0).toUpperCase() + leaseType.slice(1)} lease`,
        size: 22, font: "Calibri", italics: true, color: "999999",
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "─────────────────────────────────────", size: 20, font: "Calibri", color: "CCCCCC" })],
    }),
    new Paragraph({ spacing: { after: 40 }, children: [] }),

    // Party details table
    new Table({
      width: { size: 7000, type: WidthType.DXA },
      borders: borderNone,
      rows: coverPartyRows,
    }),

    new Paragraph({ spacing: { after: 40 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "─────────────────────────────────────", size: 20, font: "Calibri", color: "CCCCCC" })],
    }),

    // Property + lease terms summary
    new Table({
      width: { size: 7000, type: WidthType.DXA },
      borders: borderNone,
      rows: [
        coverRow("PROPERTY", [variables.property_address, variables.unit_number ? `Unit ${variables.unit_number}` : ""].filter(Boolean).join(", ")),
        coverRow("PERIOD",   `${variables.commencement_date} – ${variables.end_date || "Month to month"}`),
        coverRow("RENTAL",   `${variables.monthly_rent_formatted} per month`),
        coverRow("DEPOSIT",  variables.deposit_formatted),
      ],
    }),

    new Paragraph({ spacing: { after: 40 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
      children: [new TextRun({ text: "─────────────────────────────────────", size: 20, font: "Calibri", color: "CCCCCC" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Prepared by ${variables.agent_name}`, size: 16, font: "Calibri", italics: true, color: "999999" })],
    }),
  ]

  // ─── Clause pages ────────────────────────────────────────

  const clauseChildren: DocChild[] = [
    new Paragraph({ children: [new PageBreak()] }),
  ]

  for (const clause of clauses) {
    // Clause heading
    clauseChildren.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 300, after: 160 },
      indent: { left: 0, hanging: 0 },
      children: [new TextRun({
        text: `${clause.number}. ${clause.title.toUpperCase()}`,
        bold: true, size: 24, font: "Calibri",
      })],
    }))

    // Parse clause body into structured nodes with hierarchical numbers
    const bodyNodes = parseClauseBody(clause.body, clause.number)
    const selfLookup = buildSelfLookup(bodyNodes)

    // Resolve {{self:N}} using actual assigned sub-clause numbers
    for (const node of bodyNodes) {
      node.text = node.text.replaceAll(/\{\{self:(\w+)\}\}/g, (_, n: string) => {
        const resolved = selfLookup[n]
        return resolved ? `clause ${resolved}` : `clause ${clause.number}.${n}`
      })
    }

    const bodyParagraphs = renderClauseBodyToDocx(bodyNodes, { Paragraph, TextRun, AlignmentType }) as DocChild[]
    clauseChildren.push(...bodyParagraphs)
  }

  // ─── Annexure A — Lease details ──────────────────────────

  const annexureA: DocChild[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: "ANNEXURE A: LEASE DETAILS", bold: true, size: 28, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "CONTRACTING PARTIES", bold: true, size: 22, font: "Calibri" })],
    }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        detailRow("LESSOR", variables.lessor_name),
        detailRow("AGENT", variables.agent_name),
        detailRow("ID / REG NO", variables.lessor_reg_number),
        detailRow("ADDRESS", variables.lessor_address),
        detailRow("CONTACT", variables.lessor_contact),
        detailRow("EMAIL", variables.lessor_email),
      ],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        detailRow("LESSEE 1", variables.lessee_name),
        detailRow("LESSEE 2", variables.lessee2_name || "N/A"),
        detailRow("ID / REG NO", variables.lessee_id_reg),
        detailRow("ADDRESS", variables.lessee_address),
        detailRow("CONTACT", variables.lessee_contact),
        detailRow("EMAIL", variables.lessee_email),
      ],
    }),
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    new Paragraph({
      children: [new TextRun({ text: "SIGNED AT _____________________ ON THIS _____ DAY OF _____________________ 20_____", size: 20, font: "Calibri" })],
    }),
    new Paragraph({ spacing: { after: 200 }, children: [] }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      borders: borderNone,
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSOR / AGENT", size: 18, font: "Calibri", italics: true })] }),
            ]}),
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSEE", size: 18, font: "Calibri", italics: true })] }),
            ]}),
          ],
        }),
      ],
    }),
  ]

  // ─── Annexure B — Rental calculation ─────────────────────

  const annexureB: DocChild[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: "ANNEXURE B: RENTAL CALCULATION", bold: true, size: 28, font: "Calibri" })],
    }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        detailRow("UNIT NUMBER / TYPE", variables.unit_number),
        detailRow("BUILDING NAME", variables.building_name),
        detailRow("LEASE PERIOD START", variables.commencement_date),
        detailRow("LEASE PERIOD END", variables.end_date || "Month to month"),
        detailRow("LEASE PERIOD", `${variables.lease_period_months} months`),
        detailRow("UNIT SIZE (SQM)", variables.unit_size_sqm || "N/A"),
        detailRow("ANNUAL ESCALATION", `${variables.escalation_percent}%`),
        detailRow("RENEWAL PERIOD", variables.renewal_period),
        detailRow("RATE / SQM", variables.rate_per_sqm || "N/A"),
        detailRow("1st RENTAL", variables.monthly_rent_formatted),
        detailRow("RENTAL", `${variables.monthly_rent_formatted} monthly`),
        detailRow("DEPOSIT", `${variables.deposit_formatted} once-off`),
        detailRow("VAT", `${variables.vat_rate}%`),
      ],
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: "PAYMENT DETAILS", bold: true, size: 22, font: "Calibri" })],
    }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        detailRow("ACCOUNT", variables.lessor_account_holder),
        detailRow("ACCOUNT NO", variables.lessor_account_number),
        detailRow("BANK", variables.lessor_bank_name),
        detailRow("BRANCH", variables.lessor_branch_code),
      ],
    }),
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      borders: borderNone,
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSOR / AGENT", size: 18, font: "Calibri", italics: true })] }),
            ]}),
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSEE", size: 18, font: "Calibri", italics: true })] }),
            ]}),
          ],
        }),
      ],
    }),
  ]

  // ─── Annexure C — Rules & Regulations ────────────────────

  const annexureC: DocChild[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: "ANNEXURE C: RULES & REGULATIONS", bold: true, size: 28, font: "Calibri" })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: "The Lessee agrees to abide by the following rules and regulations as set out by the Lessor. These rules may be amended from time to time with reasonable notice.", size: 22, font: "Calibri" })],
    }),
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      borders: borderNone,
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSOR / AGENT", size: 18, font: "Calibri", italics: true })] }),
            ]}),
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSEE", size: 18, font: "Calibri", italics: true })] }),
            ]}),
          ],
        }),
      ],
    }),
  ]

  // ─── Annexure D — Special agreements ─────────────────────

  const terms = Array.isArray(specialTerms)
    ? (specialTerms as { type: string; detail: string }[])
    : []

  const annexureD: DocChild[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: [new TextRun({ text: "ANNEXURE D: SPECIAL AGREEMENTS", bold: true, size: 28, font: "Calibri" })],
    }),
  ]

  if (terms.length === 0) {
    annexureD.push(new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "No special agreements apply.", size: 22, font: "Calibri", italics: true })],
    }))
  } else {
    for (const term of terms) {
      annexureD.push(new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `${term.type.replaceAll("_", " ").toUpperCase()}: `, bold: true, size: 22, font: "Calibri" }),
          new TextRun({ text: term.detail, size: 22, font: "Calibri" }),
        ],
      }))
    }
  }

  annexureD.push(
    new Paragraph({ spacing: { after: 400 }, children: [] }),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      borders: borderNone,
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSOR / AGENT", size: 18, font: "Calibri", italics: true })] }),
            ]}),
            new TableCell({ borders: borderNone, width: { size: 4500, type: WidthType.DXA }, children: [
              new Paragraph({ children: [new TextRun({ text: "____________________________", size: 20, font: "Calibri" })] }),
              new Paragraph({ children: [new TextRun({ text: "LESSEE", size: 18, font: "Calibri", italics: true })] }),
            ]}),
          ],
        }),
      ],
    })
  )

  // ─── Assemble document ───────────────────────────────────

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          size: { width: 11906, height: 16838 }, // A4
        },
      },
      headers: {
        default: new Header({
          children: [watermark
            ? new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "SAMPLE — NOT FOR SIGNING", color: "E0E0E0", size: 60, font: "Calibri", bold: true })],
              })
            : new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "CONFIDENTIAL — LEASE AGREEMENT", size: 16, font: "Calibri", italics: true, color: "999999" })],
              }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [watermark
            ? new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                  text: `Sample generated via Pleks on ${variables.date_formatted}. Not a valid lease agreement.`,
                  size: 16, font: "Calibri", italics: true, color: "999999",
                })],
              })
            : new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 16, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri" }),
                  new TextRun({ text: " of ", size: 16, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: "Calibri" }),
                ],
              }),
          ],
        }),
      },
      children: [
        ...titleChildren,
        ...clauseChildren,
        ...annexureA,
        ...annexureB,
        ...annexureC,
        ...annexureD,
      ],
    }],
    numbering: { config: [] },
    styles: {
      default: {
        document: {
          run: { size: 22, font: "Calibri" },
          paragraph: { spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED },
        },
      },
      paragraphStyles: [{
        id: "Normal",
        name: "Normal",
        run: { size: 22, font: "Calibri" },
        paragraph: { spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED },
      }],
    },
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}

// ─── Helpers ─────────────────────────────────────────────────

function formatZARDocument(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateLong(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function numberToWords(n: number): string {
  const words: Record<number, string> = {
    0: "zero", 1: "one", 2: "two", 3: "three", 4: "four",
    5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
    10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen",
    14: "fourteen", 15: "fifteen", 16: "sixteen", 17: "seventeen",
    18: "eighteen", 19: "nineteen", 20: "twenty",
    24: "twenty-four", 30: "thirty", 36: "thirty-six",
    48: "forty-eight", 60: "sixty",
  }
  return words[n] ?? String(n)
}
