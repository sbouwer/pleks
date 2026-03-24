import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/shared/EmptyState"
import { Users, Plus } from "lucide-react"
import { maskIdNumber } from "@/lib/crypto/idNumber"

export default async function TenantsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, tenant_type, first_name, last_name, company_name, contact_person, email, phone, id_number")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  const list = tenants || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Tenants</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{list.length} tenants</p>
          )}
        </div>
        <Button render={<Link href="/tenants/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Add Tenant
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No tenants yet"
          description="Add your first tenant to get started."
          action={{ label: "Add Tenant", onClick: () => {} }}
        />
      ) : (
        <div className="space-y-2">
          {list.map((tenant) => {
            const name = tenant.tenant_type === "individual"
              ? `${tenant.first_name || ""} ${tenant.last_name || ""}`.trim()
              : tenant.company_name || "Unnamed Company"

            return (
              <Link key={tenant.id} href={`/tenants/${tenant.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        {tenant.email || tenant.phone || "No contact info"}
                        {tenant.id_number && ` · ID: ${maskIdNumber(tenant.id_number)}`}
                      </p>
                    </div>
                    <span className="text-xs capitalize text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded">
                      {tenant.tenant_type}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
