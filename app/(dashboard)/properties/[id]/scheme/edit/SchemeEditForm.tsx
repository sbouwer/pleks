"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { saveManagingScheme, createManagingScheme, unlinkManagingScheme } from "@/lib/actions/schemes"
import { toast } from "sonner"

const SCHEME_TYPES = [
  { value: "body_corporate",     label: "Body corporate" },
  { value: "hoa",                label: "HOA" },
  { value: "share_block",        label: "Share block" },
  { value: "retirement_village", label: "Retirement village" },
  { value: "other",              label: "Other" },
]

const LEVY_CYCLES = [
  { value: "monthly",   label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually",  label: "Annually" },
]

export interface SchemeEditDefaults {
  schemeId:                 string | null
  name:                     string | null
  schemeType:               string | null
  csosRegistrationNumber:   string | null
  levyCycle:                string | null
  csosOmbudContact:         string | null
  notes:                    string | null
}

interface SchemeEditFormProps {
  propertyId: string
  defaults:   SchemeEditDefaults
}

export function SchemeEditForm({ propertyId, defaults }: Readonly<SchemeEditFormProps>) {
  const router = useRouter()
  const backHref = `/properties/${propertyId}?tab=scheme`

  const [schemeType, setSchemeType] = useState(defaults.schemeType ?? "body_corporate")
  const [levyCycle, setLevyCycle] = useState(defaults.levyCycle ?? "")
  const [unlinking, setUnlinking] = useState(false)

  const isEditing = !!defaults.schemeId

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      formData.set("scheme_type", schemeType)
      formData.set("levy_cycle", levyCycle)

      const result = isEditing
        ? await saveManagingScheme(defaults.schemeId!, propertyId, formData)
        : await createManagingScheme(propertyId, formData)

      if (result?.error) return result
      toast.success(isEditing ? "Scheme updated" : "Scheme created")
      router.push(backHref)
      return null
    },
    null,
  )

  async function handleUnlink() {
    if (!confirm("Remove this managing scheme from the property? The scheme record will remain.")) return
    setUnlinking(true)
    const result = await unlinkManagingScheme(propertyId)
    if (result?.error) {
      toast.error(result.error)
      setUnlinking(false)
    } else {
      toast.success("Managing scheme removed")
      router.push(`/properties/${propertyId}?tab=overview`)
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="text-sm text-danger">{state.error}</p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Scheme name *</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={defaults.name ?? ""}
          placeholder="e.g. BC Belmont Square"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Scheme type *</Label>
          <Select value={schemeType} onValueChange={(v) => { if (v) setSchemeType(v) }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SCHEME_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Levy cycle</Label>
          <Select value={levyCycle} onValueChange={(v) => setLevyCycle(v ?? "")}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {LEVY_CYCLES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csos_registration_number">CSOS registration number</Label>
        <Input
          id="csos_registration_number"
          name="csos_registration_number"
          defaultValue={defaults.csosRegistrationNumber ?? ""}
          placeholder="e.g. CSOS-CPT-12345"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csos_ombud_contact">CSOS ombud contact</Label>
        <Input
          id="csos_ombud_contact"
          name="csos_ombud_contact"
          defaultValue={defaults.csosOmbudContact ?? ""}
          placeholder="e.g. 087 000 9000"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaults.notes ?? ""}
        />
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {(() => {
            if (pending) return "Saving…"
            return isEditing ? "Save changes" : "Create scheme"
          })()}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
          Cancel
        </Button>
      </div>

      {isEditing && (
        <div className="pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-danger border-danger/30 hover:bg-danger/5"
            onClick={handleUnlink}
            disabled={unlinking}
          >
            {unlinking ? "Removing…" : "Remove from property"}
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            Removes the link between this property and the scheme. The scheme record is kept.
          </p>
        </div>
      )}
    </form>
  )
}
