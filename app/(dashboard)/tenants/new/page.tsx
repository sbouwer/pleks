"use client"

import { useState } from "react"
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

const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]

function RequiredStar() {
  return <span className="text-danger ml-0.5">*</span>
}

export default function NewTenantPage() {
  const [step, setStep] = useState<Step>(1)
  const [tenantType, setTenantType] = useState<"individual" | "company">("individual")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
  const [companyReg, setCompanyReg] = useState("")
  // Director / mandated signatory
  const [dirFirstName, setDirFirstName] = useState("")
  const [dirLastName, setDirLastName] = useState("")
  const [dirIdType, setDirIdType] = useState("sa_id")
  const [dirIdNumber, setDirIdNumber] = useState("")
  const [dirIdValidation, setDirIdValidation] = useState<ReturnType<typeof validateSAIdNumber> | null>(null)
  const [dirPhone, setDirPhone] = useState("")
  const [dirEmail, setDirEmail] = useState("")
  // Company address
  const [addrLine1, setAddrLine1] = useState("")
  const [addrSuburb, setAddrSuburb] = useState("")
  const [addrCity, setAddrCity] = useState("")
  const [addrProvince, setAddrProvince] = useState("")
  const [addrPostalCode, setAddrPostalCode] = useState("")

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

  function handleDirIdNumberChange(value: string) {
    setDirIdNumber(value)
    if (dirIdType === "sa_id" && value.replace(/\s/g, "").length === 13) {
      setDirIdValidation(validateSAIdNumber(value))
    } else {
      setDirIdValidation(null)
    }
  }

  function validateStep2(): boolean {
    const errs: Record<string, string> = {}
    if (tenantType === "individual") {
      if (!firstName.trim()) errs.firstName = "Required"
      if (!lastName.trim()) errs.lastName = "Required"
      if (!email.trim()) errs.email = "Required"
      if (!phone.trim()) errs.phone = "Required"
    } else {
      if (!companyName.trim()) errs.companyName = "Required"
      if (!dirFirstName.trim()) errs.dirFirstName = "Required"
      if (!dirLastName.trim()) errs.dirLastName = "Required"
      if (!dirIdNumber.trim()) errs.dirIdNumber = "Required"
      if (!dirPhone.trim()) errs.dirPhone = "Required"
      if (!dirEmail.trim()) errs.dirEmail = "Required"
      if (!addrLine1.trim()) errs.addrLine1 = "Required"
      if (!addrCity.trim()) errs.addrCity = "Required"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!popiaConsent) {
      toast.error("POPIA consent is required")
      return
    }
    setLoading(true)

    const formData = new FormData()
    formData.set("tenant_type", tenantType)
    formData.set("email", tenantType === "individual" ? email : dirEmail)
    formData.set("phone", tenantType === "individual" ? phone : dirPhone)
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
      formData.set("company_reg_number", companyReg)
      // Director FICA
      formData.set("contact_first_name", dirFirstName)
      formData.set("contact_last_name", dirLastName)
      formData.set("contact_id_type", dirIdType)
      formData.set("contact_id_number", dirIdNumber)
      if (dirIdValidation?.dob) {
        formData.set("contact_date_of_birth", dirIdValidation.dob.toISOString().split("T")[0])
      }
      formData.set("contact_phone", dirPhone)
      formData.set("contact_email", dirEmail)
      // Company address
      formData.set("company_addr_line1", addrLine1)
      formData.set("company_addr_suburb", addrSuburb)
      formData.set("company_addr_city", addrCity)
      formData.set("company_addr_province", addrProvince)
      formData.set("company_addr_postal_code", addrPostalCode)
    }

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
                  <Label>First Name <RequiredStar /></Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Jane"
                    className={errors.firstName ? "border-danger" : ""}
                  />
                  {errors.firstName && <p className="text-xs text-danger">{errors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Last Name <RequiredStar /></Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Smith"
                    className={errors.lastName ? "border-danger" : ""}
                  />
                  {errors.lastName && <p className="text-xs text-danger">{errors.lastName}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>ID Type</Label>
                <Select value={idType} onValueChange={(v) => setIdType(v ?? "sa_id")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sa_id">SA ID Number</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="asylum_permit">Asylum Permit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ID / Passport Number</Label>
                <Input
                  value={idNumber}
                  onChange={(e) => handleIdNumberChange(e.target.value)}
                  placeholder={idType === "sa_id" ? "13-digit SA ID number" : "Passport or permit number"}
                />
                {idValidation && (
                  <p className={`text-sm ${idValidation.valid ? "text-success" : "text-danger"}`}>
                    {idValidation.valid
                      ? `Valid — DOB: ${idValidation.dob?.toLocaleDateString("en-ZA")}, ${idValidation.gender}, ${idValidation.citizenship === "sa_citizen" ? "SA Citizen" : "Permanent Resident"}`
                      : "Invalid SA ID number"}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Email <RequiredStar /></Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className={errors.email ? "border-danger" : ""}
                />
                {errors.email && <p className="text-xs text-danger">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Phone <RequiredStar /></Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 082 000 0000"
                  className={errors.phone ? "border-danger" : ""}
                />
                {errors.phone && <p className="text-xs text-danger">{errors.phone}</p>}
              </div>
            </>
          ) : (
            <>
              {/* Company identity */}
              <div className="space-y-2">
                <Label>Company Name <RequiredStar /></Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Legal entity name"
                  className={errors.companyName ? "border-danger" : ""}
                />
                {errors.companyName && <p className="text-xs text-danger">{errors.companyName}</p>}
              </div>
              <div className="space-y-2">
                <Label>CIPC Registration Number</Label>
                <Input
                  value={companyReg}
                  onChange={(e) => setCompanyReg(e.target.value)}
                  placeholder="e.g. 2023/123456/07"
                />
              </div>

              {/* Company address */}
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Company Address</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Street Address <RequiredStar /></Label>
                    <Input
                      value={addrLine1}
                      onChange={(e) => setAddrLine1(e.target.value)}
                      placeholder="e.g. 12 Main Road"
                      className={errors.addrLine1 ? "border-danger" : ""}
                    />
                    {errors.addrLine1 && <p className="text-xs text-danger">{errors.addrLine1}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Suburb</Label>
                      <Input value={addrSuburb} onChange={(e) => setAddrSuburb(e.target.value)} placeholder="e.g. Sandton" />
                    </div>
                    <div className="space-y-2">
                      <Label>City <RequiredStar /></Label>
                      <Input
                        value={addrCity}
                        onChange={(e) => setAddrCity(e.target.value)}
                        placeholder="e.g. Johannesburg"
                        className={errors.addrCity ? "border-danger" : ""}
                      />
                      {errors.addrCity && <p className="text-xs text-danger">{errors.addrCity}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Province</Label>
                      <Select value={addrProvince} onValueChange={(v) => setAddrProvince(v ?? "")}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select province" />
                        </SelectTrigger>
                        <SelectContent>
                          {SA_PROVINCES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Code</Label>
                      <Input value={addrPostalCode} onChange={(e) => setAddrPostalCode(e.target.value)} placeholder="e.g. 2196" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mandated signatory FICA */}
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Mandated Signatory (Director / Authorised Representative)</p>
                <p className="text-xs text-muted-foreground mb-3">The person who will sign the lease on behalf of the company. Full FICA required.</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>First Name <RequiredStar /></Label>
                      <Input
                        value={dirFirstName}
                        onChange={(e) => setDirFirstName(e.target.value)}
                        placeholder="e.g. John"
                        className={errors.dirFirstName ? "border-danger" : ""}
                      />
                      {errors.dirFirstName && <p className="text-xs text-danger">{errors.dirFirstName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Last Name <RequiredStar /></Label>
                      <Input
                        value={dirLastName}
                        onChange={(e) => setDirLastName(e.target.value)}
                        placeholder="e.g. Doe"
                        className={errors.dirLastName ? "border-danger" : ""}
                      />
                      {errors.dirLastName && <p className="text-xs text-danger">{errors.dirLastName}</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>ID Type</Label>
                    <Select value={dirIdType} onValueChange={(v) => setDirIdType(v ?? "sa_id")}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ID type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sa_id">SA ID Number</SelectItem>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="asylum_permit">Asylum Permit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>ID / Passport Number <RequiredStar /></Label>
                    <Input
                      value={dirIdNumber}
                      onChange={(e) => handleDirIdNumberChange(e.target.value)}
                      placeholder={dirIdType === "sa_id" ? "13-digit SA ID number" : "Passport or permit number"}
                      className={errors.dirIdNumber ? "border-danger" : ""}
                    />
                    {errors.dirIdNumber && <p className="text-xs text-danger">{errors.dirIdNumber}</p>}
                    {dirIdValidation && (
                      <p className={`text-sm ${dirIdValidation.valid ? "text-success" : "text-danger"}`}>
                        {dirIdValidation.valid
                          ? `Valid — DOB: ${dirIdValidation.dob?.toLocaleDateString("en-ZA")}, ${dirIdValidation.gender}, ${dirIdValidation.citizenship === "sa_citizen" ? "SA Citizen" : "Permanent Resident"}`
                          : "Invalid SA ID number"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Direct Phone <RequiredStar /></Label>
                    <Input
                      type="tel"
                      value={dirPhone}
                      onChange={(e) => setDirPhone(e.target.value)}
                      placeholder="e.g. 082 000 0000"
                      className={errors.dirPhone ? "border-danger" : ""}
                    />
                    {errors.dirPhone && <p className="text-xs text-danger">{errors.dirPhone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Direct Email <RequiredStar /></Label>
                    <Input
                      type="email"
                      value={dirEmail}
                      onChange={(e) => setDirEmail(e.target.value)}
                      placeholder="director@company.co.za"
                      className={errors.dirEmail ? "border-danger" : ""}
                    />
                    {errors.dirEmail && <p className="text-xs text-danger">{errors.dirEmail}</p>}
                  </div>
                </div>
              </div>

              <Card className="border-info/30 bg-info-bg">
                <CardContent className="text-sm pt-4">
                  Company tenants are typically not covered by the Rental Housing Act or CPA consumer protections. Lease terms govern the tenancy.
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button className="flex-1" onClick={() => { if (validateStep2()) setStep(3) }}>Continue</Button>
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
            <Input value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Company or employer name" />
          </div>
          <div className="space-y-2">
            <Label>Occupation</Label>
            <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} placeholder="e.g. Engineer" />
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
