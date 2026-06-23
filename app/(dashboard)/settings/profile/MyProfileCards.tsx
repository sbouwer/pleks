"use client"

/**
 * app/(dashboard)/settings/profile/MyProfileCards.tsx — My profile body (Personal + Address cards)
 *
 * Route:  /settings/profile?tab=personal
 * Auth:   client island; edits go through EditProfileModal (updateAgentContactParty, agent write gate)
 * Data:   PartyFormState (agent contact) loaded by the page; refresh() after a save.
 * Notes:  Two read-only iconic DetailCards — Personal information · Address — each with an edit pencil that
 *         opens the 2-step profile modal jumped to that step. Mirrors the Organisation › Details cards.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailCard } from "@/components/detail/DetailCard"
import { DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { EditProfileModal, type ProfileStep } from "./EditProfileModal"
import { ProfilePhotoCard } from "./ProfilePhotoCard"
import type { PartyFormState } from "@/lib/parties/partyValidation"

function EditPencil({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="pa-edit">
      <Pencil className="size-3.5" />
    </button>
  )
}

function Rows({ rows, fill }: Readonly<{ rows: ReadonlyArray<{ k: string; v: string | null }>; fill?: boolean }>) {
  return (
    <dl className={fill ? "flex h-full flex-col divide-y divide-border/60" : "divide-y divide-border/60"}>
      {rows.map((r) => (
        <div key={r.k} className={`flex items-baseline justify-between gap-4 py-2 text-sm ${fill ? "flex-1 items-center" : ""}`}>
          <dt className="shrink-0 text-muted-foreground">{r.k}</dt>
          <dd className={r.v ? "text-right font-medium text-foreground" : "text-right text-muted-foreground/50"}>{r.v || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

function line(parts: ReadonlyArray<string | null | undefined>): string | null {
  const s = parts.map((p) => p?.trim()).filter(Boolean).join(", ")
  return s || null
}

const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" }
const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", phone: "Phone call", post: "Post" }
const ADDR_LABEL: Record<string, string> = { physical: "Physical", postal: "Postal", billing: "Billing" }
const labelOf = (map: Record<string, string>, v: string | null | undefined) => (v ? map[v] ?? v : null)

export function MyProfileCards({ contactId, initialForm, avatarUrl }: Readonly<{ contactId: string; initialForm: PartyFormState; avatarUrl: string | null }>) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [step, setStep] = useState<ProfileStep>("personal")

  function openAt(s: ProfileStep) { setStep(s); setEditOpen(true) }

  const f = initialForm
  const name = [f.title, f.firstName, f.middleNames, f.lastName, f.suffix].map((x) => x?.trim()).filter(Boolean).join(" ") || null
  const idMasked = f.idNumber?.trim() ? `••••••••••${f.idNumber.trim().slice(-4)}` : null

  const addrByType = new Map(
    (f.addresses ?? []).map((a) => [a.type, line([a.line1, a.line2, a.suburb, a.city, a.province, a.postal, a.country && a.country !== "South Africa" ? a.country : null])] as const),
  )
  // Always show the three address types as equal, card-filling rows (Physical · Postal · Billing) — value or "—".
  const addressRows = (["physical", "postal", "billing"] as const).map((t) => ({ k: ADDR_LABEL[t], v: addrByType.get(t) ?? null }))

  return (
    <>
      <DetailFullWidth>
        <div className="grid gap-4 md:grid-cols-3">
          <DetailCard title="Personal information" headerAction={<EditPencil label="Edit personal information" onClick={() => openAt("personal")} />}>
            <Rows rows={[
              { k: "Name", v: name },
              { k: "Designation", v: f.designation ?? null },
              { k: "Date of birth", v: f.dob ?? null },
              { k: "Gender", v: labelOf(GENDER_LABEL, f.gender) },
              { k: "ID", v: idMasked },
              { k: "Email", v: f.email ?? null },
              { k: "Phone", v: f.phone ?? null },
              { k: "Preferred contact", v: labelOf(CHANNEL_LABEL, f.preferredChannel) },
            ]} />
          </DetailCard>

          <DetailCard title="Address" headerAction={<EditPencil label="Edit address" onClick={() => openAt("address")} />}>
            <Rows rows={addressRows} fill />
          </DetailCard>

          <ProfilePhotoCard initialUrl={avatarUrl} />
        </div>
      </DetailFullWidth>

      <EditProfileModal
        open={editOpen}
        onOpenChange={setEditOpen}
        initialStep={step}
        contactId={contactId}
        initialForm={initialForm}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
