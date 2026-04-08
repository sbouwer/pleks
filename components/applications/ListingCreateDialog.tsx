"use client"

/**
 * Listing creation dialog.
 * Opened from unit detail page or property unit row.
 * Creates a listings record, generates slug, shows shareable URL.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { generateListingSlug } from "@/lib/applications/slug"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Copy, Check, ExternalLink } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  unit: {
    id: string
    unit_number: string
    asking_rent_cents?: number | null
  }
  property: {
    id: string
    name: string
    city?: string | null
  }
  orgId: string
}

export function ListingCreateDialog({ open, onOpenChange, unit, property, orgId }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<"form" | "published">("form")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null)

  const [form, setForm] = useState({
    asking_rent: unit.asking_rent_cents ? Math.round(unit.asking_rent_cents / 100).toString() : "",
    available_from: "",
    description: "",
    requirements: "",
    min_income_multiple: "3.33",
    pet_friendly: false,
    publish: true,
  })

  function update(field: keyof typeof form, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  async function handleSave(publish: boolean) {
    const rentCents = Math.round(parseFloat(form.asking_rent) * 100)
    if (!form.asking_rent || isNaN(rentCents) || rentCents <= 0) {
      setError("Asking rent is required")
      return
    }
    if (!form.available_from) {
      setError("Available from date is required")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const slug = generateListingSlug(property.name, unit.unit_number, property.city ?? "")

      const { data, error: insertError } = await supabase
        .from("listings")
        .insert({
          org_id: orgId,
          unit_id: unit.id,
          property_id: property.id,
          asking_rent_cents: rentCents,
          available_from: form.available_from,
          description: form.description.trim() || null,
          requirements: form.requirements.trim() || null,
          min_income_multiple: parseFloat(form.min_income_multiple) || 3.33,
          pet_friendly: form.pet_friendly,
          status: publish ? "active" : "draft",
          public_slug: publish ? slug : null,
          required_documents: ["id_document", "payslip_x3", "bank_statement_x3", "employment_letter"],
        })
        .select("id, public_slug")
        .single()

      if (insertError) throw insertError

      if (publish && data.public_slug) {
        setPublishedSlug(data.public_slug)
        setStep("published")
      } else {
        onOpenChange(false)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing")
    } finally {
      setSaving(false)
    }
  }

  const listingUrl = publishedSlug ? `${APP_URL}/apply/${publishedSlug}` : ""
  const whatsappText = publishedSlug
    ? encodeURIComponent(`Available to rent: ${unit.unit_number} at ${property.name}${property.city ? `, ${property.city}` : ""}\n${formatRent(form.asking_rent)}/month${form.available_from ? ` · Available ${new Date(form.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}` : ""}\nApply here: ${listingUrl}`)
    : ""

  async function copyUrl() {
    await navigator.clipboard.writeText(listingUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    onOpenChange(false)
    setStep("form")
    setPublishedSlug(null)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create listing — {unit.unit_number}, {property.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="asking_rent">Asking rent (R) *</Label>
                  <Input
                    id="asking_rent"
                    type="number"
                    step="100"
                    placeholder="7000"
                    value={form.asking_rent}
                    onChange={(e) => update("asking_rent", e.target.value)}
                  />
                  {form.asking_rent && parseFloat(form.min_income_multiple) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Min income: R {Math.round(parseFloat(form.asking_rent) * parseFloat(form.min_income_multiple)).toLocaleString("en-ZA")}/mo
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="available_from">Available from *</Label>
                  <Input
                    id="available_from"
                    type="date"
                    value={form.available_from}
                    onChange={(e) => update("available_from", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Spacious garden flat in quiet suburb. Close to schools and shops..."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="requirements">Requirements (shown to applicants)</Label>
                <Textarea
                  id="requirements"
                  rows={2}
                  placeholder="Minimum income 3× rent. No smoking. 12-month lease preferred."
                  value={form.requirements}
                  onChange={(e) => update("requirements", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="min_income_multiple">Min income multiple</Label>
                  <Input
                    id="min_income_multiple"
                    type="number"
                    step="0.01"
                    value={form.min_income_multiple}
                    onChange={(e) => update("min_income_multiple", e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="pet_friendly"
                    type="checkbox"
                    checked={form.pet_friendly}
                    onChange={(e) => update("pet_friendly", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="pet_friendly">Pet friendly</Label>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Required documents (standard)</p>
                <p>SA ID or passport · 3 payslips · 3-month bank statement · Employment letter</p>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                Save as draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving}>
                {saving ? "Publishing…" : "Publish listing"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Listing published</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Your listing is live. Share this link with prospective tenants.
              </p>

              <div className="flex items-center gap-2">
                <Input value={listingUrl} readOnly className="text-sm font-mono" />
                <Button variant="outline" size="icon" onClick={copyUrl}>
                  {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                </Button>
                <Button variant="outline" size="icon" render={<a href={listingUrl} target="_blank" rel="noreferrer" />}>
                  <ExternalLink className="size-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  render={
                    <a
                      href={`https://wa.me/?text=${whatsappText}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  Share via WhatsApp
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function formatRent(rentStr: string): string {
  const n = parseFloat(rentStr)
  if (isNaN(n)) return "R—"
  return `R ${Math.round(n).toLocaleString("en-ZA")}`
}
