"use client"

/**
 * components/properties/WarrantiesCardClient.tsx — Interactive warranty card (add, archive, toggle archived)
 *
 * Auth:   Agent (dashboard layout)
 * Data:   POST /api/warranties, PATCH /api/warranties/[id]/archive
 * Notes:  Rendered by WarrantiesCard (server component) which passes pre-fetched rows.
 *         Archive is soft-only (D-60B-14). router.refresh() re-runs server component on mutations.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Plus, Archive, ChevronDown, ChevronUp } from "lucide-react"

export interface WarrantyRow {
  id: string
  subject: string
  warranty_type: string
  expires_on: string | null
  starts_on: string
  manufacturer_name: string | null
  archived_at: string | null
  claim_phone: string | null
  claim_email: string | null
  claim_url: string | null
  claim_notes: string | null
  notes: string | null
  source_type: string
}

interface Props {
  propertyId: string
  unitId: string | null
  active: WarrantyRow[]
  archived: WarrantyRow[]
}

const WARRANTY_TYPES = [
  { value: "manufacturer",    label: "Manufacturer" },
  { value: "workmanship",     label: "Workmanship" },
  { value: "building_defects", label: "Building defects" },
  { value: "roof",            label: "Roof" },
  { value: "waterproofing",   label: "Waterproofing" },
  { value: "other",           label: "Other" },
]

const TYPE_LABEL: Record<string, string> = Object.fromEntries(WARRANTY_TYPES.map((t) => [t.value, t.label]))

function today(): string {
  return new Date().toISOString().split("T")[0]
}

function formatExpiry(expiresOn: string | null): string {
  if (!expiresOn) return "No expiry date"
  const expiry = new Date(expiresOn)
  const now = new Date()
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const dateStr = expiry.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
  if (daysLeft < 0) return `${dateStr} (expired)`
  if (daysLeft < 14) return `${dateStr} (${daysLeft}d left)`
  if (daysLeft < 60) return `${dateStr} (${Math.ceil(daysLeft / 7)} weeks left)`
  if (daysLeft < 365) return `${dateStr} (${Math.round(daysLeft / 30)}mo left)`
  return `${dateStr} (${Math.round(daysLeft / 365)}y left)`
}

function expiryColour(expiresOn: string | null): "green" | "amber" | "red" {
  if (!expiresOn) return "green"
  const daysLeft = Math.ceil((new Date(expiresOn).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return "red"
  if (daysLeft <= 60) return "amber"
  return "green"
}

const DOT_COLOUR = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red:   "bg-red-500",
}

function providerLabel(w: WarrantyRow): string | null {
  if (w.manufacturer_name) return w.manufacturer_name
  return null
}

// ── Add dialog ────────────────────────────────────────────────────────────────

interface AddForm {
  subject: string
  warranty_type: string
  manufacturer_name: string
  starts_on: string
  expires_on: string
  claim_phone: string
  claim_email: string
  claim_url: string
  notes: string
}

function emptyForm(): AddForm {
  return {
    subject: "",
    warranty_type: "manufacturer",
    manufacturer_name: "",
    starts_on: today(),
    expires_on: "",
    claim_phone: "",
    claim_email: "",
    claim_url: "",
    notes: "",
  }
}

function AddWarrantyDialog({
  propertyId,
  unitId,
  onSuccess,
}: Readonly<{
  propertyId: string
  unitId: string | null
  onSuccess: () => void
}>) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AddForm>(emptyForm)
  const [isPending, startTransition] = useTransition()

  function set(field: keyof AddForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit() {
    if (!form.subject.trim()) {
      toast.error("Subject is required")
      return
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/warranties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: form.subject.trim(),
            warranty_type: form.warranty_type,
            property_id: propertyId,
            unit_id: unitId ?? null,
            manufacturer_name: form.manufacturer_name.trim() || null,
            starts_on: form.starts_on,
            expires_on: form.expires_on || null,
            claim_phone: form.claim_phone.trim() || null,
            claim_email: form.claim_email.trim() || null,
            claim_url: form.claim_url.trim() || null,
            notes: form.notes.trim() || null,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast.error((d as { error?: string }).error || "Failed to add warranty")
          return
        }
        toast.success("Warranty added")
        setForm(emptyForm())
        setOpen(false)
        onSuccess()
      } catch {
        toast.error("Failed to add warranty")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" type="button">
          <Plus className="size-3.5" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add warranty</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label className="text-xs">Subject *</Label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="e.g. Kwikot 150L geyser, kitchen"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Type *</Label>
            <select
              className="mt-1 w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={form.warranty_type}
              onChange={(e) => set("warranty_type", e.target.value)}
            >
              {WARRANTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs">Manufacturer / provider name</Label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="e.g. Kwikot, Cape Plumbing"
              value={form.manufacturer_name}
              onChange={(e) => set("manufacturer_name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Starts on *</Label>
              <Input
                type="date"
                className="h-8 text-sm mt-1"
                value={form.starts_on}
                onChange={(e) => set("starts_on", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Expires on</Label>
              <Input
                type="date"
                className="h-8 text-sm mt-1"
                value={form.expires_on}
                onChange={(e) => set("expires_on", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Claim phone</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="e.g. 021 555 1234"
                value={form.claim_phone}
                onChange={(e) => set("claim_phone", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Claim email</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="e.g. claims@brand.co.za"
                value={form.claim_email}
                onChange={(e) => set("claim_email", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Claim URL</Label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="e.g. https://www.kwikot.co.za/warranty"
              value={form.claim_url}
              onChange={(e) => set("claim_url", e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <textarea
              className="mt-1 w-full text-sm rounded-md border border-input bg-background px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
              placeholder="Any additional notes or exclusions"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving…" : "Save warranty"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Archive button ─────────────────────────────────────────────────────────────

function ArchiveButton({ warrantyId, onSuccess }: Readonly<{ warrantyId: string; onSuccess: () => void }>) {
  const [isPending, startTransition] = useTransition()

  function handleArchive() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/warranties/${warrantyId}/archive`, { method: "PATCH" })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          toast.error((d as { error?: string }).error || "Failed to archive")
          return
        }
        toast.success("Warranty archived")
        onSuccess()
      } catch {
        toast.error("Failed to archive")
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleArchive}
      disabled={isPending}
      title="Archive warranty"
      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 ml-2 shrink-0"
    >
      <Archive className="size-3.5" />
    </button>
  )
}

// ── Warranty row ──────────────────────────────────────────────────────────────

function WarrantyRowItem({ w, onMutate }: Readonly<{ w: WarrantyRow; onMutate: () => void }>) {
  const colour = expiryColour(w.expires_on)
  const provider = providerLabel(w)

  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
      <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", DOT_COLOUR[colour])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{w.subject}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {TYPE_LABEL[w.warranty_type] ?? w.warranty_type}
          {provider ? ` · ${provider}` : ""}
          {" · "}
          {formatExpiry(w.expires_on)}
        </p>
      </div>
      {!w.archived_at && <ArchiveButton warrantyId={w.id} onSuccess={onMutate} />}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function WarrantiesCardClient({ propertyId, unitId, active, archived }: Readonly<Props>) {
  const router = useRouter()
  const [showArchived, setShowArchived] = useState(false)

  function refresh() {
    router.refresh()
  }

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Warranties</span>
        <AddWarrantyDialog propertyId={propertyId} unitId={unitId} onSuccess={refresh} />
      </div>
      <CardContent className="pt-3 pb-3">
        {active.length === 0 && archived.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No warranties tracked yet. Add manufacturer, workmanship, or building-defects cover here so we can flag matches when maintenance requests come in.
          </p>
        ) : (
          <div className="space-y-0">
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground pb-2">No active warranties.</p>
            ) : (
              active.map((w) => <WarrantyRowItem key={w.id} w={w} onMutate={refresh} />)
            )}

            {archived.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showArchived
                    ? <><ChevronUp className="size-3.5" /> Hide archived</>
                    : <><ChevronDown className="size-3.5" /> Show {archived.length} archived</>}
                </button>
                {showArchived && (
                  <div className="mt-2 opacity-60">
                    {archived.map((w) => <WarrantyRowItem key={w.id} w={w} onMutate={refresh} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
