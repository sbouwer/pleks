"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Lock, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"

interface ClauseItem {
  clause_key: string
  title: string
  lease_type: string
  is_required: boolean
  is_enabled_by_default: boolean
  depends_on: string[]
  sort_order: number
  description: string | null
  toggle_label: string | null
  enabled?: boolean
}

interface ClauseConfiguratorProps {
  leaseType: string
  onSelectionsChange: (selections: Record<string, boolean>) => void
}

export function ClauseConfigurator({
  leaseType,
  onSelectionsChange,
}: Readonly<ClauseConfiguratorProps>) {
  const [required, setRequired] = useState<ClauseItem[]>([])
  const [optional, setOptional] = useState<ClauseItem[]>([])
  const [selections, setSelections] = useState<Record<string, boolean>>({})
  const [showRequired, setShowRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/leases/clause-library?type=${leaseType}`)
      if (!res.ok) return
      const data = await res.json()
      setRequired(data.required ?? [])
      setOptional(data.optional ?? [])
      const initial: Record<string, boolean> = {}
      for (const c of data.optional ?? []) {
        initial[c.clause_key] = c.enabled ?? c.is_enabled_by_default
      }
      setSelections(initial)
      setLoading(false)
    }
    load()
  }, [leaseType])

  const notifyParent = useCallback((sels: Record<string, boolean>) => {
    onSelectionsChange(sels)
  }, [onSelectionsChange])

  useEffect(() => {
    if (!loading) notifyParent(selections)
  }, [selections, loading, notifyParent])

  function toggleClause(key: string, enabled: boolean) {
    const updated = { ...selections, [key]: enabled }

    // Handle dependencies: if enabling a clause that depends on another
    if (enabled) {
      const clause = optional.find((c) => c.clause_key === key)
      if (clause?.depends_on?.length) {
        for (const dep of clause.depends_on) {
          if (!updated[dep]) {
            updated[dep] = true
            const depClause = optional.find((c) => c.clause_key === dep)
            if (depClause) {
              toast.info(`"${depClause.title}" was also enabled`)
            }
          }
        }
      }
    }

    setSelections(updated)
  }

  // Build ordered preview list
  const allClauses = [...required, ...optional].sort((a, b) => a.sort_order - b.sort_order)
  const enabledClauses = allClauses.filter((c) => {
    if (c.is_required) return true
    return selections[c.clause_key] ?? false
  })
  const enabledCount = enabledClauses.length

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading clause library...</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* LEFT: Configurator */}
      <div className="lg:col-span-3 space-y-4">
        <div>
          <h3 className="font-heading text-lg mb-1">Configure optional clauses</h3>
          <p className="text-sm text-muted-foreground">
            Required clauses are always included and cannot be removed.
          </p>
        </div>

        {/* Required — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowRequired(!showRequired)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRequired ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            Always included ({required.length} clauses)
          </button>
          {showRequired && (
            <div className="mt-2 space-y-1 pl-6">
              {required.map((c) => (
                <div key={c.clause_key} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="size-3 shrink-0" />
                  <span>{c.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional clauses */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Optional clauses</p>
          {optional.map((clause) => {
            const enabled = selections[clause.clause_key] ?? false
            return (
              <Card
                key={clause.clause_key}
                className={`transition-colors ${enabled ? "border-l-2 border-l-brand" : "opacity-60"}`}
              >
                <CardContent className="py-3 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => toggleClause(clause.clause_key, e.target.checked)}
                    className="mt-1 accent-brand size-4 shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{clause.title}</p>
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
                  </div>
                </CardContent>
              </Card>
            )
          })}
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
              function getClauseColor() {
                if (!isEnabled) return "text-muted-foreground line-through"
                if (clause.is_required) return "text-foreground"
                return "text-brand"
              }
              const colorClass = getClauseColor()
              return (
                <div key={clause.clause_key} className={`text-sm py-1 ${colorClass}`}>
                  {isEnabled ? `${num}. ` : ""}
                  {clause.title}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
