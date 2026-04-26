"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { submitOwnerChecklistResponse } from "./actions"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChecklistItemDef {
  code:        string
  label:       string
  description: string
  help_text?:  string | null
}

type ItemAnswer = "yes" | "no" | "not_sure" | null

// ── Per-item radio group ───────────────────────────────────────────────────────

interface ItemRowProps {
  item:     ChecklistItemDef
  answer:   ItemAnswer
  onChange: (answer: ItemAnswer) => void
}

const OPTIONS: Array<{ value: ItemAnswer; label: string }> = [
  { value: "yes",      label: "Yes — confirmed" },
  { value: "no",       label: "No" },
  { value: "not_sure", label: "Not sure" },
]

function ItemRow({ item, answer, onChange }: Readonly<ItemRowProps>) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-3">
      <div>
        <p className="text-sm font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
        {item.help_text && (
          <p className="text-xs text-muted-foreground/80 mt-1 italic">{item.help_text}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={answer === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs text-center transition-colors",
              answer === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-primary/40",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface ChecklistInfoFormProps {
  token:      string
  requestId:  string
  items:      ChecklistItemDef[]
  agencyName: string
}

export function ChecklistInfoForm({ token, items, agencyName }: Readonly<ChecklistInfoFormProps>) {
  const [answers, setAnswers]       = useState<Record<string, ItemAnswer>>({})
  const [consent, setConsent]       = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [pending, startTransition]  = useTransition()

  function setAnswer(code: string, answer: ItemAnswer) {
    setAnswers((prev) => ({ ...prev, [code]: answer }))
  }

  const allAnswered = items.every((item) => answers[item.code] != null)

  function handleSubmit() {
    if (!consent) {
      setError("Please tick the POPIA consent box before submitting.")
      return
    }
    if (!allAnswered) {
      setError("Please answer all items before submitting.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await submitOwnerChecklistResponse({
        token,
        consentGiven: consent,
        answers: answers as Record<string, "yes" | "no" | "not_sure">,
      })
      if (result.ok) setSubmitted(true)
      else setError(result.error ?? "Submission failed — please try again")
    })
  }

  if (submitted) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center space-y-3">
        <h2 className="font-heading text-xl">Thank you</h2>
        <p className="text-sm text-muted-foreground">
          Your responses have been submitted to {agencyName}. You can close this page now.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Please review the insurance items below and indicate whether each is in place for this property.
        Your answers help {agencyName} verify that the policy is appropriate.
      </p>

      <div className="space-y-3">
        {items.map((item) => (
          <ItemRow
            key={item.code}
            item={item}
            answer={answers[item.code] ?? null}
            onChange={(ans) => setAnswer(item.code, ans)}
          />
        ))}
      </div>

      {/* POPIA consent */}
      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <span className="text-xs text-muted-foreground">
          I consent to {agencyName} recording my responses above for the purpose of verifying
          insurance coverage on this property. I understand my responses will be stored under
          the Protection of Personal Information Act (POPIA).
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={pending || !consent || !allAnswered}
        className="w-full"
      >
        {pending ? "Submitting…" : "Submit responses"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Prefer email? Reply to the email that brought you here — {agencyName} will handle it.
      </p>
    </form>
  )
}
