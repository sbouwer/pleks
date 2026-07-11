/**
 * Generates a print-ready HTML string for the insurance broker brief.
 * Mirrors the spec format in ADDENDUM_60A §7.4.
 * Sent as an HTML attachment via Resend; broker can open + print to PDF.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { SA_TIMEZONE, fmtDateLongZA } from "@/lib/dates"
import { formatZAR } from "@/lib/constants"

interface BriefItem {
  sort_order: number
  label: string
  code: string
}

export interface BrokerBriefData {
  toName: string
  toCompany: string | null
  propertyName: string
  addressLabel: string
  tenantName: string | null
  leaseStart: string | null
  replacementValue: string | null
  bodyCorpName: string | null
  bodyCorpAgent: string | null
  insuranceProvider: string | null
  policyNumber: string | null
  policyType: string | null
  renewalDate: string | null
  excess: string | null
  agentName: string
  agentCompany: string
  agentPhone: string | null
  agentEmail: string | null
  items: BriefItem[]
  propertyShortId: string
  generatedDate: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRand(cents: number | null): string | null {
  return cents === null ? null : formatZAR(cents)   // ZAR SSOT (lib/constants) — item 7
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return fmtDateLongZA(iso)
}

function buildTenancyText(tenantName: string | null, leaseStart: string | null): string {
  if (!tenantName) return "Vacant"
  if (leaseStart) return `Currently let — ${tenantName}, lease commenced ${leaseStart}`
  return `Currently let — ${tenantName}`
}

function buildBcText(name: string | null, agent: string | null): string {
  if (!name) return ""
  if (agent) return `${name}<br/><span style="color:#6b7280">Managing agent: ${agent}</span>`
  return name
}

function optRow(label: string, value: string | null): string {
  if (!value) return ""
  return `<tr><td>${label}</td><td>${value}</td></tr>`
}

// ── Fetch helpers (extracted to keep fetchBrokerBriefData complexity low) ────

type Db = Awaited<ReturnType<typeof createServiceClient>>

interface TenantInfo { tenantName: string | null; leaseStart: string | null }

async function fetchTenant(db: Db, propertyId: string): Promise<TenantInfo> {
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("start_date, tenants(contacts(first_name, last_name, company_name, entity_type))")
    .eq("property_id", propertyId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("fetchTenant leases", leaseError)

  const tc = (lease as unknown as {
    tenants?: { contacts?: { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string } | null } | null
    start_date?: string | null
  } | null)?.tenants?.contacts

  const tenantName = tc?.entity_type === "company"
    ? (tc.company_name ?? null)
    : [tc?.first_name, tc?.last_name].filter(Boolean).join(" ") || null

  const leaseStart = formatDate((lease as { start_date?: string | null } | null)?.start_date ?? null)
  return { tenantName, leaseStart }
}

interface SchemeInfo { bodyCorpName: string | null; bodyCorpAgent: string | null }

async function fetchScheme(db: Db, schemeId: string | null): Promise<SchemeInfo> {
  if (!schemeId) return { bodyCorpName: null, bodyCorpAgent: null }
  const { data: scheme, error: schemeError } = await db
    .from("managing_schemes")
    .select("name, agent:contacts!managing_agent_contact_id(company_name, first_name, last_name)")
    .eq("id", schemeId)
    .single()
    logQueryError("fetchScheme managing_schemes", schemeError)
  const agent = scheme?.agent as unknown as { company_name: string | null; first_name: string | null; last_name: string | null } | null
  return {
    bodyCorpName:  (scheme?.name as string | null) ?? null,
    bodyCorpAgent: agent?.company_name?.trim() || [agent?.first_name, agent?.last_name].filter(Boolean).join(" ").trim() || null,
  }
}

interface AgentInfo { agentName: string; agentEmail: string | null }

async function fetchAgentInfo(
  db: Db,
  orgId: string,
  fallbackName: string,
  fallbackEmail: string | null,
): Promise<AgentInfo> {
  const { data: agentRow, error: agentRowError } = await db
    .from("user_orgs")
    .select("user_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle()
    logQueryError("fetchAgentInfo user_orgs", agentRowError)

  if (!agentRow?.user_id) return { agentName: fallbackName, agentEmail: fallbackEmail }

  const { data: authUser } = await db.auth.admin.getUserById(agentRow.user_id as string)
  const email = authUser?.user?.email ?? fallbackEmail
  const meta = authUser?.user?.user_metadata as { full_name?: string; name?: string } | undefined
  const name = meta?.full_name ?? meta?.name ?? fallbackName
  return { agentName: name, agentEmail: email }
}

// ── Main data fetch ───────────────────────────────────────────────────────────

export async function fetchBrokerBriefData(propertyId: string): Promise<BrokerBriefData | null> {
  const db = await createServiceClient()

  const { data: prop, error: propErr } = await db
    .from("properties")
    .select(`
      id, name, address_line1, suburb, city, org_id,
      insurance_provider, insurance_policy_number, insurance_policy_type,
      insurance_renewal_date, insurance_replacement_value_cents, insurance_excess_cents,
      managing_scheme_id,
      organisations!properties_org_id_fkey(name, email, phone)
    `)
    .eq("id", propertyId)
    .single()

  if (propErr || !prop) return null

  const org = prop.organisations as unknown as { name: string; email: string | null; phone: string | null } | null

  const { data: brokerRow, error: brokerRowError } = await db
    .from("property_brokers")
    .select("contacts(first_name, last_name, company_name, primary_email, primary_phone)")
    .eq("property_id", propertyId)
    .maybeSingle()
    logQueryError("fetchBrokerBriefData property_brokers", brokerRowError)

  const broker = brokerRow?.contacts as unknown as {
    first_name: string | null; last_name: string | null
    company_name: string | null; primary_email: string | null
  } | null

  if (!broker) return null

  const { data: checklistRows, error: checklistRowsError } = await db
    .from("property_insurance_checklists")
    .select("item_code, insurance_checklist_items(sort_order, label, is_auto_derived)")
    .eq("property_id", propertyId)
    .neq("state", "not_applicable")
    logQueryError("fetchBrokerBriefData property_insurance_checklists", checklistRowsError)

  const items: BriefItem[] = (checklistRows ?? [])
    .filter((r) => {
      const item = r.insurance_checklist_items as unknown as { is_auto_derived: boolean } | null
      return item && !item.is_auto_derived
    })
    .map((r) => {
      const item = r.insurance_checklist_items as unknown as { sort_order: number; label: string }
      return { sort_order: item.sort_order, label: item.label, code: r.item_code as string }
    })
    .sort((a, b) => a.sort_order - b.sort_order)

  const [{ tenantName, leaseStart }, { bodyCorpName, bodyCorpAgent }, { agentName, agentEmail }] =
    await Promise.all([
      fetchTenant(db, propertyId),
      fetchScheme(db, prop.managing_scheme_id as string | null),
      fetchAgentInfo(db, prop.org_id as string, org?.name ?? "Property Manager", org?.email ?? null),
    ])

  const brokerName = [broker.first_name, broker.last_name].filter(Boolean).join(" ") || "Broker"
  const address = [prop.address_line1, prop.suburb, prop.city].filter(Boolean).join(", ")

  return {
    toName:          brokerName,
    toCompany:       broker.company_name ?? null,
    propertyName:    prop.name as string,
    addressLabel:    address,
    tenantName,
    leaseStart,
    replacementValue: formatRand(prop.insurance_replacement_value_cents as number | null),
    bodyCorpName,
    bodyCorpAgent,
    insuranceProvider: prop.insurance_provider as string | null,
    policyNumber:    prop.insurance_policy_number as string | null,
    policyType:      prop.insurance_policy_type as string | null,
    renewalDate:     formatDate(prop.insurance_renewal_date as string | null),
    excess:          formatRand(prop.insurance_excess_cents as number | null),
    agentName,
    agentCompany:    org?.name ?? "",
    agentPhone:      org?.phone ?? null,
    agentEmail,
    items,
    propertyShortId: (prop.id as string).slice(0, 8).toUpperCase(),
    generatedDate:   formatDate(new Date().toISOString()) ?? new Date().toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }),
  }
}

// ── HTML renderer ─────────────────────────────────────────────────────────────

export function renderBrokerBriefHTML(d: BrokerBriefData): string {
  const itemRows = d.items.map((item, i) =>
    `<tr>
       <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top;color:#374151;">[ ]&nbsp;&nbsp;${i + 1}. ${item.label}</td>
       <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;vertical-align:top;color:#9ca3af;">_______________________________________________</td>
     </tr>`,
  ).join("\n")

  const tenancyText  = buildTenancyText(d.tenantName, d.leaseStart)
  const bcText       = buildBcText(d.bodyCorpName, d.bodyCorpAgent)
  const toLine       = d.toCompany ? `${d.toName} (${d.toCompany})` : d.toName
  const reLine       = d.addressLabel ? `${d.propertyName} · ${d.addressLabel}` : d.propertyName
  const agentPhone   = d.agentPhone ? `<br/>${d.agentPhone}` : ""
  const agentEmail   = d.agentEmail ? `<br/>${d.agentEmail}` : ""

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Insurance Coverage Verification Request — ${d.propertyName}</title>
<style>
  @page { size: A4; margin: 25mm 20mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1f2937; margin: 0; padding: 32px; }
  h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 2px solid #1f2937; padding-bottom: 8px; margin-bottom: 20px; }
  h2 { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 24px 0 12px; }
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.meta td { padding: 3px 0; vertical-align: top; font-size: 13px; }
  table.meta td:first-child { width: 160px; color: #6b7280; }
  table.items { width: 100%; border-collapse: collapse; border-top: 1px solid #e5e7eb; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<h1>Insurance Coverage Verification Request</h1>

<table class="meta">
  <tr><td>To:</td><td>${toLine}</td></tr>
  <tr><td>Re:</td><td>${reLine}</td></tr>
  <tr><td>From:</td><td>${d.agentName}, ${d.agentCompany}</td></tr>
  <tr><td>Date:</td><td>${d.generatedDate}</td></tr>
</table>

<p style="margin:16px 0;font-size:13px;color:#374151;">Dear ${d.toName},</p>
<p style="margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
  We are verifying that the policy on file for the above property is appropriate to its current use.
  Please review the items below and confirm each by reply.
</p>

<h2>Property Summary</h2>
<table class="meta">
  <tr><td>Tenant occupancy:</td><td>${tenancyText}</td></tr>
  ${optRow("Replacement value:", d.replacementValue ? `${d.replacementValue} (declared)` : null)}
  ${bcText ? `<tr><td>Body corporate:</td><td>${bcText}</td></tr>` : ""}
</table>

<h2>Policy on File</h2>
<table class="meta">
  ${optRow("Provider:", d.insuranceProvider)}
  ${optRow("Policy number:", d.policyNumber)}
  ${optRow("Policy type:", d.policyType)}
  ${optRow("Renewal date:", d.renewalDate)}
  ${optRow("Excess:", d.excess)}
</table>

<h2>Items to Confirm</h2>
<p style="margin:0 0 12px;font-size:12px;color:#6b7280;">
  Please confirm whether each item is included in the current policy by replying to this email.
</p>
<table class="items">
  ${itemRows}
</table>

<p style="margin:20px 0 0;font-size:13px;color:#374151;">
  Please attach a copy of the current policy schedule if convenient. Thank you for your assistance.
</p>

<p style="margin:20px 0 0;font-size:13px;color:#374151;line-height:1.8;">
  ${d.agentName}<br/>${d.agentCompany}${agentPhone}${agentEmail}
</p>

<div class="footer">
  Generated by Pleks · pleks.co.za · Reference: PROP-${d.propertyShortId} · ${d.generatedDate}
</div>
</body>
</html>`
}
