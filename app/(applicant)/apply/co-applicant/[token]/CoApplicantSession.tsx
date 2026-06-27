"use client"

/**
 * app/(applicant)/apply/co-applicant/[token]/CoApplicantSession.tsx — the co-applicant's identity+marital+consent form.
 *
 * Notes:  ADDENDUM_14Q §10 increment 1. Reuses IndividualIdentity (identity + marital). The invite link (sent to the
 *         co's email) IS the email-possession proof, so no separate OTP this increment; the consent tick is the
 *         sign-off. On submit → POST .../save → sets stage1_consent_given (unlocks the J1 gate + hub status + the 14M
 *         marital flags). If the primary linked this co as their in-community spouse, the marriage is pre-filled to
 *         confirm (14M §1). Income + documents are a later increment.
 */
import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Clock } from "lucide-react"
import { IndividualIdentity } from "@/components/parties/partySteps"
import { ActionButton } from "@/components/ui/actions"
import { validateIdentityCore, type PartyFormState, type PartyErrors } from "@/lib/parties/partyValidation"

export interface SpouseCandidate { firstName: string; lastName: string; email: string; idNumber: string }
export interface CoPrefill { maritalStatus: string | null; matrimonialRegime: string | null; spouseIsCoApplicant: boolean | null; linkedAsSpouse: boolean }
interface CoData { firstName: string; lastName: string; idType: string; idNumber: string; email: string; phone: string; currentAddress: Record<string, unknown> | null }

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-4 p-4">
      <div className="fs-panel flex flex-col gap-5" style={{ maxWidth: "none", width: "100%" }}>{children}</div>
    </div>
  )
}

export function CoApplicantSession({ token, expired, alreadyDone, co, prefill, primaryCandidate, primaryName, unitLabel }: Readonly<{
  token: string; expired: boolean; alreadyDone: boolean
  co: CoData; prefill: CoPrefill; primaryCandidate: SpouseCandidate | null; primaryName: string; unitLabel: string
}>) {
  const [form, setForm] = useState<PartyFormState>({
    idType: co.idType || "sa_id", firstName: co.firstName, lastName: co.lastName, idNumber: co.idNumber, email: co.email, phone: co.phone,
    maritalStatus: prefill.maritalStatus ?? undefined, matrimonialRegime: prefill.matrimonialRegime ?? undefined,
    spouseIsCoApplicant: prefill.spouseIsCoApplicant ?? undefined,
    addresses: (co.currentAddress as unknown as PartyFormState["addresses"]) ?? undefined,
  } as PartyFormState)
  const [errors, setErrors] = useState<PartyErrors>({})
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(alreadyDone)
  const set = (k: keyof PartyFormState, v: PartyFormState[keyof PartyFormState]) => setForm((p) => ({ ...p, [k]: v }))

  if (expired) return (
    <Shell><div className="flex flex-col items-center gap-3 py-8 text-center">
      <Clock className="size-10 text-[var(--ink-mute)]" />
      <h1 className="text-xl font-semibold text-[var(--ink)]">Your invite has expired</h1>
      <p className="text-sm text-[var(--ink-soft)]">Please ask the main applicant to resend your invitation link.</p>
    </div></Shell>
  )
  if (done) return (
    <Shell><div className="flex flex-col items-center gap-3 py-8 text-center">
      <CheckCircle2 className="size-10 text-emerald-600" />
      <h1 className="text-xl font-semibold text-[var(--ink)]">Your part is done ✓</h1>
      <p className="text-sm text-[var(--ink-soft)]">Thanks — your details and consent are in. The application goes to the agent once everyone on it has finished their part. You can close this page.</p>
    </div></Shell>
  )

  function resolveSpouse(): Record<string, unknown> | null {
    if (form.maritalStatus !== "married" || form.matrimonialRegime !== "in_community") return null
    if (form.spouseIsCoApplicant && primaryCandidate) return { isCoApplicant: true, idNumber: primaryCandidate.idNumber, email: primaryCandidate.email || null }
    return { firstName: form.spouseFirstName ?? "", lastName: form.spouseLastName ?? "", idNumber: form.spouseIdNumber ?? "", email: form.spouseEmail ?? "" }
  }

  async function submit() {
    const e = validateIdentityCore("individual", form, true)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error("Please complete the highlighted fields."); return }
    if (!consent) { toast.error("Please tick the consent box to continue."); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/applications/co-applicant/${token}/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName, idType: form.idType, idNumber: form.idNumber, dob: form.dob,
          maritalStatus: form.maritalStatus, matrimonialRegime: form.matrimonialRegime,
          currentAddress: form.addresses ?? null,
          spouseInfo: resolveSpouse(),
          sectionData: { addresses: form.addresses ?? null, marital: { maritalStatus: form.maritalStatus ?? null, matrimonialRegime: form.matrimonialRegime ?? null } },
          consent: true,
        }),
      })
      const json = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) { toast.error(json.error ?? "Could not save your details."); return }
      setDone(true)
    } catch {
      toast.error("Could not save your details. Please try again.")
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <div className="border-b border-[var(--rule)] pb-3">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">Complete your part of the application</h1>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">You&apos;ve been added to the application for <strong className="text-[var(--ink)]">{unitLabel}</strong> by {primaryName}. Confirm your details and consent below.</p>
      </div>

      {prefill.linkedAsSpouse && (
        <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--amber)] bg-[var(--amber-wash)] p-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          <span className="mt-0.5 inline-block size-1.5 shrink-0 rounded-full bg-[var(--amber)]" />
          <span>{primaryName} indicated you&apos;re their spouse (married in community of property). We&apos;ve pre-filled that below — please confirm or correct it.</span>
        </div>
      )}

      <IndividualIdentity f={form} set={set} errors={errors} fullFica sectioned coApplicants={primaryCandidate ? [primaryCandidate] : []} suggestSpouseIsCo={false} />

      <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-sunk)] p-4 text-sm leading-relaxed text-[var(--ink-soft)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-3.5 accent-[var(--amber)]" />
        <span>I confirm these are my details and I consent to the processing of my personal information for this rental application — affordability pre-screening and, if shortlisted, verification of my documents. No credit or bureau check runs at this stage.</span>
      </label>

      <div className="flex justify-end">
        <ActionButton tone="primary" onClick={submit} disabled={busy}>Submit my details</ActionButton>
      </div>
    </Shell>
  )
}
