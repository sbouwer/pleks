import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Phone, Mail, MessageSquare } from "lucide-react"
import { maskIdNumber } from "@/lib/crypto/idNumber"
import { CommunicationFeed } from "./CommunicationFeed"

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .single()

  if (!tenant) notFound()

  const { data: contacts } = await supabase
    .from("tenant_contacts")
    .select("*")
    .eq("tenant_id", tenantId)

  const { data: comms } = await supabase
    .from("communication_log")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: history } = await supabase
    .from("tenancy_history")
    .select("*, units(unit_number, properties(name))")
    .eq("tenant_id", tenantId)
    .order("move_in_date", { ascending: false })

  const name = tenant.tenant_type === "individual"
    ? `${tenant.first_name || ""} ${tenant.last_name || ""}`.trim()
    : tenant.company_name || "Unnamed"

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/tenants" className="hover:text-foreground">Tenants</Link> &rsaquo; {name}
          </p>
          <h1 className="font-heading text-3xl">{name}</h1>
          <p className="text-sm text-muted-foreground capitalize">{tenant.tenant_type} tenant</p>
        </div>
        <Button variant="outline" render={<Link href={`/tenants/${tenantId}/edit`} />}>
          <Pencil className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal details */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {tenant.tenant_type === "individual" ? (
              <>
                {tenant.id_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID ({tenant.id_type})</span>
                    <span>{maskIdNumber(tenant.id_number)}</span>
                  </div>
                )}
                {tenant.date_of_birth && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date of Birth</span>
                    <span>{new Date(tenant.date_of_birth).toLocaleDateString("en-ZA")}</span>
                  </div>
                )}
                {tenant.nationality && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nationality</span>
                    <span>{tenant.nationality}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {tenant.company_reg_number && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reg Number</span>
                    <span>{tenant.company_reg_number}</span>
                  </div>
                )}
                {tenant.contact_person && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact Person</span>
                    <span>{tenant.contact_person}</span>
                  </div>
                )}
              </>
            )}
            <div className="pt-2 border-t border-border space-y-2">
              {tenant.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <a href={`mailto:${tenant.email}`} className="text-sm hover:text-brand">{tenant.email}</a>
                </div>
              )}
              {tenant.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <a href={`tel:${tenant.phone}`} className="text-sm hover:text-brand">{tenant.phone}</a>
                </div>
              )}
            </div>
            {tenant.employer_name && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Employment</p>
                <p>{tenant.occupation && `${tenant.occupation} at `}{tenant.employer_name}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Emergency contacts */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Emergency Contacts</CardTitle></CardHeader>
          <CardContent>
            {(!contacts || contacts.length === 0) ? (
              <p className="text-sm text-muted-foreground">No emergency contacts added.</p>
            ) : (
              <div className="space-y-3">
                {contacts.map((c) => (
                  <div key={c.id} className="text-sm">
                    <p className="font-medium">{c.full_name}</p>
                    <p className="text-muted-foreground">{c.relationship} · {c.phone || c.email}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Communication log */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Communications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CommunicationFeed tenantId={tenantId} initialComms={comms || []} />
        </CardContent>
      </Card>

      {/* Tenancy history */}
      {history && history.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Tenancy History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((h) => {
                const unit = h.units as unknown as { unit_number: string; properties: { name: string } } | null
                return (
                  <div key={h.id} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                    <div className="flex-1">
                      {unit && <span>{unit.properties.name} — {unit.unit_number}</span>}
                      <span className="text-muted-foreground ml-2">
                        {new Date(h.move_in_date).toLocaleDateString("en-ZA")}
                        {h.move_out_date && ` → ${new Date(h.move_out_date).toLocaleDateString("en-ZA")}`}
                      </span>
                    </div>
                    <span className="text-xs capitalize bg-surface-elevated px-2 py-0.5 rounded">{h.status}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
