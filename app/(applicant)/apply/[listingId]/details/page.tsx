"use client"

import { useState, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { validateSAIdNumber } from "@/lib/crypto/idNumber"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STORAGE_KEY = "pleks_application_details"

interface FormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  id_type: string
  id_number: string
  date_of_birth: string
  // Foreign national fields
  nationality: string
  permit_type: string
  permit_number: string
  permit_expiry_date: string
  // Employment
  employment_type: string
  employer_name: string
  gross_monthly_income: string
}

const initialForm: FormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  id_type: "sa_id",
  id_number: "",
  date_of_birth: "",
  nationality: "",
  permit_type: "",
  permit_number: "",
  permit_expiry_date: "",
  employment_type: "",
  employer_name: "",
  gross_monthly_income: "",
}

export default function DetailsPage() {
  const router = useRouter()
  const params = useParams()
  const listingId = params.listingId as string

  const [form, setForm] = useState<FormData>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      return s ? JSON.parse(s) : initialForm
    } catch {
      return initialForm
    }
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  // SA ID validation
  const idValidation = useMemo(
    () => form.id_type === "sa_id" && form.id_number.length === 13 ? validateSAIdNumber(form.id_number) : null,
    [form.id_type, form.id_number]
  )

  function update(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      // Auto-fill DOB from valid SA ID
      if ((field === "id_number" || field === "id_type") && next.id_type === "sa_id" && next.id_number.length === 13) {
        const result = validateSAIdNumber(next.id_number)
        if (result.valid && result.dob) {
          next.date_of_birth = result.dob.toISOString().split("T")[0]
        }
      }
      return next
    })
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.first_name.trim()) e.first_name = "Required"
    if (!form.last_name.trim()) e.last_name = "Required"
    if (!form.email.trim()) e.email = "Required"
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

  function handleContinue() {
    if (!validate()) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    router.push(`/apply/${listingId}/consent`)
  }

  const isForeign = form.id_type === "passport" || form.id_type === "asylum_permit"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Your details</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us a bit about yourself to get started.
        </p>
      </div>

      {/* Personal information */}
      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First name</Label>
              <Input
                id="first_name"
                className="h-12"
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                aria-invalid={!!errors.first_name}
              />
              {errors.first_name && (
                <p className="text-xs text-destructive">{errors.first_name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last name</Label>
              <Input
                id="last_name"
                className="h-12"
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                aria-invalid={!!errors.last_name}
              />
              {errors.last_name && (
                <p className="text-xs text-destructive">{errors.last_name}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="h-12"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              type="tel"
              className="h-12"
              placeholder="082 123 4567"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              aria-invalid={!!errors.phone}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Identification */}
      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>ID type</Label>
            <Select value={form.id_type} onValueChange={(v) => update("id_type", v ?? "sa_id")}>
              <SelectTrigger className="w-full h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sa_id">SA ID number</SelectItem>
                <SelectItem value="passport">Passport</SelectItem>
                <SelectItem value="asylum_permit">Asylum permit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="id_number">
              {form.id_type === "sa_id"
                ? "SA ID number"
                : form.id_type === "passport"
                ? "Passport number"
                : "Asylum permit number"}
            </Label>
            <Input
              id="id_number"
              className="h-12"
              value={form.id_number}
              onChange={(e) => update("id_number", e.target.value)}
              maxLength={form.id_type === "sa_id" ? 13 : undefined}
              aria-invalid={!!errors.id_number}
            />
            {errors.id_number && (
              <p className="text-xs text-destructive">{errors.id_number}</p>
            )}
            {/* SA ID validation feedback */}
            {form.id_type === "sa_id" && idValidation && (
              <div className="text-xs mt-1">
                {idValidation.valid ? (
                  <span className="text-green-500">
                    Valid — DOB: {idValidation.dob?.toLocaleDateString("en-ZA")},
                    {" "}{idValidation.gender}, {idValidation.citizenship?.replace("_", " ")}
                  </span>
                ) : (
                  <span className="text-destructive">Invalid SA ID number</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date_of_birth">Date of birth</Label>
            <Input
              id="date_of_birth"
              type="date"
              className="h-12"
              value={form.date_of_birth}
              onChange={(e) => update("date_of_birth", e.target.value)}
              readOnly={form.id_type === "sa_id" && idValidation?.valid === true}
              aria-invalid={!!errors.date_of_birth}
            />
            {errors.date_of_birth && (
              <p className="text-xs text-destructive">{errors.date_of_birth}</p>
            )}
          </div>

          {/* Foreign national fields */}
          {isForeign && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="nationality">Nationality</Label>
                <Input
                  id="nationality"
                  className="h-12"
                  value={form.nationality}
                  onChange={(e) => update("nationality", e.target.value)}
                  aria-invalid={!!errors.nationality}
                />
                {errors.nationality && (
                  <p className="text-xs text-destructive">{errors.nationality}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Permit type</Label>
                <Select value={form.permit_type} onValueChange={(v) => update("permit_type", v ?? "")}>
                  <SelectTrigger className="w-full h-12">
                    <SelectValue placeholder="Select permit type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work_permit">Work permit</SelectItem>
                    <SelectItem value="study_permit">Study permit</SelectItem>
                    <SelectItem value="critical_skills">Critical skills visa</SelectItem>
                    <SelectItem value="permanent_residence">Permanent residence</SelectItem>
                    <SelectItem value="spousal_visa">Spousal visa</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.permit_type && (
                  <p className="text-xs text-destructive">{errors.permit_type}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="permit_number">Permit number</Label>
                <Input
                  id="permit_number"
                  className="h-12"
                  value={form.permit_number}
                  onChange={(e) => update("permit_number", e.target.value)}
                  aria-invalid={!!errors.permit_number}
                />
                {errors.permit_number && (
                  <p className="text-xs text-destructive">{errors.permit_number}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="permit_expiry_date">Permit expiry date</Label>
                <Input
                  id="permit_expiry_date"
                  type="date"
                  className="h-12"
                  value={form.permit_expiry_date}
                  onChange={(e) => update("permit_expiry_date", e.target.value)}
                  aria-invalid={!!errors.permit_expiry_date}
                />
                {errors.permit_expiry_date && (
                  <p className="text-xs text-destructive">{errors.permit_expiry_date}</p>
                )}
              </div>

              {/* Permit document upload placeholder */}
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Upload permit document (coming soon)
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Employment */}
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employment type</Label>
            <Select value={form.employment_type} onValueChange={(v) => update("employment_type", v ?? "")}>
              <SelectTrigger className="w-full h-12">
                <SelectValue placeholder="Select employment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_time">Full-time employed</SelectItem>
                <SelectItem value="part_time">Part-time employed</SelectItem>
                <SelectItem value="self_employed">Self-employed</SelectItem>
                <SelectItem value="contractor">Contractor / Freelancer</SelectItem>
                <SelectItem value="retired">Retired</SelectItem>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="unemployed">Unemployed</SelectItem>
              </SelectContent>
            </Select>
            {errors.employment_type && (
              <p className="text-xs text-destructive">{errors.employment_type}</p>
            )}
          </div>

          {form.employment_type &&
            form.employment_type !== "unemployed" &&
            form.employment_type !== "retired" &&
            form.employment_type !== "student" && (
              <div className="space-y-1.5">
                <Label htmlFor="employer_name">Employer / Business name</Label>
                <Input
                  id="employer_name"
                  className="h-12"
                  value={form.employer_name}
                  onChange={(e) => update("employer_name", e.target.value)}
                />
              </div>
            )}

          <div className="space-y-1.5">
            <Label htmlFor="gross_monthly_income">Gross monthly income (R)</Label>
            <Input
              id="gross_monthly_income"
              type="number"
              className="h-12"
              placeholder="0"
              value={form.gross_monthly_income}
              onChange={(e) => update("gross_monthly_income", e.target.value)}
              aria-invalid={!!errors.gross_monthly_income}
            />
            {errors.gross_monthly_income && (
              <p className="text-xs text-destructive">{errors.gross_monthly_income}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        onClick={handleContinue}
      >
        Continue
      </Button>
    </div>
  )
}
