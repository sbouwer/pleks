"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, Download, Building2, Users, FileText, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import type { ImportResult } from "@/lib/import/csvParser"

const IMPORT_TYPES = [
  {
    key: "properties",
    label: "Properties & Units",
    icon: Building2,
    description: "Import properties with their units, addresses, and basic details.",
    template: "property_name,address_line1,suburb,city,province,erf_number,property_type,unit_number,bedrooms,bathrooms,floor_area_m2,asking_rent_cents,notes\nTwin Peaks,3 Salford Street,Bellville,Cape Town,Western Cape,4521,residential,Flat 1,2,1,65,660000,",
  },
  {
    key: "tenants",
    label: "Tenants",
    icon: Users,
    description: "Import tenant details. Must be done after importing properties.",
    template: "first_name,last_name,email,phone,id_number,id_type,employer_name,employment_type,notes\nJohn,Smith,john@email.com,0825551234,8501015009087,sa_id,ABC Company,permanent,",
  },
  {
    key: "leases",
    label: "Leases & Opening Balances",
    icon: FileText,
    description: "Import active leases with deposits and arrears. Must be done after importing properties and tenants.",
    template: "tenant_email,unit_address,lease_start,lease_end,monthly_rent_cents,deposit_held_cents,escalation_percent,lease_type,current_arrears_cents,payment_method,notes\njohn@email.com,\"Flat 1, 3 Salford Street\",2024-03-01,2025-02-28,660000,660000,10,residential,0,debicheck,",
  },
]

export default function ImportPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  function downloadTemplate(key: string) {
    const type = IMPORT_TYPES.find((t) => t.key === key)
    if (!type) return
    const blob = new Blob([type.template], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pleks_${key}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedType) return

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("type", selectedType)

      const res = await fetch("/api/import", { method: "POST", body: formData })
      const data = await res.json()

      if (!res.ok) {
        setResult({ created: 0, skipped: 0, errors: [{ row: 0, field: "", message: data.error }] })
      } else {
        setResult(data)
      }
    } catch {
      setResult({ created: 0, skipped: 0, errors: [{ row: 0, field: "", message: "Upload failed" }] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl">Import Data</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import properties, tenants, and leases from CSV files. TPN RentBook exports are automatically detected.
        </p>
      </div>

      {/* Import type cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {IMPORT_TYPES.map((type) => (
          <Card
            key={type.key}
            className={`cursor-pointer transition-colors ${selectedType === type.key ? "border-brand ring-1 ring-brand" : "hover:border-brand/50"}`}
            onClick={() => { setSelectedType(type.key); setResult(null) }}
          >
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-2">
                <type.icon className="size-5 text-brand" />
                <span className="font-medium text-sm">{type.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Selected type actions */}
      {selectedType && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Import {IMPORT_TYPES.find((t) => t.key === selectedType)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Download template */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Step 1: Download template</p>
                <p className="text-xs text-muted-foreground">Fill in the CSV with your data</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => downloadTemplate(selectedType)}>
                <Download className="size-3.5 mr-1.5" />
                Template
              </Button>
            </div>

            {/* Step 2: Upload */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">Step 2: Upload completed CSV</p>
                <p className="text-xs text-muted-foreground">We&apos;ll validate and preview before importing</p>
              </div>
              <label>
                <input
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                <Button variant="default" size="sm" disabled={uploading} render={<span />}>
                  <Upload className="size-3.5 mr-1.5" />
                  {uploading ? "Importing..." : "Upload CSV"}
                </Button>
              </label>
            </div>

            {/* Results */}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  {result.created > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      <CheckCircle2 className="size-3 mr-1" />
                      {result.created} created
                    </Badge>
                  )}
                  {result.skipped > 0 && (
                    <Badge className="bg-amber-100 text-amber-700">
                      <AlertTriangle className="size-3 mr-1" />
                      {result.skipped} skipped
                    </Badge>
                  )}
                </div>

                {result.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {result.errors.map((err, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 text-xs p-2 rounded ${
                          err.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {err.severity === "warning" ? (
                          <AlertTriangle className="size-3 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="size-3 mt-0.5 shrink-0" />
                        )}
                        <span>Row {err.row}: {err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TPN note */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium mb-1">Migrating from TPN RentBook?</p>
          <p className="text-xs text-muted-foreground">
            Export your contacts from TPN and upload the CSV here. Pleks automatically
            detects TPN column formats and maps them correctly. Dates (DD/MM/YYYY) and
            currency (R 6,600.00) are converted automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
