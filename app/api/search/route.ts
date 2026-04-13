import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

type SearchResult = {
  type: string
  id: string
  label: string
  subtitle: string
  href: string
}

function buildPropertyResults(data: { id: string; name: string; address_line1: string | null; suburb: string | null; city: string | null }[]): SearchResult[] {
  return data.map((p) => ({
    type: "property",
    id: p.id,
    label: p.name,
    subtitle: [p.address_line1, p.suburb, p.city].filter(Boolean).join(", "),
    href: "/properties/" + p.id,
  }))
}

function buildTenantResults(data: { id: string; first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string | null; email: string | null; phone: string | null }[]): SearchResult[] {
  return data.map((t) => {
    const label = t.entity_type === "company"
      ? (t.company_name ?? "")
      : [t.first_name, t.last_name].filter(Boolean).join(" ")
    return {
      type: "tenant",
      id: t.id,
      label,
      subtitle: t.email ?? t.phone ?? "",
      href: "/tenants/" + t.id,
    }
  })
}

function buildMaintenanceResults(data: { id: string; title: string; work_order_number: string | null; units: unknown }[]): SearchResult[] {
  return data.map((m) => {
    const unit = m.units as { unit_number: string; properties: { name: string } | null } | null
    const subtitle = unit
      ? unit.unit_number + " · " + (unit.properties?.name ?? "")
      : (m.work_order_number ?? "")
    return {
      type: "maintenance",
      id: m.id,
      label: m.title,
      subtitle,
      href: "/maintenance/" + m.id,
    }
  })
}

function buildInvoiceResults(data: { id: string; invoice_number: string; total_amount_cents: number; status: string }[]): SearchResult[] {
  return data.map((inv) => ({
    type: "invoice",
    id: inv.id,
    label: inv.invoice_number,
    subtitle: "R " + (inv.total_amount_cents / 100).toFixed(2) + " · " + inv.status,
    href: "/payments?invoice=" + inv.id,
  }))
}

export async function GET(req: Request) {
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })

  const supabase = await createServiceClient()

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()

  if (!membership) return NextResponse.json({ results: [] })
  const orgId = membership.org_id
  const term = "%" + q + "%"

  const [propertiesRes, tenantsRes, maintenanceRes, invoicesRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, address_line1, suburb, city")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .or(`name.ilike.${term},address_line1.ilike.${term},suburb.ilike.${term}`)
      .limit(5),

    supabase
      .from("tenant_view")
      .select("id, first_name, last_name, company_name, entity_type, email, phone")
      .eq("org_id", orgId)
      .or(`first_name.ilike.${term},last_name.ilike.${term},company_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .limit(5),

    supabase
      .from("maintenance_requests")
      .select("id, title, work_order_number, units(unit_number, properties(name))")
      .eq("org_id", orgId)
      .or(`title.ilike.${term},work_order_number.ilike.${term}`)
      .limit(5),

    supabase
      .from("rent_invoices")
      .select("id, invoice_number, total_amount_cents, status")
      .eq("org_id", orgId)
      .ilike("invoice_number", term)
      .limit(5),
  ])

  const results: SearchResult[] = [
    ...buildPropertyResults(propertiesRes.data ?? []),
    ...buildTenantResults(tenantsRes.data ?? []),
    ...buildMaintenanceResults(maintenanceRes.data ?? []),
    ...buildInvoiceResults(invoicesRes.data ?? []),
  ]

  return NextResponse.json({ results })
}
