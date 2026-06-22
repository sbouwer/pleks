"use client"

/**
 * app/(dashboard)/listings/[slug]/ListingQuickbar.tsx — listing detail action surface: view / edit / delete.
 *
 * Auth:   parent page is gatewaySSR; the server actions re-check requireAgentWriteAccess + org.
 * Notes:  Icon segment (DetailQuickbar style). Edit opens a dialog → updateListingAction (material changes email
 *         live applicants). Delete uses DeleteButton's confirm → deleteListingAction: with submissions it warns +
 *         declines/notifies applicants + archives; with none it hard-deletes.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { ActionButton, IconButton } from "@/components/ui/actions"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ExternalLink, Pencil, Trash2 } from "lucide-react"
import { updateListingAction, deleteListingAction, type ListingEditInput } from "@/lib/applications/listingActions"

export interface ListingEditValues {
  asking_rent_cents: number
  available_from: string | null
  closes_at: string | null
  description: string | null
  requirements: string | null
  min_income_multiple: number | null
  pet_friendly: boolean
  status: string
}

/** Borderless functional icon (action-language pa-edit: amber corner accent + amber-wash hover) — matches the
 *  supplier detail header's Edit/Archive icons. */
function FnIcon({ icon, label, onClick, disabled }: Readonly<{ icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }>) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="pa-edit">
      {icon}
    </button>
  )
}

export function ListingQuickbar({ listingId, publicUrl, submittedCount, initial }: Readonly<{
  listingId: string; publicUrl: string | null; submittedCount: number; initial: ListingEditValues
}>) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    setDeleting(true)
    const r = await deleteListingAction(listingId)
    if (r?.error) { toast.error(r.error); setDeleting(false); setConfirmOpen(false); return }
    if (r.archived) toast.success(`Listing withdrawn — ${r.declined} applicant${r.declined === 1 ? "" : "s"} notified`)
    else toast.success("Listing deleted")
    router.push("/listings")
  }

  let deleteDesc: string
  if (submittedCount > 0) {
    const verb = submittedCount === 1 ? "has" : "have"
    const noun = submittedCount === 1 ? "applicant" : "applicants"
    deleteDesc = `${submittedCount} ${noun} ${verb} applied. They will be notified their application can no longer proceed, and the listing will be withdrawn (their records are kept).`
  } else {
    deleteDesc = "This listing has no applications and will be permanently deleted."
  }

  return (
    <div className="flex items-center gap-1">
      {/* Nav/view — bordered IconButton (supplier-detail icon language) */}
      {publicUrl && <IconButton icon={<ExternalLink className="size-3.5" />} label="View listing" onClick={() => window.open(publicUrl, "_blank", "noopener,noreferrer")} />}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {/* Manage — borderless functional icons */}
      <FnIcon icon={<Pencil className="size-3.5" />} label="Edit listing" onClick={() => setEditOpen(true)} />
      <FnIcon icon={<Trash2 className="size-3.5" />} label="Delete listing" onClick={() => setConfirmOpen(true)} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={submittedCount > 0 ? "Withdraw this listing?" : "Delete this listing?"}
        description={deleteDesc}
        variant="destructive"
        confirmLabel={submittedCount > 0 ? "Withdraw & notify" : "Delete"}
        onConfirm={onDelete}
        loading={deleting}
      />
      <ListingEditDialog open={editOpen} onOpenChange={setEditOpen} listingId={listingId} initial={initial} onSaved={() => router.refresh()} />
    </div>
  )
}

function ListingEditDialog({ open, onOpenChange, listingId, initial, onSaved }: Readonly<{
  open: boolean; onOpenChange: (o: boolean) => void; listingId: string; initial: ListingEditValues; onSaved: () => void
}>) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    asking_rent: initial.asking_rent_cents ? Math.round(initial.asking_rent_cents / 100).toString() : "",
    available_from: initial.available_from ?? "",
    closes_at: initial.closes_at ?? "",
    description: initial.description ?? "",
    requirements: initial.requirements ?? "",
    min_income_multiple: initial.min_income_multiple != null ? String(initial.min_income_multiple) : "3.33",
    pet_friendly: initial.pet_friendly,
  })
  const set = (k: keyof typeof form, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }))

  async function save() {
    const rentCents = Math.round(parseFloat(form.asking_rent) * 100)
    if (!form.asking_rent || isNaN(rentCents) || rentCents <= 0) { toast.error("Asking rent is required"); return }
    setSaving(true)
    const input: ListingEditInput = {
      asking_rent_cents: rentCents,
      available_from: form.available_from || null,
      closes_at: form.closes_at || null,
      description: form.description.trim() || null,
      requirements: form.requirements.trim() || null,
      min_income_multiple: parseFloat(form.min_income_multiple) || 3.33,
      pet_friendly: form.pet_friendly,
    }
    const r = await updateListingAction(listingId, input)
    setSaving(false)
    if (r?.error) { toast.error(r.error); return }
    if (r.notified) toast.success(`Saved — ${r.notified} applicant${r.notified === 1 ? "" : "s"} notified of the change`)
    else toast.success("Listing updated")
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Edit listing</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="el_rent">Asking rent (R) *</Label>
              <Input id="el_rent" type="number" step="100" value={form.asking_rent} onChange={(e) => set("asking_rent", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="el_avail">Available from</Label>
              <DatePickerInput value={form.available_from} onChange={(v) => set("available_from", v)} placeholder="Available from" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="el_closes">Applications close (optional)</Label>
            <DatePickerInput value={form.closes_at} onChange={(v) => set("closes_at", v)} placeholder="No closing date" />
            <p className="text-xs text-muted-foreground">Changing material details (rent, dates, requirements) emails everyone who has already applied.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="el_desc">Description</Label>
            <Textarea id="el_desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="el_req">Requirements (shown to applicants)</Label>
            <Textarea id="el_req" rows={2} value={form.requirements} onChange={(e) => set("requirements", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="el_mim">Min income multiple</Label>
              <Input id="el_mim" type="number" step="0.01" value={form.min_income_multiple} onChange={(e) => set("min_income_multiple", e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="el_pet" type="checkbox" checked={form.pet_friendly} onChange={(e) => set("pet_friendly", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="el_pet">Pet friendly</Label>
            </div>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <ActionButton tone="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</ActionButton>
          <ActionButton tone="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
