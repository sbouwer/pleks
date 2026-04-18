"use client"

import { useCallback } from "react"
import { cn } from "@/lib/utils"
import {
  getScenario,
  type ScenarioQuestion,
  type QuestionGroup,
} from "@/lib/properties/scenarios"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWizard } from "../WizardContext"
import { OptionRow } from "../OptionRow"

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
  const opts = question.options ?? []
  // Adaptive grid: 2 → 2 cols, 3 → 3 cols, 4+ → 4 cols (sm) so option lists
  // pack horizontally and the wizard step fits in one viewport.
  let gridClass: string
  if (opts.length === 2) {
    gridClass = "grid grid-cols-2 gap-2"
  } else if (opts.length === 3) {
    gridClass = "grid grid-cols-1 sm:grid-cols-3 gap-2"
  } else {
    gridClass = "grid grid-cols-2 sm:grid-cols-4 gap-2"
  }

  return (
    <div className={gridClass}>
      {opts.map((opt) => (
        <OptionRow
          key={opt.value}
          selected={value === opt.value}
          onSelect={() => onChange(opt.value)}
          label={opt.label}
        />
      ))}
    </div>
  )
}

function SelectQuestion({ question, value, onChange }: QuestionProps) {
  return (
    <Select
      value={typeof value === "string" ? value : ""}
      onValueChange={(v) => onChange(v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {question.options?.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        const n = Number.parseFloat(e.target.value)
        onChange(Number.isNaN(n) ? null : n)
      }}
      className="w-24 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shrink-0"
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
      className="w-48 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm shrink-0"
    />
  )
}

function ToggleQuestion({ question, value, onChange }: QuestionProps) {
  const isYes = value === true
  const isNo  = value === false

  return (
    <div className="inline-flex rounded-md border overflow-hidden shrink-0" role="radiogroup" aria-label={question.label}>
      <button
        type="button"
        role="radio"
        aria-checked={isYes}
        onClick={() => onChange(true)}
        className={cn(
          "px-3 py-1 text-xs font-medium transition-colors min-w-12",
          isYes
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        Yes
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={isNo}
        onClick={() => onChange(false)}
        className={cn(
          "px-3 py-1 text-xs font-medium transition-colors border-l min-w-12",
          isNo
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        No
      </button>
    </div>
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

  // Toggles render inline (label left, Yes/No control right) — saves vertical
  // space and makes scannable boolean lists possible.
  if (question.type === "toggle") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{question.label}</span>
          {question.required && <span className="ml-1 text-destructive text-xs">*</span>}
          {question.helpText && (
            <p className="text-xs text-muted-foreground">{question.helpText}</p>
          )}
        </div>
        <QuestionRenderer
          question={question}
          value={value}
          onChange={(v) => onChange(question.id, v)}
        />
      </div>
    )
  }

  // Number / text inputs are short — render label inline next to input.
  if (question.type === "number" || question.type === "text") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{question.label}</span>
          {question.required && <span className="ml-1 text-destructive text-xs">*</span>}
          {question.helpText && (
            <p className="text-xs text-muted-foreground">{question.helpText}</p>
          )}
        </div>
        <QuestionRenderer
          question={question}
          value={value}
          onChange={(v) => onChange(question.id, v)}
        />
      </div>
    )
  }

  // Radio / select / multiselect — stacked
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
    return <p className="text-sm text-muted-foreground">Please select a property type first.</p>
  }

  // Group questions by purpose, preserving definition order within each group
  const groups = (["unit_details", "property_level", "operational"] as QuestionGroup[]).map(
    (group) => ({
      group,
      questions: scenario.questions.filter((q) => q.group === group),
    }),
  ).filter((g) => g.questions.length > 0)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-muted-foreground text-sm">
          Specific to <strong>{scenario.label}</strong>
          {" — "}these answers shape your lease clauses and inspection profile.
        </p>
      </div>

      {groups.map(({ group, questions }) => (
        <section key={group} className="space-y-2.5">
          {groups.length > 1 && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
