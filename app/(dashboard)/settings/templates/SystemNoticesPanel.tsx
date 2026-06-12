"use client"

/**
 * app/(dashboard)/settings/templates/SystemNoticesPanel.tsx — view-only service messages (WhatsApp + auto)
 *
 * Route:  /settings/templates?tab=notices
 * Auth:   reads from the server page; tone persists via setWhatsAppTone (agent write gate)
 * Notes:  BUILD_70 Phase 1. comms_class='service' — sent automatically by Pleks; content NOT editable.
 *         You set the FLAVOUR (friendly/professional/firm) — on WhatsApp that's the org's real sending
 *         tone (setWhatsAppTone). Subtext explains why these are locked. No edit, no star.
 */
import { useState, useMemo, useTransition } from "react"
import { toast } from "sonner"
import { MessageSquare, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { TemplatePreview } from "./TemplatePreview"
import { TONES, type DocumentTemplate, type LetterheadBranding, type ToneId } from "./types"
import { setWhatsAppTone } from "@/lib/actions/templates"

function humanise(cat: string): string {
  return cat.replaceAll("_", " ").replaceAll(/(^|\s)\w/g, (c) => c.toUpperCase())
}

function Segmented<T extends string>({ options, value, onChange, ariaLabel }: Readonly<{
  options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (v: T) => void; ariaLabel: string
}>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={cn("rounded-[var(--r-button)] px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface Props {
  templates: DocumentTemplate[]
  branding: LetterheadBranding
}

export function SystemNoticesPanel({ templates, branding }: Readonly<Props>) {
  const [, startTransition] = useTransition()
  const [selId, setSelId] = useState<string>(() => templates[0]?.id ?? "")
  const [tone, setTone] = useState<ToneId>("professional")
  const [showFields, setShowFields] = useState(true)
  const [fit, setFit] = useState(true)

  const groups = useMemo(() => {
    const map = new Map<string, DocumentTemplate[]>()
    for (const t of templates) {
      const arr = map.get(t.category) ?? []
      arr.push(t); map.set(t.category, arr)
    }
    return [...map.entries()].map(([cat, items]) => ({ cat, items }))
  }, [templates])

  const sel = templates.find((t) => t.id === selId) ?? templates[0]

  function changeTone(t: ToneId) {
    setTone(t)
    if (sel) startTransition(async () => { const r = await setWhatsAppTone(sel.id, t); if (r?.error) toast.error(r.error) })
  }

  if (!sel) {
    return <div className="rounded-[var(--r-button)] border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">No system notices.</div>
  }

  const variants = sel.body_variants && Object.keys(sel.body_variants).length > 0 ? sel.body_variants : null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-border bg-muted/30 px-4 py-3 text-[12.5px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>Sent automatically by Pleks — reminders, confirmations and compliance messages. The wording is standardised so every tenant gets consistent, lawful, on-time messaging; you set the tone and your branding carries through, but the content isn&apos;t edited here.</span>
      </div>

      <div className="grid h-[calc(100vh-17rem)] min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-[268px_minmax(0,1fr)]">
        {/* Rail */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-button)] border border-border bg-card">
          <div className="border-b border-border px-3.5 py-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Service messages</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.map((g) => (
              <div key={g.cat}>
                <div className="px-2 pb-1 pt-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{humanise(g.cat)}</div>
                {g.items.map((it) => {
                  const act = it.id === selId
                  return (
                    <button key={it.id} type="button" onClick={() => setSelId(it.id)}
                      className={cn("relative grid w-full grid-cols-[30px_minmax(0,1fr)] items-center gap-2.5 rounded-[var(--r-button)] px-2 py-2 text-left transition-colors",
                        act ? "bg-primary/10" : "hover:bg-muted/50")}>
                      {act && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />}
                      <span className={cn("grid h-8 w-[30px] place-items-center rounded-[5px] border", act ? "border-primary/40 bg-card text-primary" : "border-border bg-muted/40 text-muted-foreground")}>
                        <MessageSquare className="size-[15px]" />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block truncate text-[12.5px]", act ? "font-semibold text-primary" : "font-medium text-foreground")}>{it.name}</span>
                        <span className="block truncate font-mono text-[9.5px] text-muted-foreground">WhatsApp · automatic</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Stage */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-button)] border border-border bg-card">
          <div className="border-b border-border px-3.5 py-2.5">
            <div className="text-sm font-semibold text-foreground">{sel.name}</div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">Service message · sent automatically · not editable</div>
          </div>

          <TemplatePreview template={sel} branding={branding} tone={tone} showFields={showFields} fit={fit} />

          <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-2.5">
            {variants && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Flavour</span>
                <Segmented options={TONES} value={tone} onChange={changeTone} ariaLabel="Tone flavour" />
                <span className="font-mono text-[9px] text-muted-foreground/70">← the tone you send</span>
              </div>
            )}
            <span className="flex-1" />
            <Segmented ariaLabel="Merge fields" value={showFields ? "on" : "off"} onChange={(v) => setShowFields(v === "on")}
              options={[{ id: "on", label: "Merge fields" }, { id: "off", label: "Filled in" }]} />
            <Segmented ariaLabel="Zoom" value={fit ? "fit" : "full"} onChange={(v) => setFit(v === "fit")}
              options={[{ id: "fit", label: "Fit" }, { id: "full", label: "100%" }]} />
          </div>
        </div>
      </div>
    </div>
  )
}
