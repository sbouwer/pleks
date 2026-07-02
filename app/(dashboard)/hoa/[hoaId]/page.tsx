/**
 * app/(dashboard)/hoa/[hoaId]/page.tsx — HOA / body corporate detail: stats, tabs for owners, levies, AGM, financials, settings.
 *
 * Route:  /hoa/[hoaId]
 * Auth:   Dashboard layout gateway; org must have firm tier
 * Data:   hoa_entities, hoa_unit_owners, levy_invoices, reserve_fund_entries, agm_records, levy_schedules —
 *         all org-scoped via gatewaySSR orgId (hoaId is caller-supplied, so the anchor fetch filters org_id)
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineLink } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"
import { LevyScheduleManager } from "@/components/hoa/LevyScheduleManager"
import { AGMManager } from "@/components/hoa/AGMManager"
import { ReserveFundManager } from "@/components/hoa/ReserveFundManager"
import { BackLink } from "@/components/ui/BackLink"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function HOADetailPage({
  params,
}: {
  params: Promise<{ hoaId: string }>
}) {
  const { hoaId } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: hoa, error: hoaError } = await db
    .from("hoa_entities")
    .select("*, properties(name, address_line1, city)")
    .eq("id", hoaId)
    .eq("org_id", orgId)
    .single()
    logQueryError("HOADetailPage hoa_entities", hoaError)

  if (!hoa) redirect("/hoa")

  const prop = hoa.properties as unknown as { name: string; address_line1: string; city: string } | null

  // Stats
  const [ownersRes, invoicesRes, reserveRes, agmRes] = await Promise.all([
    db.from("hoa_unit_owners").select("id", { count: "exact", head: true }).eq("hoa_id", hoaId).eq("org_id", orgId).eq("is_active", true),
    db.from("levy_invoices").select("status, total_cents, balance_cents").eq("hoa_id", hoaId).eq("org_id", orgId),
    db.from("reserve_fund_entries").select("direction, amount_cents").eq("hoa_id", hoaId).eq("org_id", orgId),
    db.from("agm_records").select("id, meeting_date, status").eq("hoa_id", hoaId).eq("org_id", orgId).order("meeting_date", { ascending: false }).limit(3),
  ])

  const ownerCount = ownersRes.count ?? 0
  const allInvoices = invoicesRes.data ?? []
  const paidInvoices = allInvoices.filter((i) => i.status === "paid")
  const collectionRate = allInvoices.length > 0 ? Math.round((paidInvoices.length / allInvoices.length) * 100) : 0
  const totalArrears = allInvoices.filter((i) => i.status === "overdue" || i.status === "open").reduce((s, i) => s + (i.balance_cents ?? 0), 0)

  const reserveBalance = (reserveRes.data ?? []).reduce((s, e) => {
    return e.direction === "credit" ? s + e.amount_cents : s - e.amount_cents
  }, 0)

  const entityLabels: Record<string, string> = {
    body_corporate: "Body Corporate",
    hoa: "HOA",
    share_block: "Share Block",
    poa: "POA",
  }

  return (
    <div className="space-y-6">
      <BackLink href="/hoa" label="HOA / Body Corporate" />
      <div>
        <h1 className="font-heading text-2xl">{hoa.name}</h1>
        <p className="text-sm text-muted-foreground">
          {prop?.name ?? prop?.address_line1}, {prop?.city} — {entityLabels[hoa.entity_type] ?? hoa.entity_type}
        </p>
        {hoa.csos_registration_number && (
          <p className="text-xs text-muted-foreground mt-1">CSOS: {hoa.csos_registration_number}</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Owners</p>
            <p className="font-heading text-lg">{ownerCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Collection</p>
            <p className="font-heading text-lg">{collectionRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Arrears</p>
            <p className="font-heading text-lg text-red-600">{formatZAR(totalArrears)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Reserve Fund</p>
            <p className="font-heading text-lg text-emerald-600">{formatZAR(reserveBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">CSOS Due</p>
            <p className="font-heading text-lg">
              {hoa.csos_annual_return_due ? formatDateShort(new Date(hoa.csos_annual_return_due)) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <div className="border-b border-border mb-6">
          <TabsList variant="line" className="w-fit h-auto gap-0 rounded-none p-0">
            <TabsTrigger value="overview" className="px-4 py-2 rounded-none">Overview</TabsTrigger>
            <TabsTrigger value="owners" className="px-4 py-2 rounded-none">Owners</TabsTrigger>
            <TabsTrigger value="levies" className="px-4 py-2 rounded-none">Levies</TabsTrigger>
            <TabsTrigger value="agm" className="px-4 py-2 rounded-none">AGM</TabsTrigger>
            <TabsTrigger value="financials" className="px-4 py-2 rounded-none">Financials</TabsTrigger>
            <TabsTrigger value="settings" className="px-4 py-2 rounded-none">Settings</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <InlineLink href={`/hoa/${hoaId}/levies`} withArrow={false} className="block">
                  Manage levy schedules
                </InlineLink>
                <InlineLink href={`/hoa/${hoaId}/agm`} withArrow={false} className="block">
                  Schedule AGM
                </InlineLink>
                <InlineLink href={`/hoa/${hoaId}/owners`} withArrow={false} className="block">
                  View owners
                </InlineLink>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Upcoming</CardTitle></CardHeader>
              <CardContent>
                {(agmRes.data ?? []).length > 0 ? (
                  <div className="space-y-2">
                    {(agmRes.data ?? []).map((agm) => (
                      <div key={agm.id} className="flex items-center justify-between text-sm">
                        <span>{formatDateShort(new Date(agm.meeting_date))}</span>
                        <Badge variant="secondary">{agm.status.replace(/_/g, " ")}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming meetings scheduled.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <HOAOwnersTab hoaId={hoaId} />
        </TabsContent>

        <TabsContent value="levies" className="mt-4">
          <HOALeviesTab hoaId={hoaId} />
        </TabsContent>

        <TabsContent value="agm" className="mt-4">
          <HOAAGMTab hoaId={hoaId} />
        </TabsContent>

        <TabsContent value="financials" className="mt-4">
          <HOAFinancialsTab hoaId={hoaId} reserveBalance={reserveBalance} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <HOASettingsTab hoa={hoa} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Tab components below — kept in same file for simplicity

async function HOAOwnersTab({ hoaId }: { hoaId: string }) {
  const gw = await gatewaySSR()
  if (!gw) return null
  const { db, orgId } = gw
  const { data: owners, error: ownersError } = await db
    .from("hoa_unit_owners")
    .select("*, units(unit_number)")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("owner_name")
    logQueryError("HOAOwnersTab hoa_unit_owners", ownersError)

  // Get latest levy status per owner
  const ownerIds = (owners ?? []).map((o) => o.id)
  const { data: latestInvoices } = ownerIds.length > 0
    ? await db
        .from("levy_invoices")
        .select("owner_id, status, balance_cents")
        .in("owner_id", ownerIds)
        .eq("org_id", orgId)
        .order("period_month", { ascending: false })
    : { data: [] }

  const latestByOwner = new Map<string, { status: string; balance: number }>()
  for (const inv of latestInvoices ?? []) {
    if (!latestByOwner.has(inv.owner_id)) {
      latestByOwner.set(inv.owner_id, { status: inv.status, balance: inv.balance_cents ?? 0 })
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">Unit Owners ({owners?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2 pr-2">Unit</th>
              <th className="text-left py-2 pr-2">Owner</th>
              <th className="text-left py-2 pr-2">Type</th>
              <th className="text-right py-2 px-2">PQ</th>
              <th className="text-left py-2 px-2">Levy Status</th>
              <th className="text-right py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(owners ?? []).map((o) => {
              const unit = o.units as unknown as { unit_number: string } | null
              const latest = latestByOwner.get(o.id)
              const statusColors: Record<string, string> = {
                paid: "text-emerald-600", open: "text-amber-600", overdue: "text-red-600", partial: "text-amber-600",
              }
              return (
                <tr key={o.id} className="border-b border-border/50">
                  <td className="py-2 pr-2">{unit?.unit_number ?? "—"}</td>
                  <td className="py-2 pr-2">
                    {o.owner_name}
                    {o.is_trustee && <Badge variant="secondary" className="ml-2 text-[10px]">Trustee</Badge>}
                  </td>
                  <td className="py-2 pr-2 capitalize text-xs">{o.owner_type}</td>
                  <td className="text-right py-2 px-2 text-xs">{o.participation_quota ? `${(o.participation_quota * 100).toFixed(2)}%` : "—"}</td>
                  <td className={`py-2 px-2 text-xs capitalize ${statusColors[latest?.status ?? ""] ?? ""}`}>
                    {latest?.status ?? "—"}
                  </td>
                  <td className="text-right py-2">{latest?.balance ? formatZAR(latest.balance) : "R 0"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

async function HOALeviesTab({ hoaId }: { hoaId: string }) {
  const gw = await gatewaySSR()
  if (!gw) return null
  const { db, orgId } = gw

  const [schedulesRes, ownersRes] = await Promise.all([
    db
      .from("levy_schedules")
      .select("id, description, schedule_type, calculation_method, total_budget_cents, effective_from, effective_to, is_active, include_vacant_units")
      .eq("hoa_id", hoaId)
      .eq("org_id", orgId)
      .order("effective_from", { ascending: false }),
    db
      .from("hoa_unit_owners")
      .select("unit_id, units(unit_number)")
      .eq("hoa_id", hoaId)
      .eq("org_id", orgId)
      .eq("is_active", true),
  ])

  // Build unit_id → unit_number map for the client component
  const unitOwnerMap: Record<string, string> = {}
  for (const o of ownersRes.data ?? []) {
    const unit = o.units as unknown as { unit_number: string } | null
    if (unit?.unit_number) unitOwnerMap[o.unit_id] = unit.unit_number
  }

  return (
    <LevyScheduleManager
      hoaId={hoaId}
      initialSchedules={schedulesRes.data ?? []}
      unitOwnerMap={unitOwnerMap}
    />
  )
}

async function HOAAGMTab({ hoaId }: { hoaId: string }) {
  const gw = await gatewaySSR()
  if (!gw) return null
  const { db, orgId } = gw
  const { data: records, error: recordsError } = await db
    .from("agm_records")
    .select("*, agm_resolutions(*)")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .order("meeting_date", { ascending: false })
    logQueryError("HOAAGMTab agm_records", recordsError)

  return <AGMManager hoaId={hoaId} initialRecords={records ?? []} />
}

async function HOAFinancialsTab({ hoaId, reserveBalance }: Readonly<{ hoaId: string; reserveBalance: number }>) {
  const gw = await gatewaySSR()
  if (!gw) return null
  const { db, orgId } = gw
  const { data: entries, error: entriesError } = await db
    .from("reserve_fund_entries")
    .select("*")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    logQueryError("HOAFinancialsTab reserve_fund_entries", entriesError)

  return (
    <ReserveFundManager
      hoaId={hoaId}
      initialEntries={entries ?? []}
      initialBalance={reserveBalance}
    />
  )
}

function HOASettingsTab({ hoa }: { hoa: Record<string, unknown> }) {
  const entityLabels: Record<string, string> = {
    body_corporate: "Body Corporate",
    hoa: "HOA",
    share_block: "Share Block",
    poa: "POA",
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Entity Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-semibold">{hoa.name as string}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Type</p>
              <p className="font-semibold">{entityLabels[(hoa.entity_type as string)] ?? hoa.entity_type}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Registration</p>
              <p className="font-semibold">{(hoa.registration_number as string) ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CSOS Number</p>
              <p className="font-semibold">{(hoa.csos_registration_number as string) ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Financial Year End</p>
              <p className="font-semibold">Month {hoa.financial_year_end_month as number ?? 2}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CSOS Annual Return Due</p>
              <p className="font-semibold">
                {hoa.csos_annual_return_due ? formatDateShort(new Date(hoa.csos_annual_return_due as string)) : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">CSOS Compliance</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Annual CSOS levy: 0.44% of total annual budget. All sectional title
            schemes and HOAs must register with the Community Schemes Ombud Service.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
