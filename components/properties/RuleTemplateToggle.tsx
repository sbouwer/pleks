"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { renderRuleBody } from "@/lib/rules/templates"
import type { RuleTemplate, PropertyRule } from "@/lib/rules/templates"

interface RuleTemplateToggleProps {
  template: RuleTemplate
  activeRule: PropertyRule | undefined
  onEnable: (template: RuleTemplate, params: Record<string, string>) => Promise<void>
  onDisable: (ruleId: string) => Promise<void>
  onUpdate: (ruleId: string, params: Record<string, string>, bodyText: string) => Promise<void>
}

export function RuleTemplateToggle({
  template,
  activeRule,
  onEnable,
  onDisable,
  onUpdate,
}: Readonly<RuleTemplateToggleProps>) {
  const isEnabled = !!activeRule
  const [expanded, setExpanded] = useState(false)
  const [params, setParams] = useState<Record<string, string>>(
    activeRule?.params ?? template.default_params
  )
  const [saving, setSaving] = useState(false)

  const paramKeys = Object.keys(template.default_params)
  const hasParams = paramKeys.length > 0

  const previewText = renderRuleBody(template.body_template, params, template.default_params)

  async function handleToggle() {
    setSaving(true)
    if (isEnabled) {
      await onDisable(activeRule!.id)
    } else {
      await onEnable(template, params)
    }
    setSaving(false)
  }

  async function handleSaveParams() {
    if (!activeRule) return
    setSaving(true)
    const bodyText = renderRuleBody(template.body_template, params, template.default_params)
    await onUpdate(activeRule.id, params, bodyText)
    setSaving(false)
    setExpanded(false)
  }

  return (
    <div className={`rounded-lg border transition-colors ${isEnabled ? "border-brand/30 bg-brand/5" : "border-border/50 bg-transparent hover:bg-surface-elevated/60"}`}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          onClick={handleToggle}
          disabled={saving}
          className={`relative mt-0.5 inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${isEnabled ? "bg-brand" : "bg-muted"}`}
        >
          <span
            className={`pointer-events-none block size-3 rounded-full bg-white shadow transition-transform ${isEnabled ? "translate-x-3" : "translate-x-0"}`}
          />
        </button>

        {/* Title + preview — clicking label also toggles */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleToggle}
              disabled={saving}
              className={`text-sm font-medium text-left cursor-pointer disabled:opacity-50 ${isEnabled ? "" : "text-muted-foreground"}`}
            >
              {template.title}
            </button>
            {isEnabled && hasParams && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                Edit
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
          {isEnabled && !expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{previewText}</p>
          )}
        </div>
      </div>

      {/* Param editor — only shown when expanded */}
      {isEnabled && expanded && (
        <div className="px-3 pb-3 border-t border-border/30 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {paramKeys.map((key) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs capitalize">{key.replace(/_/g, " ")}</Label>
                <Input
                  value={params[key] ?? template.default_params[key] ?? ""}
                  onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                  className="h-7 text-xs"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{previewText}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSaveParams} disabled={saving}>
              <Check className="h-3 w-3 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setExpanded(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
