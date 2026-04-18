"use client"

import { Check, Circle } from "lucide-react"
import { useWizard } from "../WizardContext"
import { getScenario } from "@/lib/properties/scenarios"

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  done:    boolean
  label:   string
  detail?: string
}

function Row({ done, label, detail }: RowProps) {
  return (
    <li className="flex items-start gap-3 py-2">
      {done
        ? <Check  className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        : <Circle className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/40" />}
      <div className="flex-1 min-w-0">
        <p className={done ? "text-sm" : "text-sm text-muted-foreground"}>{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </li>
  )
}

// ── StepSummary ───────────────────────────────────────────────────────────────

export function StepSummary() {
  const { state } = useWizard()

  const scenario = state.scenarioType ? getScenario(state.scenarioType) : null
  const propertyName = state.address?.property_name ?? "this property"

  const insuranceLabel = (() => {
    if (!state.insurance) return "Insurance — not yet captured"
    if (state.insurance.option === "now") return "Insurance — basics added"
    if (state.insurance.option === "ask_owner") return "Insurance — owner will be emailed"
    return "Insurance — flagged for later"
  })()

  const landlordLabel = (() => {
    if (state.managedMode === "self_owned") return "Owner — you"
    if (!state.landlord) return "Owner — not set"
    if (state.landlord.option === "existing") return "Owner — existing contact selected"
    if (state.landlord.option === "new") {
      const name = state.landlord.company_name
        ?? [state.landlord.first_name, state.landlord.last_name].filter(Boolean).join(" ")
      return `Owner — ${name || "new contact"}`
    }
    return state.landlord.later_track === "owner_email"
      ? "Owner — will be emailed when you save"
      : "Owner — flagged for later"
  })()

  const items: Array<RowProps> = [
    {
      done:   !!state.address,
      label:  state.address ? `Address: ${state.address.formatted}` : "Address",
    },
    {
      done:   !!state.scenarioType,
      label:  scenario ? `Scenario: ${scenario.label}` : "Scenario",
      detail: state.unitCount > 1 ? `${state.unitCount} units` : undefined,
    },
    {
      done:   !!state.universals,
      label:  "Property details (WiFi, signal, backup power, scheme)",
    },
    {
      done:   state.managedMode === "self_owned" || state.landlord?.option === "existing" || state.landlord?.option === "new",
      label:  landlordLabel,
    },
    {
      done:   state.units.length > 0,
      label:  `${state.units.length} unit${state.units.length === 1 ? "" : "s"} configured`,
    },
    {
      done:   state.insurance?.option === "now",
      label:  insuranceLabel,
    },
    {
      done:   state.pendingDocuments.length > 0,
      label:  state.pendingDocuments.length > 0
                ? `${state.pendingDocuments.length} document(s) attached`
                : "Compliance documents — none uploaded",
    },
  ]

  const completedCount = items.filter((i) => i.done).length
  const pct            = Math.round((completedCount / items.length) * 100)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl mb-1">Ready to create {propertyName}</h2>
        <p className="text-muted-foreground text-sm">
          Setup: <strong>{pct}% complete</strong>. We&apos;ll remind you about open items in 7 days &mdash; you can
          always come back to the property page.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <ul className="divide-y divide-border/50">
          {items.map((item, i) => (
            <Row key={i} {...item} />
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Click <strong>Save property</strong> below to create everything. Document uploads start at save
        time and may take a moment.
      </p>
    </div>
  )
}
