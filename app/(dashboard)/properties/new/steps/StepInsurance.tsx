"use client"

import { cn } from "@/lib/utils"
import { Info } from "lucide-react"
import { useWizard, type InsuranceStub } from "../WizardContext"

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
      <div>
        <h2 className="font-heading text-2xl mb-1">Insurance details</h2>
        <p className="text-muted-foreground text-sm">
          Optional — you can always update this from the Insurance tab.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Got the policy details handy?</p>
        {OPTION_CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            aria-pressed={option === card.value}
            onClick={() => setOption(card.value)}
            className={cn(
              "w-full text-left rounded-lg border px-4 py-3 transition-colors",
              option === card.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="block text-sm font-medium">{card.label}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">{card.sub}</span>
          </button>
        ))}
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
                type="number"
                min={0}
                placeholder="2 500 000"
                value={stub?.replacement_value_cents != null ? stub.replacement_value_cents / 100 : ""}
                onChange={(e) => {
                  const n = Number.parseFloat(e.target.value)
                  patch({
                    insurance: {
                      ...stub,
                      option: "now",
                      replacement_value_cents: Number.isNaN(n) ? undefined : Math.round(n * 100),
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
