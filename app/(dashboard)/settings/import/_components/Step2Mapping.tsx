"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type { AnalysisResult } from "../page"
// FIELD_ALIASES available for future Haiku fallback

const ALL_FIELDS = [
  { value: "__skip", label: "— Skip this column —", entity: "" },
  { value: "first_name", label: "First name", entity: "tenant" },
  { value: "last_name", label: "Last name", entity: "tenant" },
  { value: "__split_name", label: "Full name (split)", entity: "tenant" },
  { value: "email", label: "Email", entity: "tenant" },
  { value: "phone", label: "Phone", entity: "tenant" },
  { value: "id_number", label: "ID number", entity: "tenant" },
  { value: "employer_name", label: "Employer", entity: "tenant" },
  { value: "tenant_role", label: "Tenant role", entity: "tenant" },
  { value: "property_name", label: "Property name", entity: "unit" },
  { value: "unit_number", label: "Unit number", entity: "unit" },
  { value: "address_line1", label: "Address", entity: "unit" },
  { value: "suburb", label: "Suburb", entity: "unit" },
  { value: "city", label: "City", entity: "unit" },
  { value: "province", label: "Province", entity: "unit" },
  { value: "bedrooms", label: "Bedrooms", entity: "unit" },
  { value: "bathrooms", label: "Bathrooms", entity: "unit" },
  { value: "lease_start", label: "Lease start", entity: "lease" },
  { value: "lease_end", label: "Lease end", entity: "lease" },
  { value: "rent_amount_cents", label: "Monthly rent", entity: "lease" },
  { value: "deposit_amount_cents", label: "Deposit", entity: "lease" },
  { value: "escalation_percent", label: "Escalation %", entity: "lease" },
  { value: "payment_method", label: "Payment method", entity: "lease" },
  // Bank fields
  { value: "tenant_bank_account_1", label: "Bank account (encrypted)", entity: "bank" },
  { value: "tenant_bank_name_1", label: "Bank name", entity: "bank" },
  { value: "tenant_bank_branch_1", label: "Branch code", entity: "bank" },
  { value: "tenant_bank_account_2", label: "Bank account 2 (encrypted)", entity: "bank" },
  { value: "tenant_bank_name_2", label: "Bank name 2", entity: "bank" },
  { value: "tenant_bank_branch_2", label: "Branch code 2", entity: "bank" },
  // TPN extras
  { value: "__dob", label: "Date of birth", entity: "extra" },
  { value: "__vat", label: "VAT number", entity: "extra" },
  { value: "__legal_name", label: "Legal / company name", entity: "extra" },
  { value: "__trading_name", label: "Trading name", entity: "extra" },
  { value: "__entity_id", label: "System ID (skip)", entity: "extra" },
  { value: "__tpn_reference", label: "TPN reference (skip)", entity: "extra" },
  { value: "__description", label: "Description", entity: "extra" },
  { value: "__entity_state", label: "Status filter", entity: "filter" },
  { value: "__entity_type", label: "Type filter", entity: "filter" },
  { value: "__address_type", label: "Address type (skip)", entity: "extra" },
  // Routing
  { value: "tenant_notes", label: "→ Tenant notes", entity: "extra" },
  { value: "unit_notes", label: "→ Unit notes", entity: "extra" },
  { value: "lease_notes", label: "→ Lease notes", entity: "extra" },
  { value: "export_csv", label: "→ Export CSV", entity: "extra" },
]

interface Step2MappingProps {
  analysis: AnalysisResult
  headers: string[]
  sampleRows: Record<string, string>[]
  initialMapping: Record<string, { field: string; entity: string }>
  onBack: () => void
  onConfirm: (
    mapping: Record<string, { field: string; entity: string }>,
    extraRouting: Record<string, string>
  ) => void
}

