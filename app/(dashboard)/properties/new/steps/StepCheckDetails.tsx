"use client"

/**
 * app/(dashboard)/properties/new/steps/StepCheckDetails.tsx — Step 1 "check your details"
 *
 * Notes:  ADDENDUM_60C 1a (owner) / 1b2 (agent). A LIGHT confirmation of the user's role on this
 *         property — not a re-capture (the full owner/agent profile lives in Settings, OQ3 lean).
 *         Confirming sets `selfDetailsConfirmed`, which gates Continue. The agent variant names the
 *         landlord captured at the previous step so the acting-for relationship is explicit.
 */
import { ShieldCheck, UserCheck } from "lucide-react"
import { useWizard, type LandlordDraft } from "../WizardContext"

function ownerLabel(l: LandlordDraft | null): string {
  if (l?.option === "new") {
    const name = l.company_name || [l.first_name, l.last_name].filter(Boolean).join(" ")
    return name || "the owner"
  }
  return "the owner you added"   // existing / later — name isn't held in wizard state
}

interface StepCheckDetailsProps {
  variant: "owner" | "agent"
}

export function StepCheckDetails({ variant }: Readonly<StepCheckDetailsProps>) {
  const { state, patch } = useWizard()
  const isOwner = variant === "owner"

  const body = isOwner
    ? "You're adding this property as its owner and landlord. Leases, statements, and notices are issued in your name, using the details on your account."
    : `You're managing this property for ${ownerLabel(state.landlord)}. You'll act as the managing agent — the owner stays the landlord on leases and statements.`

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-[var(--r-button)] border bg-muted/20 p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-button)] bg-primary/10 text-primary">
          {isOwner ? <ShieldCheck className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
        </span>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {isOwner ? "You're the owner & landlord" : "You're the managing agent"}
          </p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Need to change your own details? Update your profile anytime in{" "}
        <span className="font-medium text-foreground">Settings → Profile</span>. You can complete the
        {isOwner ? " property owner" : " owner's full"} record after setup.
      </p>

      <label className="flex items-start gap-2.5 rounded-[var(--r-button)] border bg-card p-3 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={state.selfDetailsConfirmed}
          onChange={(e) => patch({ selfDetailsConfirmed: e.target.checked })}
          className="mt-0.5"
        />
        <span className="leading-snug">
          {isOwner
            ? "I confirm I'm the owner of this property."
            : "I confirm I'm acting as the managing agent for this property."}
        </span>
      </label>
    </div>
  )
}
