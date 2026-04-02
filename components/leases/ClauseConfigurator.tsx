"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Lock, ChevronDown, ChevronUp, Pencil } from "lucide-react"
import { toast } from "sonner"
import { ClauseEditor } from "./ClauseEditor"

interface ClauseItem {
  clause_key: string
  title: string
  body_template: string
  lease_type: string
  is_required: boolean
  is_enabled_by_default: boolean
  depends_on: string[]
  sort_order: number
  description: string | null
  toggle_label: string | null
  enabled?: boolean
  custom_body?: string | null
}

interface ClauseConfiguratorProps {
  leaseType: string
  leaseId?: string | null
  unitId?: string | null
  onSelectionsChange: (selections: Record<string, boolean>) => void
  /** Called only on actual user toggles. Async return signals save success for inline indicator. */
  onToggleSave?: (selections: Record<string, boolean>) => Promise<boolean> | void
}

function applyDependencies(
  key: string,
  enabled: boolean,
  updated: Record<string, boolean>,
  optional: ClauseItem[]
): void {
  if (!enabled) return
  const clause = optional.find((c) => c.clause_key === key)
  if (!clause?.depends_on?.length) return
  for (const dep of clause.depends_on) {
    if (updated[dep]) continue
    updated[dep] = true
    const depClause = optional.find((c) => c.clause_key === dep)
    if (depClause) toast.info(`"${depClause.title}" was also enabled`)
  }
}

async function loadUnitProfile(
  unitId: string,
  leaseType: string
): Promise<{ overrides: Record<string, boolean>; keys: Set<string> }> {
  const res = await fetch(`/api/leases/unit-clause-profile?unitId=${unitId}&leaseType=${leaseType}`)
  if (!res.ok) return { overrides: {}, keys: new Set() }
  const data = await res.json()
  const overrides: Record<string, boolean> = {}
  const keys = new Set<string>()
  for (const c of data.clauses ?? []) {
    if (c.source === "unit_override") {
      overrides[c.clause_key] = c.enabled
      keys.add(c.clause_key)
    }
  }
  return { overrides, keys }
}

function getCardStyle(isOptional: boolean, enabled: boolean) {
  if (!isOptional) return ""
  if (enabled) return "border-l-2 border-l-brand"
  return "opacity-60"
}

