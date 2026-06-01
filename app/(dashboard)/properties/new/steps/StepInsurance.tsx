"use client"

/**
 * app/(dashboard)/properties/new/steps/StepInsurance.tsx — wizard step: insurance capture / defer
 *
 * Route:  /properties/new (insurance step)
 * Data:   wizard client state (state.insurance); persisted on save by createPropertyFromWizard
 * Notes:  ADDENDUM_60C §4 — "ask the owner" is an owner-CONTACT path, gated on ownerContactable()
 *         (a separate, emailable owner), NEVER on managedMode. Self-owned / deferred-self / no-email
 *         hide it, so the "we'll email them in 5 minutes" promise never shows with no owner to email.
 */
import { useEffect } from "react"
import { Info } from "lucide-react"
import { useWizard, ownerContactable, type InsuranceStub } from "../WizardContext"
import { OptionRow } from "../OptionRow"

// ── Option cards ──────────────────────────────────────────────────────────────

const OPTION_CARDS: Array<{ value: InsuranceStub["option"]; label: string; sub: string }> = [
  { value: "now",       label: "Yes — I'll add the basics now",  sub: "Takes about 30 seconds" },
  { value: "ask_owner", label: "No — ask the owner",             sub: "We'll email them a short form to complete" },
  { value: "later",     label: "No — I'll add it later",         sub: "The setup widget will remind you" },
]

// ── Five-field form ───────────────────────────────────────────────────────────

interface FieldProps {
  id:          string
  label:       string
  type?:       string
  placeholder?: string
  value:       string
  onChange:    (v: string) => void
}

function Field({ id, label, type = "text", placeholder, value, onChange }: FieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium block">{label}</label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  )
}

// ── Educational callout ───────────────────────────────────────────────────────

function WhyInsurance() {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Info className="w-4 h-4 text-primary shrink-0" />
        Why add this?
      </div>
      <ul className="space-y-1 pl-6">
        {[
          "Pleks keeps a record of claims alongside your lease and inspection history.",
          "Your broker is notified automatically when a critical incident is logged.",
          "Coverage gaps are flagged as your property details change over time.",
          "You get a renewal reminder before your policy lapses.",
        ].map((bullet) => (
          <li key={bullet} className="text-xs text-muted-foreground flex gap-1.5">
            <span className="mt-0.5 shrink-0 text-primary">•</span>
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── StepInsurance ─────────────────────────────────────────────────────────────

export function StepInsurance() {
  const { state, patch } = useWizard()

  const option  = state.insurance?.option ?? null

  // ADDENDUM_60C §4: "ask the owner" is an owner-contact path — offer it only when there is a
  // separate, emailable owner (ownerContactable), never on managedMode. Hidden for self-owned /
  // deferred-self / owner-without-email.
  const canAskOwner = ownerContactable(state.landlord)
  const cards = canAskOwner
    ? OPTION_CARDS
    : OPTION_CARDS.filter((c) => c.value !== "ask_owner")

  // If "ask the owner" was chosen and then the owner became non-contactable (relationship switched
  // to self, owner email removed, etc.), drop the now-invalid choice so save can't fire an empty
  // owner-email. Fall back to "later" (the safe no-action default).
  useEffect(() => {
    if (state.insurance?.option === "ask_owner" && !canAskOwner) {
      patch({ insurance: { ...state.insurance, option: "later" } })
    }
  }, [canAskOwner, state.insurance, patch])

  // TODO(60A): when the insurance checklist lands, populate its 4 identification
  // items (insurer, policy number, renewal date, replacement value) in "confirmed"
  // state; the rest default to "unknown". Broker is captured separately on the
  // BUILD_59 Insurance tab after property creation — not inlined here.

  function setOption(o: InsuranceStub["option"]) {
    patch({ insurance: { ...state.insurance, option: o } })
  }

  function updateField(field: keyof InsuranceStub, value: string) {
    patch({ insurance: { ...state.insurance, option: option ?? "now", [field]: value || undefined } })
  }

  const stub = state.insurance

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Got the policy details handy?</p>
        <div className="space-y-1.5">
          {cards.map((card) => (
            <OptionRow
              key={card.value}
              selected={option === card.value}
              onSelect={() => setOption(card.value)}
              label={card.label}
              sub={card.sub}
            />
          ))}
        </div>
      </div>

      {option === "now" && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <Field
            id="ins-insurer"
            label="Insurer"
            placeholder="e.g. Santam, OUTsurance, Hollard"
            value={stub?.insurer ?? ""}
            onChange={(v) => updateField("insurer", v)}
          />
          <Field
            id="ins-policy"
            label="Policy number"
            placeholder="POL-0000000"
            value={stub?.policy_number ?? ""}
            onChange={(v) => updateField("policy_number", v)}
          />
          <Field
            id="ins-renewal"
            label="Renewal date"
            type="date"
            value={stub?.renewal_date ?? ""}
            onChange={(v) => updateField("renewal_date", v)}
          />
          <div className="space-y-1">
            <label htmlFor="ins-value" className="text-xs font-medium block">
              Replacement value
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">R</span>
              <input
                id="ins-value"
                type="text"
                inputMode="numeric"
                placeholder="2 500 000"
                // B7: group with spaces (en-ZA) so a missing zero is easy to spot; parse digits→cents.
                value={stub?.replacement_value_cents != null
                  ? Math.round(stub.replacement_value_cents / 100).toLocaleString("en-ZA")
                  : ""}
                onChange={(e) => {
                  const digits = e.target.value.replaceAll(/\D/g, "")
                  patch({
                    insurance: {
                      ...stub,
                      option: "now",
                      replacement_value_cents: digits ? Number(digits) * 100 : undefined,
                    },
                  })
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Broker details are captured on the Insurance tab after creation — that&apos;s where
            the full coverage profile (sums insured per building, warranty tracking, broker
            contact) lives.
          </p>
        </div>
      )}

      {option === "ask_owner" && (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          The owner will receive an email within 5 minutes of saving the property. Their response
          is tracked from the property Overview tab — you can send a reminder or add details
          manually at any time.
        </div>
      )}

      {option === "later" && (
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          The setup widget will flag insurance as outstanding. You can fill it in from the
          Insurance tab whenever you&apos;re ready.
        </div>
      )}

      <WhyInsurance />
    </div>
  )
}