export function Step2Mapping({
  analysis,
  headers,
  sampleRows,
  initialMapping,
  onBack,
  onConfirm,
}: Readonly<Step2MappingProps>) {
  const [mapping, setMapping] = useState<Record<string, { field: string; entity: string }>>(initialMapping)
  const [bankNoticeShown, setBankNoticeShown] = useState(false)
  const [bankImportAccepted, setBankImportAccepted] = useState<boolean | null>(null)

  // Detect if any columns are mapped to bank fields
  const hasBankColumns = Object.values(mapping).some((m) => m.entity === "bank")
  const showBankNotice = hasBankColumns && !bankNoticeShown

  function handleFieldChange(column: string, value: string) {
    if (value === "__skip") {
      const updated = { ...mapping }
      delete updated[column]
      setMapping(updated)
      return
    }
    const fieldDef = ALL_FIELDS.find((f) => f.value === value)
    setMapping({
      ...mapping,
      [column]: { field: value, entity: fieldDef?.entity ?? "extra" },
    })
  }

  function handleConfirm() {
    const extraRouting: Record<string, string> = {}
    for (const [col, m] of Object.entries(mapping)) {
      if (["tenant_notes", "unit_notes", "lease_notes", "export_csv"].includes(m.field)) {
        extraRouting[col] = m.field
      }
    }
    onConfirm(mapping, extraRouting)
  }

  // Required fields check
  const mappedFields = new Set(Object.values(mapping).map((m) => m.field))
  const hasName = mappedFields.has("first_name") || mappedFields.has("__split_name")
  const hasEmail = mappedFields.has("email")
  const missingRequired: string[] = []
  if (analysis.detectedEntities.hasTenant) {
    if (!hasName) missingRequired.push("Name (first name or full name)")
    if (!hasEmail) missingRequired.push("Email")
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-heading text-2xl mb-2">Map columns</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Confirm how each column maps to Pleks fields.
      </p>

      {/* POPIA bank details notice */}
      {showBankNotice && (
        <Card className="mb-4 border-amber-500/20">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Bank account numbers detected in your file</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              These will be stored encrypted and used only for DebiCheck mandate setup and deposit refund processing.
              Imported bank details are marked as unverified until confirmed via DebiCheck authentication.
            </p>
            <div className="flex gap-3">
              <Button size="sm" onClick={() => { setBankNoticeShown(true); setBankImportAccepted(true) }}>
                Import bank details securely
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setBankNoticeShown(true)
                setBankImportAccepted(false)
                // Set all bank columns to skip
                const updated = { ...mapping }
                for (const [col, m] of Object.entries(updated)) {
                  if (m.entity === "bank") delete updated[col]
                }
                setMapping(updated)
              }}>
                Skip bank columns
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border border-border rounded-lg overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Your column</th>
              <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Sample</th>
              <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">Maps to</th>
              <th className="text-left px-3 py-2 text-xs text-muted-foreground font-medium w-16">Status</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((col) => {
              const mapped = mapping[col]
              const sample = sampleRows[0]?.[col] ?? ""
              function getStatus() {
                if (!mapped) return "unmapped"
                if (["tenant_notes", "unit_notes", "lease_notes", "export_csv"].includes(mapped.field)) return "extra"
                return "matched"
              }
              const status = getStatus()
              let badgeClass: string
              if (status === "matched") { badgeClass = "bg-green-500/10 text-green-400" }
              else if (status === "extra") { badgeClass = "bg-amber-500/10 text-amber-400" }
              else { badgeClass = "bg-surface-elevated text-muted-foreground" }

              return (
                <tr key={col} className="border-b border-border/50">
                  <td className="px-3 py-2">
                    <p className="font-mono text-xs">{col}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-mono text-xs text-muted-foreground truncate max-w-[120px]">{sample}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={mapped?.field ?? "__skip"}
                      onValueChange={(v) => handleFieldChange(col, v ?? "__skip")}
                    >
                      <SelectTrigger className="h-8 text-xs w-[180px]">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_FIELDS
                          .filter((f) => bankImportAccepted !== false || f.entity !== "bank")
                          .map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className={`text-[10px] ${badgeClass}`}>
                      {getStatus() === "unmapped" && "Skip"}
                      {getStatus() === "extra" && "Extra"}
                      {getStatus() === "matched" && "Matched"}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <div className="mb-4 rounded-md border border-danger/20 bg-danger-bg p-3 text-sm text-danger">
          Required fields not yet mapped: {missingRequired.join(", ")}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" /> Back
        </Button>
        <Button onClick={handleConfirm} className="flex-1" disabled={missingRequired.length > 0}>
          Continue <ArrowRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
