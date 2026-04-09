import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"

export default async function HOADetailPage({
  params,
}: {
  params: Promise<{ hoaId: string }>
}) {
  const { hoaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: hoa } = await supabase
    .from("hoa_entities")
    .select("*, properties(name, address_line1, city)")
    .eq("id", hoaId)
    .single()

  if (!hoa) redirect("/hoa")

  const prop = hoa.properties as unknown as { name: string; address_line1: string; city: string } | null

  // Stats
  const [ownersRes, invoicesRes, reserveRes, agmRes] = await Promise.all([
    supabase.from("hoa_unit_owners").select("id", { count: "exact", head: true }).eq("hoa_id", hoaId).eq("is_active", true),
    supabase.from("levy_invoices").select("status, total_cents, balance_cents").eq("hoa_id", hoaId),
    supabase.from("reserve_fund_entries").select("direction, amount_cents").eq("hoa_id", hoaId),
    supabase.from("agm_records").select("id, meeting_date, status").eq("hoa_id", hoaId).order("meeting_date", { ascending: false }).limit(3),
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
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="levies">Levies</TabsTrigger>
          <TabsTrigger value="agm">AGM</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" render={<Link href={`/hoa/${hoaId}/levies`} />}>
                  Manage levy schedules
                </Button>
                <Button variant="outline" className="w-full justify-start" render={<Link href={`/hoa/${hoaId}/agm`} />}>
                  Schedule AGM
                </Button>
                <Button variant="outline" className="w-full justify-start" render={<Link href={`/hoa/${hoaId}/owners`} />}>
                  View owners
                </Button>
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
          <HOAFinancialsTab reserveBalance={reserveBalance} />
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
  const supabase = await createClient()
  const { data: owners } = await supabase
    .from("hoa_unit_owners")
    .select("*, units(unit_number)")
    .eq("hoa_id", hoaId)
    .eq("is_active", true)
    .order("owner_name")

  // Get latest levy status per owner
  const ownerIds = (owners ?? []).map((o) => o.id)
  const { data: latestInvoices } = ownerIds.length > 0
    ? await supabase
        .from("levy_invoices")
        .select("owner_id, status, balance_cents")
        .in("owner_id", ownerIds)
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
  const supabase = await createClient()
  const { data: schedules } = await supabase
    .from("levy_schedules")
    .select("*, buildings(id, name)")
    .eq("hoa_id", hoaId)
    .order("effective_from", { ascending: false })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm">Levy Schedules</h3>
      </div>
      {(schedules ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No levy schedules configured.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(schedules ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{s.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.schedule_type.replace(/_/g, " ")} — {s.calculation_method.replace(/_/g, " ")} — Budget: {formatZAR(s.total_budget_cents)}/mo
                  </p>
                  <p className="text-xs text-muted-foreground">
                    From: {formatDateShort(new Date(s.effective_from))}
                    {s.effective_to ? ` to ${formatDateShort(new Date(s.effective_to))}` : " (ongoing)"}
                  </p>
                  {s.buildings && (
                    <p className="text-xs text-muted-foreground">Building: {(s.buildings as { name: string }).name}</p>
                  )}
                </div>
                <Badge variant={s.is_active ? "default" : "secondary"}>
                  {s.is_active ? "Active" : "Inactive"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

async function HOAAGMTab({ hoaId }: { hoaId: string }) {
  const supabase = await createClient()
  const { data: agms } = await supabase
    .from("agm_records")
    .select("*")
    .eq("hoa_id", hoaId)
    .order("meeting_date", { ascending: false })

  const { data: resolutions } = await supabase
    .from("agm_resolutions")
    .select("*, agm_records(meeting_date)")
    .eq("org_id", (await supabase.from("hoa_entities").select("org_id").eq("id", hoaId).single()).data?.org_id ?? "")
    .order("created_at", { ascending: false })
    .limit(10)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Meetings</CardTitle></CardHeader>
        <CardContent>
          {(agms ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No meetings recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Date</th>
                  <th className="text-left py-2 pr-2">Type</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-right py-2">Attendees</th>
                </tr>
              </thead>
              <tbody>
                {(agms ?? []).map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="py-2 pr-2">{formatDateShort(new Date(a.meeting_date))}</td>
                    <td className="py-2 pr-2 uppercase text-xs">{a.agm_type}</td>
                    <td className="py-2 px-2">
                      <Badge variant="secondary">{a.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="text-right py-2">{a.attendees_count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {(resolutions ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Recent Resolutions</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Resolution</th>
                  <th className="text-left py-2 pr-2">Type</th>
                  <th className="text-left py-2 px-2">Result</th>
                  <th className="text-right py-2">Votes</th>
                </tr>
              </thead>
              <tbody>
                {(resolutions ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 pr-2">{r.description}</td>
                    <td className="py-2 pr-2 capitalize text-xs">{r.resolution_type}</td>
                    <td className="py-2 px-2">
                      <Badge variant={r.result === "passed" ? "default" : "secondary"}>
                        {r.result}
                      </Badge>
                    </td>
                    <td className="text-right py-2 text-xs">
                      {r.votes_for ?? 0}/{(r.votes_for ?? 0) + (r.votes_against ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function HOAFinancialsTab({ reserveBalance }: { reserveBalance: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Admin Fund</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Financial statements are generated monthly. View detailed income/expenditure
              in the Reports section.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Reserve Fund</CardTitle></CardHeader>
          <CardContent>
            <p className="font-heading text-2xl text-emerald-600">{formatZAR(reserveBalance)}</p>
            <p className="text-xs text-muted-foreground mt-1">Running balance</p>
          </CardContent>
        </Card>
      </div>
    </div>
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
