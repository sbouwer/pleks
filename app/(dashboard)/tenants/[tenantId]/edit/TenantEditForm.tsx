"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface TenantEditFormProps {
  readonly tenant: Record<string, unknown>
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
}

export function TenantEditForm({ tenant, action }: TenantEditFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      formData.set("tenant_type", tenant.tenant_type as string)
      const result = await action(formData)
      return result || null
    },
    null
  )

  const isIndividual = tenant.tenant_type === "individual"

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      {isIndividual ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name *</Label>
            <Input name="first_name" defaultValue={tenant.first_name as string} required />
          </div>
          <div className="space-y-2">
            <Label>Last Name *</Label>
            <Input name="last_name" defaultValue={tenant.last_name as string} required />
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Company Name *</Label>
            <Input name="company_name" defaultValue={tenant.company_name as string} required />
          </div>
          <div className="space-y-2">
            <Label>Contact Person *</Label>
            <Input name="contact_person" defaultValue={tenant.contact_person as string} required />
          </div>
          <div className="space-y-2">
            <Label>Registration Number</Label>
            <Input name="company_reg_number" defaultValue={(tenant.company_reg_number as string) || ""} />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Email</Label>
        <Input name="email" type="email" defaultValue={(tenant.email as string) || ""} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input name="phone" type="tel" defaultValue={(tenant.phone as string) || ""} />
        </div>
        <div className="space-y-2">
          <Label>Alt Phone</Label>
          <Input name="phone_alt" type="tel" defaultValue={(tenant.phone_alt as string) || ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Employer</Label>
          <Input name="employer_name" defaultValue={(tenant.employer_name as string) || ""} />
        </div>
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input name="occupation" defaultValue={(tenant.occupation as string) || ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Internal Notes</Label>
        <Textarea name="notes" defaultValue={(tenant.notes as string) || ""} rows={3} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  )
}
