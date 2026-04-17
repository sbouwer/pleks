"use client"

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  getScenario,
  type ScenarioQuestion,
  type QuestionGroup,
} from "@/lib/properties/scenarios"
import { useWizard } from "../WizardContext"

// ── Group labels ──────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<QuestionGroup, string> = {
  unit_details:   "Unit details",
  property_level: "Property details",
  operational:    "Operational",
}

// ── Individual question renderers ─────────────────────────────────────────────

interface QuestionProps {
  question: ScenarioQuestion
  value:    unknown
  onChange: (v: unknown) => void
}

function RadioQuestion({ question, value, onChange }: QuestionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {question.options?.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
            value === opt.value
              ? "border-primary bg-primary/5 ring-1 ring-primary"
              : "border-border hover:border-primary/40",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SelectQuestion({ question, value, onChange }: QuestionProps) {
  return (
    <select
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">Select…</option>
      {question.options?.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

function NumberQuestion({ question, value, onChange }: QuestionProps) {
  return (
    <input
      type="number"
      min={question.min ?? 0}
      max={question.max}
      placeholder={question.placeholder}
      value={typeof value === "number" ? value : ""}
      onChange={(e) => {
        const n = parseFloat(e.target.value)
        onChange(isNaN(n) ? null : n)
      }}
      className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  )
}

function TextQuestion({ question, value, onChange }: QuestionProps) {
  return (
    <input
      type="text"
      placeholder={question.placeholder}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    />
  )
}

function ToggleQuestion({ question, value, onChange }: QuestionProps) {
  const checked = value === true
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
      <span className="sr-only">{question.label}</span>
    </button>
  )
}

function MultiselectQuestion({ question, value, onChange }: QuestionProps) {
  const current = Array.isArray(value) ? (value as string[]) : []

  function toggle(val: string) {
    const next = current.includes(val)
      ? current.filter((v) => v !== val)
      : [...current, val]
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {question.options?.map((opt) => {
        const selected = current.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(opt.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/40 text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function QuestionRenderer({ question, value, onChange }: QuestionProps) {
  switch (question.type) {
    case "radio":       return <RadioQuestion       question={question} value={value} onChange={onChange} />
    case "select":      return <SelectQuestion      question={question} value={value} onChange={onChange} />
    case "number":      return <NumberQuestion      question={question} value={value} onChange={onChange} />
    case "text":        return <TextQuestion        question={question} value={value} onChange={onChange} />
    case "toggle":      return <ToggleQuestion      question={question} value={value} onChange={onChange} />
    case "multiselect": return <MultiselectQuestion question={question} value={value} onChange={onChange} />
  }
}

// ── Question row ──────────────────────────────────────────────────────────────

interface QuestionRowProps {
  question: ScenarioQuestion
  answers:  Record<string, unknown>
  onChange: (id: string, v: unknown) => void
}

function QuestionRow({ question, answers, onChange }: QuestionRowProps) {
  // Evaluate showWhen gate
  if (question.showWhen) {
    const gatingValue = answers[question.showWhen.questionId]
    if (gatingValue !== question.showWhen.value) return null
  }

  const value = answers[question.id] ?? null

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-medium">{question.label}</span>
        {question.required && <span className="text-destructive text-xs">*</span>}
      </div>
      {question.helpText && (
        <p className="text-xs text-muted-foreground">{question.helpText}</p>
      )}
      <QuestionRenderer
        question={question}
        value={value}
        onChange={(v) => onChange(question.id, v)}
      />
    </div>
  )
}

// ── StepScenarioFollowUp ──────────────────────────────────────────────────────

export function StepScenarioFollowUp() {
  const { state, patch } = useWizard()

  const scenario = state.scenarioType ? getScenario(state.scenarioType) : null

  const handleChange = useCallback(
    (id: string, value: unknown) => {
      patch({ scenarioAnswers: { ...state.scenarioAnswers, [id]: value } })
    },
    [patch, state.scenarioAnswers],
  )

  if (!scenario) {
    return (
      <div className="space-y-2">
        <h2 className="font-heading text-2xl">Property details</h2>
        <p className="text-muted-foreground text-sm">Please select a property type first.</p>
      </div>
    )
  }

  // Group questions by purpose, preserving definition order within each group
  const groups = (["unit_details", "property_level", "operational"] as QuestionGroup[]).map(
    (group) => ({
      group,
      questions: scenario.questions.filter((q) => q.group === group),
    }),
  ).filter((g) => g.questions.length > 0)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-heading text-2xl mb-1">A bit more about your property</h2>
        <p className="text-muted-foreground text-sm">
          Specific to <strong>{scenario.label}</strong>
          {" — "}these answers shape your lease clauses and inspection profile.
        </p>
      </div>

      {groups.map(({ group, questions }) => (
        <section key={group} className="space-y-5">
          {groups.length > 1 && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              {GROUP_LABELS[group]}
            </h3>
          )}
          {questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              answers={state.scenarioAnswers}
              onChange={handleChange}
            />
          ))}
        </section>
      ))}
    </div>
  )
}
