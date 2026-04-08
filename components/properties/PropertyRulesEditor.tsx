"use client"

import { useState, useEffect } from "react"
import { Plus, GripVertical, Pencil, Trash2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { RuleTemplateToggle } from "./RuleTemplateToggle"
import { CustomRuleInput } from "./CustomRuleInput"
import { HoaRulesUpload } from "./HoaRulesUpload"
import { renderRuleBody, getRuleSuggestions } from "@/lib/rules/templates"
import type { RuleTemplate, PropertyRule } from "@/lib/rules/templates"

interface Credits {
  used: number
  total: number
  remaining: number
  tier_limit: number
}

interface Props {
  propertyId: string
  isSectionalTitle: boolean
  managingSchemeId?: string | null
}

export function PropertyRulesEditor({
  propertyId,
  isSectionalTitle,
  managingSchemeId,
}: Readonly<Props>) {
  const [templates, setTemplates] = useState<RuleTemplate[]>([])
  const [rules, setRules] = useState<PropertyRule[]>([])
  const [credits, setCredits] = useState<Credits>({ used: 0, total: 0, remaining: 0, tier_limit: 0 })
  const [initialLoading, setInitialLoading] = useState(true)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [saving, setSaving] = useState(false)

  // Unit features collected across the property (fetched lazily for suggestions)
  const [propertyFeatures, setPropertyFeatures] = useState<string[]>([])
  const [suggestionsAcknowledged, setSuggestionsAcknowledged] = useState(false)

  async function load() {
    // Only show full skeleton on first load — subsequent refreshes update data in place
    // so the page height stays stable and scroll position is preserved.
    const res = await fetch(`/api/properties/${propertyId}/rules`)
    if (res.ok) {
      const data = await res.json() as { rules: PropertyRule[]; templates: RuleTemplate[]; credits: Credits }
      setRules(data.rules)
      setTemplates(data.templates)
      setCredits(data.credits)
    }
    setInitialLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [propertyId])

  // Fetch property features for suggestions (non-blocking)
  useEffect(() => {
    fetch(`/api/properties/${propertyId}/unit-features`)
      .then((r) => r.ok ? r.json() : null)
      .then((d: { features: string[] } | null) => {
        if (d?.features) setPropertyFeatures(d.features)
      })
      .catch(() => { /* non-critical */ })
  }, [propertyId])

  // ── Handlers ────────────────────────────────────────────────

  async function handleEnableTemplate(template: RuleTemplate, params: Record<string, string>) {
    const bodyText = renderRuleBody(template.body_template, params, template.default_params)
    const res = await fetch(`/api/properties/${propertyId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rule_template_id: template.id,
        title: template.title,
        body_text: bodyText,
        params,
        is_custom: false,
      }),
    })
    if (res.ok) {
      await load()
      toast.success(`"${template.title}" added`)
    } else {
      toast.error("Could not add rule")
    }
  }

  async function handleDisableTemplate(ruleId: string) {
    const res = await fetch(`/api/properties/${propertyId}/rules/${ruleId}`, { method: "DELETE" })
    if (res.ok) {
      await load()
    } else {
      toast.error("Could not remove rule")
    }
  }

  async function handleUpdateTemplateParams(
    ruleId: string,
    params: Record<string, string>,
    bodyText: string
  ) {
    const res = await fetch(`/api/properties/${propertyId}/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params, body_text: bodyText }),
    })
    if (res.ok) {
      await load()
      toast.success("Rule updated")
    } else {
      toast.error("Could not update rule")
    }
  }

  async function handleSaveCustom(title: string, bodyText: string, isCustom: boolean) {
    const res = await fetch(`/api/properties/${propertyId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body_text: bodyText, is_custom: isCustom, sort_order: 200 }),
    })
    if (res.ok) {
      await load()
      setShowAddCustom(false)
      toast.success("Rule added")
    } else {
      toast.error("Could not save rule")
    }
  }

  async function handleDeleteCustom(ruleId: string) {
    const res = await fetch(`/api/properties/${propertyId}/rules/${ruleId}`, { method: "DELETE" })
    if (res.ok) {
      await load()
      toast.success("Rule removed")
    } else {
      toast.error("Could not remove rule")
    }
  }

  async function handleSaveEdit(ruleId: string) {
    if (!editingText.trim()) return
    setSaving(true)
    const title = editingText.split(/[.!?]/)[0]?.slice(0, 80) ?? editingText.slice(0, 80)
    const res = await fetch(`/api/properties/${propertyId}/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body_text: editingText }),
    })
    setSaving(false)
    if (res.ok) {
      await load()
      setEditingRuleId(null)
      setEditingText("")
    } else {
      toast.error("Could not update rule")
    }
  }

  async function handleAddSuggestions(ruleKeys: string[]) {
    const toAdd = templates.filter(
      (t) => ruleKeys.includes(t.rule_key) && !rules.some((r) => r.rule_template_id === t.id)
    )
    for (const t of toAdd) {
      await handleEnableTemplate(t, t.default_params)
    }
    setSuggestionsAcknowledged(true)
  }

  // ── Groupings ────────────────────────────────────────────────

  const templateRuleIds = new Set(rules.map((r) => r.rule_template_id).filter(Boolean))
  const customRules = rules.filter((r) => r.is_custom || !r.rule_template_id)

  const suggestedKeys = getRuleSuggestions(propertyFeatures)
  const unaddedSuggestedKeys = suggestedKeys.filter(
    (key) => !rules.some((r) => {
      const tmpl = templates.find((t) => t.id === r.rule_template_id)
      return tmpl?.rule_key === key
    })
  )
  const showSuggestions =
    !suggestionsAcknowledged &&
    unaddedSuggestedKeys.length > 0 &&
    propertyFeatures.length > 0

  // Group templates by category
  const categories = Array.from(new Set(templates.map((t) => t.category)))

  if (initialLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-6 text-sm text-muted-foreground">
        Loading rules...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ─── Feature suggestions banner ───────────────── */}
      {showSuggestions && (
        <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Suggested rules for this property</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on unit features: {unaddedSuggestedKeys
                .map((k) => templates.find((t) => t.rule_key === k)?.title)
                .filter(Boolean)
                .join(", ")
              }
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => handleAddSuggestions(unaddedSuggestedKeys)}
            >
              Add suggested
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSuggestionsAcknowledged(true)}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      {/* ─── Library rules by category ────────────────── */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
          Library rules
        </p>

        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="text-xs font-medium text-muted-foreground mb-2">{category}</p>
              <div className="space-y-1.5">
                {templates
                  .filter((t) => t.category === category)
                  .map((template) => {
                    const activeRule = rules.find((r) => r.rule_template_id === template.id)
                    return (
                      <RuleTemplateToggle
                        key={template.id}
                        template={template}
                        activeRule={activeRule}
                        onEnable={handleEnableTemplate}
                        onDisable={handleDisableTemplate}
                        onUpdate={handleUpdateTemplateParams}
                      />
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Custom rules ─────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Custom rules
          </p>
          {!showAddCustom && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowAddCustom(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add custom rule
            </Button>
          )}
        </div>

        {customRules.length === 0 && !showAddCustom && (
          <p className="text-sm text-muted-foreground">
            No custom rules yet. Add rules specific to this property that aren&apos;t in the library.
          </p>
        )}

        {customRules.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {customRules.map((rule) => (
              <div
                key={rule.id}
                className="group flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2.5"
              >
                <GripVertical className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40 cursor-grab" />
                <div className="flex-1 min-w-0">
                  {editingRuleId === rule.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        className="resize-none text-sm"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleSaveEdit(rule.id)}
                          disabled={saving}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          {saving ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => { setEditingRuleId(null); setEditingText("") }}
                          disabled={saving}
                        >
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{rule.body_text}</p>
                  )}
                </div>
                {editingRuleId !== rule.id && (
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => { setEditingRuleId(rule.id); setEditingText(rule.body_text) }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
                      aria-label="Edit rule"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustom(rule.id)}
                      className="p-1 rounded text-muted-foreground hover:text-danger transition-colors"
                      aria-label="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddCustom && (
          <CustomRuleInput
            propertyId={propertyId}
            creditsRemaining={credits.remaining}
            tierLimit={credits.tier_limit}
            onSave={handleSaveCustom}
            onCancel={() => setShowAddCustom(false)}
          />
        )}

        {credits.tier_limit > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            AI reformat: {credits.remaining} of {credits.total} credits remaining for this property.
          </p>
        )}
      </div>

      {/* ─── HOA conduct rules (sectional title only) ── */}
      {isSectionalTitle && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Body corporate conduct rules
          </p>
          <p className="text-sm text-muted-foreground">
            Upload the body corporate&apos;s conduct rules document. This will be attached as a
            separate annexure in every lease for units in this property.
          </p>
          <HoaRulesUpload
            managingSchemeId={managingSchemeId ?? null}
            existingPath={null}
            existingUploadedAt={null}
          />
        </div>
      )}

      {/* ─── Template library count not visible = nothing selected note */}
      {templateRuleIds.size === 0 && customRules.length === 0 && !showAddCustom && (
        <p className="text-xs text-muted-foreground">
          No rules selected. Rules appear as Annexure C in leases for units in this property.
        </p>
      )}
    </div>
  )
}
