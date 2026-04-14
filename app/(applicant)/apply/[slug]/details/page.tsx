"use client"

/**
 * Step 1: Personal details.
 * On submit: creates application record + access token, emails token to applicant.
 * Redirects to /apply/[slug]/documents?token={token}
 */

import { useState, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { validateSAIdNumber } from "@/lib/crypto/idNumber"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"

interface FormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  id_type: string
  id_number: string
  date_of_birth: string
  nationality: string
  permit_type: string
  permit_number: string
  permit_expiry_date: string
  employment_type: string
  employer_name: string
  gross_monthly_income: string
  current_address: string
  current_landlord_name: string
  current_landlord_phone: string
  reason_for_moving: string
  motivation: string
}

const initialForm: FormData = {
  first_name: "", last_name: "", email: "", phone: "",
  id_type: "sa_id", id_number: "", date_of_birth: "",
  nationality: "", permit_type: "", permit_number: "", permit_expiry_date: "",
  employment_type: "", employer_name: "", gross_monthly_income: "",
  current_address: "", current_landlord_name: "", current_landlord_phone: "",
  reason_for_moving: "", motivation: "",
}

export default function DetailsPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  const [form, setForm] = useState<FormData>(() => {
    try {
      const s = sessionStorage.getItem(`pleks_app_${slug}`)
      return s ? JSON.parse(s) : initialForm
    } catch { return initialForm }
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const idValidation = useMemo(
    () => form.id_type === "sa_id" && form.id_number.length === 13
      ? validateSAIdNumber(form.id_number)
      : null,
    [form.id_type, form.id_number]
  )

  function update(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if ((field === "id_number" || field === "id_type") && next.id_type === "sa_id" && next.id_number.length === 13) {
        const result = validateSAIdNumber(next.id_number)
        if (result.valid && result.dob) next.date_of_birth = result.dob.toISOString().split("T")[0]
      }
      return next
    })
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.first_name.trim()) e.first_name = "Required"
    if (!form.last_name.trim()) e.last_name = "Required"
    if (!form.email.trim() || !form.email.includes("@")) e.email = "Valid email required"
    if (!form.phone.trim()) e.phone = "Required"
    if (!form.id_number.trim()) e.id_number = "Required"
    if (!form.date_of_birth) e.date_of_birth = "Required"
    if (!form.employment_type) e.employment_type = "Required"
    if (!form.gross_monthly_income) e.gross_monthly_income = "Required"
    if (form.id_type === "sa_id" && form.id_number && idValidation && !idValidation.valid) {
      e.id_number = "Invalid SA ID number"
    }
    if (form.id_type === "passport") {
      if (!form.nationality.trim()) e.nationality = "Required"
      if (!form.permit_type) e.permit_type = "Required"
      if (!form.permit_number.trim()) e.permit_number = "Required"
      if (!form.permit_expiry_date) e.permit_expiry_date = "Required"
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleContinue() {
    if (!validate()) return
    setSubmitting(true)
    setServerError(null)

    try {
      const res = await fetch(`/api/applications/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      })
      const json = await res.json() as { token?: string; applicationId?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to create application")

      // Clear session storage
      sessionStorage.removeItem(`pleks_app_${slug}`)
      router.push(`/apply/${slug}/documents?token=${json.token}`)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const isForeign = form.id_type === "passport" || form.id_type === "asylum_permit"
  const nonSaIdLabel = form.id_type === "passport" ? "Passport number" : "Permit number"
  const idFieldLabel = form.id_type === "sa_id" ? "SA ID number" : nonSaIdLabel

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Step 1 of 3</p>
        <h1 className="text-xl font-semibold">Your details</h1>
      </div>

      {/* Personal */}
      <Card>
        <CardHeader><CardTitle>Personal information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name" error={errors.first_name}>
              <Input className="h-12" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
            </Field>
            <Field label="Last name" error={errors.last_name}>
              <Input className="h-12" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
            </Field>
          </div>
          <Field label="Email" error={errors.email}>
            <Input className="h-12" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input className="h-12" type="tel" placeholder="082 123 4567" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Identity */}
      <Card>
        <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="ID type">
            <Select value={form.id_type} onValueChange={(v) => update("id_type", v ?? "sa_id")}>
              <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sa_id">SA ID number</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="asylum_permit">Asylum permit</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={idFieldLabel} error={errors.id_number}>
            <Input className="h-12" value={form.id_number} onChange={(e) => update("id_number", e.target.value)} maxLength={form.id_type === "sa_id" ? 13 : undefined} />
            {form.id_type === "sa_id" && idValidation && (
              <p className={`text-xs mt-1 ${idValidation.valid ? "text-green-600" : "text-destructive"}`}>
                {idValidation.valid
                  ? `Valid — DOB: ${idValidation.dob?.toLocaleDateString("en-ZA")}, ${idValidation.gender}`
                  : "Invalid SA ID number"}
              </p>
            )}
          </Field>
          <Field label="Date of birth" error={errors.date_of_birth}>
            <DatePickerInput value={form.date_of_birth} onChange={(v) => update("date_of_birth", v)} placeholder="Date of birth" disabled={form.id_type === "sa_id" && idValidation?.valid === true} />
          </Field>
          {isForeign && (
            <>
              <Field label="Nationality" error={errors.nationality}>
                <Input className="h-12" value={form.nationality} onChange={(e) => update("nationality", e.target.value)} />
              </Field>
              <Field label="Permit type" error={errors.permit_type}>
                <Select value={form.permit_type} onValueChange={(v) => update("permit_type", v ?? "")}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select permit type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work_permit">Work permit</SelectItem>
                    <SelectItem value="study_permit">Study permit</SelectItem>
                    <SelectItem value="critical_skills">Critical skills visa</SelectItem>
                    <SelectItem value="permanent_residence">Permanent residence</SelectItem>
                    <SelectItem value="spousal_visa">Spousal visa</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Permit number" error={errors.permit_number}>
                <Input className="h-12" value={form.permit_number} onChange={(e) => update("permit_number", e.target.value)} />
              </Field>
              <Field label="Permit expiry date" error={errors.permit_expiry_date}>
                <DatePickerInput value={form.permit_expiry_date} onChange={(v) => update("permit_expiry_date", v)} placeholder="Permit expiry date" />
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      {/* Employment */}
      <Card>
        <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Employment status" error={errors.employment_type}>
            <Select value={form.employment_type} onValueChange={(v) => update("employment_type", v ?? "")}>
              <SelectTrigger className="h-12"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="permanent">Permanently employed</SelectItem>
                <SelectItem value="contract">Contract / Fixed term</SelectItem>
                <SelectItem value="self_employed">Self-employed</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="unemployed">Unemployed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.employment_type && !["unemployed", "retired", "student"].includes(form.employment_type) && (
            <Field label="Employer / Business name">
              <Input className="h-12" value={form.employer_name} onChange={(e) => update("employer_name", e.target.value)} />
            </Field>
          )}
          <Field label="Gross monthly income (R)" error={errors.gross_monthly_income}>
            <Input className="h-12" type="number" placeholder="0" value={form.gross_monthly_income} onChange={(e) => update("gross_monthly_income", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Current situation (optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Current living situation <span className="text-sm font-normal text-muted-foreground">(optional)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Current address">
            <Input className="h-12" value={form.current_address} onChange={(e) => update("current_address", e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Landlord / Agent name">
              <Input className="h-12" value={form.current_landlord_name} onChange={(e) => update("current_landlord_name", e.target.value)} />
            </Field>
            <Field label="Landlord / Agent phone">
              <Input className="h-12" type="tel" value={form.current_landlord_phone} onChange={(e) => update("current_landlord_phone", e.target.value)} />
            </Field>
          </div>
          <Field label="Reason for moving">
            <Input className="h-12" value={form.reason_for_moving} onChange={(e) => update("reason_for_moving", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Motivation (optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Motivation <span className="text-sm font-normal text-muted-foreground">(optional)</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Why should you be chosen for this property?</p>
          <Textarea
            rows={4}
            value={form.motivation}
            onChange={(e) => { if (e.target.value.length <= 500) update("motivation", e.target.value) }}
            placeholder="A few words about yourself..."
          />
          <p className="text-xs text-muted-foreground text-right">{form.motivation.length}/500</p>
        </CardContent>
      </Card>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button className="w-full h-12 text-base font-semibold" onClick={handleContinue} disabled={submitting}>
        {submitting ? <><Loader2 className="size-4 mr-2 animate-spin" />Creating application…</> : "Next: Documents →"}
      </Button>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