export function ClauseConfigurator({
  leaseType,
  leaseId,
  unitId,
  onSelectionsChange,
  onToggleSave,
}: Readonly<ClauseConfiguratorProps>) {
  const [required, setRequired] = useState<ClauseItem[]>([])
  const [optional, setOptional] = useState<ClauseItem[]>([])
  const [selections, setSelections] = useState<Record<string, boolean>>({})
  const [customBodies, setCustomBodies] = useState<Record<string, string | null>>({})
  const [unitSourceKeys, setUnitSourceKeys] = useState<Set<string>>(new Set())
  const [showRequired, setShowRequired] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastToggledKey, setLastToggledKey] = useState<string | null>(null)
  const [toggleSaveStatus, setToggleSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/leases/clause-library?type=${leaseType}`)
      if (!res.ok) return
      const data = await res.json()
      setRequired(data.required ?? [])
      setOptional(data.optional ?? [])
      const initial: Record<string, boolean> = {}
      const bodies: Record<string, string | null> = {}
      for (const c of [...(data.required ?? []), ...(data.optional ?? [])]) {
        if (!c.is_required) {
          initial[c.clause_key] = c.enabled ?? c.is_enabled_by_default
        }
        if (c.custom_body) {
          bodies[c.clause_key] = c.custom_body
        }
      }

      // If unitId provided, overlay unit profile selections
      if (unitId) {
        const { overrides, keys } = await loadUnitProfile(unitId, leaseType)
        Object.assign(initial, overrides)
        setUnitSourceKeys(keys)
      }

      setSelections(initial)
      setCustomBodies(bodies)
      setLoading(false)
    }
    load()
  }, [leaseType, unitId])

  const notifyParent = useCallback((sels: Record<string, boolean>) => {
    onSelectionsChange(sels)
  }, [onSelectionsChange])

  useEffect(() => {
    if (!loading) notifyParent(selections)
  }, [selections, loading, notifyParent])

  async function toggleClause(key: string, enabled: boolean) {
    const updated = { ...selections, [key]: enabled }
    applyDependencies(key, enabled, updated, optional)
    setSelections(updated)
    if (!onToggleSave) return
    setLastToggledKey(key)
    setToggleSaveStatus("saving")
    const result = onToggleSave(updated)
    const ok = result instanceof Promise ? await result : true
    if (ok) {
      setToggleSaveStatus("saved")
      setTimeout(() => { setLastToggledKey(null); setToggleSaveStatus("idle") }, 2000)
    } else {
      setToggleSaveStatus("idle")
      toast.error("Failed to save")
    }
  }

  async function handleSaveBody(clauseKey: string, customBody: string) {
    const res = await fetch("/api/leases/clause-body", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clauseKey, customBody, leaseId: leaseId ?? null }),
    })
    if (res.ok) {
      setCustomBodies((prev) => ({ ...prev, [clauseKey]: customBody }))
      setEditingKey(null)
    }
  }

  async function handleResetBody(clauseKey: string) {
    const res = await fetch("/api/leases/clause-body", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clauseKey, leaseId: leaseId ?? null }),
    })
    if (res.ok) {
      setCustomBodies((prev) => {
        const next = { ...prev }
        delete next[clauseKey]
        return next
      })
      setEditingKey(null)
    }
  }

  const allClauses = [...required, ...optional].sort((a, b) => a.sort_order - b.sort_order)
  const enabledClauses = allClauses.filter((c) => {
    if (c.is_required) return true
    return selections[c.clause_key] ?? false
  })
  const enabledCount = enabledClauses.length

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading clause library...</p>
  }

  function renderClauseCard(clause: ClauseItem, isOptional: boolean) {
    const enabled = clause.is_required || (selections[clause.clause_key] ?? false)
    const hasCustom = !!customBodies[clause.clause_key]
    const isEditing = editingKey === clause.clause_key

    return (
      <Card
        key={clause.clause_key}
        className={`transition-colors ${getCardStyle(isOptional, enabled)}`}
      >
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            {isOptional ? (
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => toggleClause(clause.clause_key, e.target.checked)}
                className="mt-1 accent-brand size-4 shrink-0 cursor-pointer"
              />
            ) : (
              <Lock className="size-4 text-muted-foreground mt-1 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{clause.title}</p>
                {unitSourceKeys.has(clause.clause_key) && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Unit</Badge>
                )}
                {lastToggledKey === clause.clause_key && toggleSaveStatus === "saving" && (
                  <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>
                )}
                {lastToggledKey === clause.clause_key && toggleSaveStatus === "saved" && (
                  <span className="text-[10px] text-green-500">✓ Saved</span>
                )}
                {hasCustom && (
                  <Badge variant="secondary" className="text-brand border-brand/30 text-[10px] px-1.5 py-0">
                    Custom
                  </Badge>
                )}
              </div>
              {clause.toggle_label && (
                <p className="text-xs text-muted-foreground mt-0.5">{clause.toggle_label}</p>
              )}
              {clause.description && (
                <p className="text-xs text-muted-foreground mt-1">{clause.description}</p>
              )}
              {clause.depends_on?.length > 0 && (
                <p className="text-xs text-brand mt-1">
                  Also enables: {clause.depends_on.join(", ")}
                </p>
              )}
              {enabled && !isEditing && (
                <button
                  type="button"
                  onClick={() => setEditingKey(clause.clause_key)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                >
                  <Pencil className="size-3" />
                  Edit wording
                </button>
              )}
            </div>
          </div>

          {isEditing && (
            <ClauseEditor
              clauseKey={clause.clause_key}
              title={clause.title}
              bodyTemplate={clause.body_template}
              customBody={customBodies[clause.clause_key] ?? null}
              isRequired={clause.is_required}
              onSave={handleSaveBody}
              onReset={handleResetBody}
              onCancel={() => setEditingKey(null)}
            />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* LEFT: Configurator */}
      <div className="lg:col-span-3 space-y-4">
        <div>
          <h3 className="font-heading text-lg mb-1">Configure clauses</h3>
          <p className="text-sm text-muted-foreground">
            Required clauses are always included. Optional clauses can be toggled. Click &quot;Edit wording&quot; to customise any clause.
          </p>
        </div>

        {unitId && unitSourceKeys.size > 0 && (
          <div className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand">
            Clauses pre-configured from unit profile — {unitSourceKeys.size} clause{unitSourceKeys.size === 1 ? "" : "s"} pre-set. Marked with a <strong>Unit</strong> badge.
          </div>
        )}

        {/* Required — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowRequired(!showRequired)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRequired ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            Required clauses ({required.length})
          </button>
          {showRequired && (
            <div className="mt-2 space-y-2">
              {required.map((c) => renderClauseCard(c, false))}
            </div>
          )}
        </div>

        {/* Optional clauses */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Optional clauses</p>
          {optional.map((clause) => renderClauseCard(clause, true))}
        </div>

        <p className="text-sm text-muted-foreground">{enabledCount} clauses included</p>
      </div>

      {/* RIGHT: Preview list */}
      <div className="lg:col-span-2">
        <div className="sticky top-20">
          <h3 className="font-heading text-lg mb-1">Clause order preview</h3>
          <p className="text-sm text-muted-foreground mb-3">Numbering updates automatically.</p>
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
            {allClauses.map((clause) => {
              const isEnabled = clause.is_required || (selections[clause.clause_key] ?? false)
              const num = isEnabled
                ? enabledClauses.findIndex((c) => c.clause_key === clause.clause_key) + 1
                : null
              const hasCustom = !!customBodies[clause.clause_key]
              function getColor() {
                if (!isEnabled) return "text-muted-foreground line-through"
                if (clause.is_required) return "text-foreground"
                return "text-brand"
              }
              return (
                <div key={clause.clause_key} className={`text-sm py-1 flex items-center gap-1.5 ${getColor()}`}>
                  <span>{isEnabled ? `${num}. ` : ""}{clause.title}</span>
                  {hasCustom && isEnabled && (
                    <span className="text-[10px] text-brand">(custom)</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
