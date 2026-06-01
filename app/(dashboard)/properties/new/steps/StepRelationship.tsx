"use client"

/**
 * app/(dashboard)/properties/new/steps/StepRelationship.tsx — Step 1: "Who is this property for?"
 *
 * Notes:  ADDENDUM_60C step 1. Establishes the relationship FIRST so the owner is known before any
 *         owner-dependent question. The answer derives `managedMode` (D-60C-03): "self" → self_owned
 *         (you are the landlord), "other" → managed_for_owner (you're an agent; a landlord is added
 *         next). Switching the answer resets the downstream owner resolution + details confirmation.
 */
import { Home, Users, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWizard, type Relationship } from "../WizardContext"

interface ChoiceProps {
  selected:    boolean
  onSelect:    () => void
  icon:        React.ReactNode
  title:       string
  desc:        string
}

function RelationshipChoice({ selected, onSelect, icon, title, desc }: Readonly<ChoiceProps>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/[0.04]"
          : "border-border hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <span className={cn(
        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
        selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
      )}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{desc}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30",
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  )
}

export function StepRelationship() {
  const { state, patch } = useWizard()

  function choose(relationship: Relationship) {
    if (relationship === state.relationship) return
    patch({
      relationship,
      managedMode: relationship === "self" ? "self_owned" : "managed_for_owner",
      // Reset the downstream owner resolution + details confirmation when the relationship changes.
      landlord: relationship === "self" ? null : state.landlord,
      selfDetailsConfirmed: false,
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        This tells us whose property this is — so leases, statements, and notices are addressed to the
        right owner from the start.
      </p>

      <div className="grid gap-3">
        <RelationshipChoice
          selected={state.relationship === "self"}
          onSelect={() => choose("self")}
          icon={<Home className="h-5 w-5" />}
          title="For myself"
          desc="I own this property. I'm the landlord — leases and statements are in my name."
        />
        <RelationshipChoice
          selected={state.relationship === "other"}
          onSelect={() => choose("other")}
          icon={<Users className="h-5 w-5" />}
          title="For someone else"
          desc="I manage it for the owner (a client, a family member, a trust). I act as the agent; the owner is the landlord."
        />
      </div>
    </div>
  )
}
