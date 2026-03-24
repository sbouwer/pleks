"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { validateSAIdNumber } from "@/lib/crypto/idNumber"
import { toast } from "sonner"

type Step = 1 | 2 | 3 | 4

export default function NewTenantPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [tenantType, setTenantType] = useState<"individual" | "company">("individual")
  const [loading, setLoading] = useState(false)

  // Individual fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [idType, setIdType] = useState("sa_id")
  const [idNumber, setIdNumber] = useState("")
  const [idValidation, setIdValidation] = useState<ReturnType<typeof validateSAIdNumber> | null>(null)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")

  // Company fields
  const [companyName, setCompanyName] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [companyReg, setCompanyReg] = useState("")

  // POPIA
  const [popiaConsent, setPopiaConsent] = useState(false)

  // Additional
  const [notes, setNotes] = useState("")
  const [employer, setEmployer] = useState("")
  const [occupation, setOccupation] = useState("")

  function handleIdNumberChange(value: string) {
    setIdNumber(value)
    if (idType === "sa_id" && value.replace(/\s/g, "").length === 13) {
      setIdValidation(validateSAIdNumber(value))
    } else {
      setIdValidation(null)
    }
  }

  async function handleSubmit() {
    if (!popiaConsent) {
      toast.error("POPIA consent is required")
      return
    }
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (!membership) return

    const formData = new FormData()
    formData.set("tenant_type", tenantType)
    formData.set("email", email)
    formData.set("phone", phone)
    formData.set("popia_consent", "true")
    formData.set("notes", notes)
    formData.set("employer_name", employer)
    formData.set("occupation", occupation)

    if (tenantType === "individual") {
      formData.set("first_name", firstName)
      formData.set("last_name", lastName)
      formData.set("id_type", idType)
      formData.set("id_number", idNumber)
      if (idValidation?.dob) {
        formData.set("date_of_birth", idValidation.dob.toISOString().split("T")[0])
      }
    } else {
      formData.set("company_name", companyName)
      formData.set("contact_person", contactPerson)
      formData.set("company_reg_number", companyReg)
    }

    // Use fetch to call server action
    const { createTenant } = await import("@/lib/actions/tenants")
    const result = await createTenant(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  // Step 1: Type selection
  if (step === 1) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">Add Tenant</h1>
        <p className="text-muted-foreground text-sm mb-4">What type of tenant?</p>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setTenantType("individual"); setStep(2) }}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">Individual person</p>
            <p className="text-sm text-muted-foreground">Natural person — protected by RHA and CPA</p>
          </button>
          <button
            type="button"
            onClick={() => { setTenantType("company"); setStep(2) }}
            className="w-full text-left p-4 rounded-lg border border-border hover:border-brand/50 transition-colors"
          >
            <p className="font-medium">Company / juristic person</p>
            <p className="text-sm text-muted-foreground">Lease terms govern — RHA and CPA typically don&apos;t apply</p>
          </button>
        </div>
      </div>
    )
  }

  // Step 2: Details
  if (step === 2) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">
          {tenantType === "individual" ? "Tenant Details" : "Company Details"}
        </h1>
        <div className="space-y-4">
          {tenantType === "individual" ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>ID Type</Label>
                <Select value={idType} onValueChange={(v) => setIdType(v ?? "sa_id")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sa_id">SA ID Number</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="asylum_permit">Asylum Permit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ID / Passport Number</Label>
                <Input value={idNumber} onChange={(e) => handleIdNumberChange(e.target.value)} />
                {idValidation && (
                  <p className={`text-sm ${idValidation.valid ? "text-success" : "text-danger"}`}>
                    {idValidation.valid
                      ? `Valid — DOB: ${idValidation.dob?.toLocaleDateString("en-ZA")}, ${idValidation.gender}, ${idValidation.citizenship === "sa_citizen" ? "SA Citizen" : "Permanent Resident"}`
                      : "Invalid SA ID number"}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Registration Number</Label>
                <Input value={companyReg} onChange={(e) => setCompanyReg(e.target.value)} />
              </div>
              <Card className="border-info/30 bg-info-bg">
                <CardContent className="text-sm pt-4">
                  Company tenants are typically not covered by the Rental Housing Act or CPA consumer protections. Lease terms will govern the tenancy.
                </CardContent>
              </Card>
            </>
          )}
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Phone *</Label>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" onClick={() => setStep(3)}>Continue</Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 3: POPIA consent
  if (step === 3) {
    return (
      <div className="max-w-xl">
        <h1 className="font-heading text-3xl mb-6">POPIA Consent</h1>
        <Card className="border-info/30 bg-info-bg mb-4">
          <CardContent className="text-sm pt-4 space-y-2">
            <p className="font-medium">Information Notice — Processing of Personal Information</p>
            <p>Your personal information will be processed for managing your lease agreement, processing rental payments, communicating about your tenancy, conducting property inspections, and handling your security deposit.</p>
            <p>Your information will be stored securely and not shared with third parties except as required to fulfil these purposes.</p>
            <p>You have the right to access, correct, or request deletion of your personal information at any time via the tenant portal.</p>
            <p className="text-xs text-muted-foreground">Processing under POPIA — Protection of Personal Information Act 4 of 2013.</p>
          </CardContent>
        </Card>
        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={popiaConsent}
            onChange={(e) => setPopiaConsent(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            The tenant has been informed of the above and consents to the processing of their personal information.
          </span>
        </label>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
          <Button className="flex-1" onClick={() => setStep(4)} disabled={!popiaConsent}>
            Continue
          </Button>
        </div>
      </div>
    )
  }

  // Step 4: Additional + save
  return (
    <div className="max-w-xl">
      <h1 className="font-heading text-3xl mb-6">Additional Details</h1>
      <p className="text-muted-foreground text-sm mb-4">Optional — can be completed later.</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Employer</Label>
            <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Occupation</Label>
            <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Internal Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Not visible to tenant" />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Tenant"}
          </Button>
        </div>
      </div>
    </div>
  )
}
