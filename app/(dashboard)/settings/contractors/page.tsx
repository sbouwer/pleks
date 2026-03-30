"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { toast } from "sonner"

interface Contractor {
  id: string
  first_name: string
  last_name: string
  company_name: string | null
  email: string
  phone: string | null
  specialities: string[]
  is_active: boolean
}

export default function ContractorsPage() {
  const { orgId } = useOrg()
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    supabase
      .from("contractor_view")
      .select("id, first_name, last_name, company_name, email, phone, specialities, is_active")
      .eq("org_id", orgId)
      .order("first_name")
      .then(({ data }) => setContractors((data as Contractor[]) || []))
  }, [orgId])

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)

    const form = new FormData(e.currentTarget)
    const supabase = createClient()

    // Create contact first
    const { data: contact, error: contactError } = await supabase.from("contacts").insert({
      org_id: orgId,
      entity_type: "individual",
      primary_role: "contractor",
      first_name: form.get("name") as string,
      primary_email: form.get("email") as string,
      primary_phone: form.get("phone") as string || null,
      company_name: form.get("company_name") as string || null,
    }).select("id").single()

    if (contactError || !contact) {
      toast.error(contactError?.message || "Failed to create contact")
      setSaving(false)
      return
    }

    const { error } = await supabase.from("contractors").insert({
      org_id: orgId,
      contact_id: contact.id,
      specialities: (form.get("specialities") as string).split(",").map((s) => s.trim()).filter(Boolean),
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Contractor added")
      setShowAdd(false)
      // Refresh
      const { data } = await supabase
        .from("contractor_view")
        .select("id, first_name, last_name, company_name, email, phone, specialities, is_active")
        .eq("org_id", orgId)
        .order("first_name")
      setContractors((data as Contractor[]) || [])
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">Contractors</h1>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4 mr-1" /> Add Contractor
        </Button>
      </div>

      {showAdd && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">New Contractor</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input name="company_name" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" type="tel" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Specialities</Label>
                <Input name="specialities" placeholder="e.g. electrical, plumbing, hvac (comma separated)" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add Contractor"}</Button>
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {contractors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contractors added yet.</p>
      ) : (
        <div className="space-y-2">
          {contractors.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <p className="font-medium">{c.company_name || `${c.first_name} ${c.last_name}`.trim()}</p>
                  <p className="text-sm text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                  {c.specialities.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {c.specialities.map((s) => (
                        <span key={s} className="text-xs px-2 py-0.5 bg-surface-elevated rounded">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`text-xs ${c.is_active ? "text-success" : "text-muted-foreground"}`}>
                  {c.is_active ? "Active" : "Inactive"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
