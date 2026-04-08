"use client"

import { useState } from "react"
import { Sparkles, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface CustomRuleInputProps {
  propertyId: string
  creditsRemaining: number
  tierLimit: number
  onSave: (title: string, bodyText: string, isCustom: boolean) => Promise<void>
  onCancel: () => void
}

export function CustomRuleInput({
  propertyId,
  creditsRemaining,
  tierLimit,
  onSave,
  onCancel,
}: Readonly<CustomRuleInputProps>) {
  const [rawText, setRawText] = useState("")
  const [formattedText, setFormattedText] = useState<string | null>(null)
  const [editingFormatted, setEditingFormatted] = useState(false)
  const [reformatting, setReformatting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showTopUpPrompt, setShowTopUpPrompt] = useState(false)

  const hasCredits = creditsRemaining > 0
  const canReformat = hasCredits                        // anyone with credits can reformat
  const showPurchaseCta = tierLimit === 0 && !hasCredits // owner with no purchased credits

  async function handleReformat() {
    if (!rawText.trim()) {
      toast.error("Enter some text first")
      return
    }
    setReformatting(true)
    const res = await fetch("/api/rules/reformat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, text: rawText }),
    })
    setReformatting(false)

    if (res.status === 402) {
      setShowTopUpPrompt(true)
      return
    }
    if (!res.ok) {
      toast.error("Reformat failed — try again or save as-is")
      return
    }
    const data = await res.json() as { formatted_text: string }
    setFormattedText(data.formatted_text)
    setEditingFormatted(false)
  }

  async function handleSave(useFormatted: boolean) {
    const bodyText = useFormatted && formattedText ? formattedText : rawText.trim()
    if (!bodyText) {
      toast.error("Enter a rule first")
      return
    }
    // Derive a short title from the first sentence
    const title = bodyText.split(/[.!?]/)[0]?.slice(0, 80) ?? bodyText.slice(0, 80)
    setSaving(true)
    await onSave(title, bodyText, useFormatted && !!formattedText)
    setSaving(false)
  }

  if (showTopUpPrompt) {
    return (
      <div className="rounded-lg border border-border/60 bg-surface-elevated px-4 py-4 space-y-3">
        <p className="text-sm font-medium">All reformats used for this property</p>
        <p className="text-xs text-muted-foreground">
          You&apos;ve used all {tierLimit} included reformats. Top up 5 more for R50, or write your rule
          directly — you can always edit the text manually.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { setShowTopUpPrompt(false); setEditingFormatted(false) }}
          >
            Write manually
          </Button>
          <Button type="button" size="sm" disabled className="opacity-50">
            Top up R50 (coming soon)
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/60 bg-surface-elevated px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Add custom rule</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Type your rule in plain language:</p>
        <Textarea
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value)
            setFormattedText(null)
          }}
          placeholder="e.g. tenants must keep the carport clear and not use it for storage"
          rows={3}
          className="resize-none text-sm"
        />
      </div>

      {/* Formatted preview */}
      {formattedText && !editingFormatted && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Reformatted:</p>
          <div className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2.5 text-sm leading-relaxed">
            {formattedText}
          </div>
          <button
            type="button"
            onClick={() => setEditingFormatted(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit this text
          </button>
        </div>
      )}

      {/* Editable formatted text */}
      {formattedText && editingFormatted && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Edit reformatted text:</p>
          <Textarea
            value={formattedText}
            onChange={(e) => setFormattedText(e.target.value)}
            rows={4}
            className="resize-none text-sm"
          />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!formattedText && canReformat && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleReformat}
            disabled={reformatting || !rawText.trim()}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            {reformatting ? "Reformatting..." : `Reformat with AI (${creditsRemaining} left)`}
          </Button>
        )}

        {formattedText ? (
          <Button
            type="button"
            size="sm"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            {saving ? "Saving..." : "Save this rule"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={canReformat ? "ghost" : "default"}
            onClick={() => handleSave(false)}
            disabled={saving || !rawText.trim()}
          >
            {saving ? "Saving..." : "Save as-is"}
          </Button>
        )}
      </div>

      {/* Owner with no credits — purchase CTA */}
      {showPurchaseCta && !formattedText && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-surface-elevated/60 px-3 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <Sparkles className="h-3 w-3 inline mr-1 text-brand/70" />
            Want rules that match your lease&apos;s professional tone? AI reformat: 5 credits for R50.
          </p>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0" disabled>
            Purchase (coming soon)
          </Button>
        </div>
      )}

      {/* Paid tier, credits exhausted */}
      {tierLimit > 0 && !hasCredits && !formattedText && (
        <p className="text-xs text-muted-foreground">
          No reformats remaining. Save your rule as-is and edit the wording manually.
        </p>
      )}
    </div>
  )
}
