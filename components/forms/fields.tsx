"use client"

/**
 * components/forms/fields.tsx — the canonical form-field grammar (the "add-contact" look)
 *
 * Notes:  THE form-field components for the app — underline inputs, uppercase micro-labels, primary
 *         focus, a 1→2 column FieldGrid, sm:col-span-2 for full-width rows. Matches the add-party /
 *         add-contact modal (components/parties/partyFields), promoted to a neutral home so every form
 *         (settings, modals, detail edits) renders identical fields. Generic (value/onChange) — not
 *         bound to any form-state type. Pair with ActionButton for the save. Build new forms with these,
 *         not ad-hoc <input>/<Label>/<Select>. See the Component Canon in CLAUDE.md.
 */
import * as React from "react"
import { cn } from "@/lib/utils"

export type FieldOption = { value: string; label: string }

const inputCls = (err?: boolean) =>
  cn(
    "w-full border-0 border-b bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60",
    // Dark native popups: color-scheme + explicit <option> colors (Chrome ignores color-scheme for the
    // option list). Dashboard-only controls (always dark). See partyFields.
    "[color-scheme:dark] [&>option]:bg-popover [&>option]:text-popover-foreground",
    "focus:outline-none focus:ring-0 transition-colors",
    err ? "border-destructive focus:border-destructive" : "border-input focus:border-primary",
  )

/** 1-col → 2-col responsive grid for fields. Wrap a field in `span` for a full-width row. */
export function FieldGrid({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <div className={cn("grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2", className)}>{children}</div>
}

/** Field shell — uppercase micro-label, optional required marker + error, optional full-width span. */
export function Field({
  label, required, error, span, children,
}: Readonly<{ label: string; required?: boolean; error?: string; span?: boolean; children: React.ReactNode }>) {
  return (
    <div className={cn("space-y-1", span && "sm:col-span-2")}>
      <label className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  )
}

export function TextField({
  label, value, onChange, required, span, type = "text", placeholder, error, maxLength, autoComplete,
}: Readonly<{
  label: string; value?: string | null; onChange: (v: string) => void
  required?: boolean; span?: boolean; type?: string; placeholder?: string; error?: string; maxLength?: number
  autoComplete?: string
}>) {
  return (
    <Field label={label} required={required} error={error} span={span}>
      <input
        className={inputCls(!!error)}
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

export function SelectField({
  label, value, onChange, options, required, span,
}: Readonly<{
  label: string; value?: string | null; onChange: (v: string) => void
  options: ReadonlyArray<FieldOption>; required?: boolean; span?: boolean
}>) {
  return (
    <Field label={label} required={required} span={span}>
      <select className={cn(inputCls(false), "appearance-none")} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  )
}

export function TextareaField({
  label, value, onChange, rows = 3, placeholder, span = true,
}: Readonly<{
  label: string; value?: string | null; onChange: (v: string) => void
  rows?: number; placeholder?: string; span?: boolean
}>) {
  return (
    <Field label={label} span={span}>
      <textarea
        className={cn(inputCls(false), "resize-none")}
        rows={rows}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}
