"use client"

/**
 * app/(dashboard)/properties/new/steps/fields.tsx — shared wizard field primitives (door grammar)
 *
 * Notes:  The same look & feel as the add-party modal (components/parties/partyFields) — mono §-number
 *         section labels, uppercase muted field labels and clean underline inputs — but generic
 *         (value/onChange) so the property-wizard steps can use them instead of the old boxed inputs.
 */
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export function WSection({ n, children }: Readonly<{ n?: string; children: ReactNode }>) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
      {n && <span className="font-mono text-[11px] font-semibold text-primary">{n}</span>}
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{children}</span>
    </div>
  )
}

export const wInputCls = (err?: boolean) =>
  cn(
    "w-full border-0 border-b bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60",
    "focus:outline-none focus:ring-0 transition-colors",
    err ? "border-destructive focus:border-destructive" : "border-input focus:border-primary",
  )

export function WField({
  label, required, error, hint, span, htmlFor, children,
}: Readonly<{
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  span?: boolean
  htmlFor?: string
  children: ReactNode
}>) {
  return (
    <div className={cn("space-y-1", span && "sm:col-span-2")}>
      <label htmlFor={htmlFor} className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  )
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "className"> & {
  value: string
  onChange: (v: string) => void
  error?: boolean
}

export function WInput({ value, onChange, error, ...props }: Readonly<InputProps>) {
  return (
    <input
      {...props}
      className={wInputCls(error)}
      value={value}
      autoComplete={props.autoComplete ?? "off"}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function WSelect({
  value, onChange, options, id,
}: Readonly<{ value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }>; id?: string }>) {
  return (
    <select id={id} className={cn(wInputCls(false), "appearance-none")} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
