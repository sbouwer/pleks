"use client"

/**
 * components/ui/door-form.tsx — shared "door card" form primitives (underline fields, square cards)
 *
 * Notes:  The design language of the add-party modal (components/parties/partyFields.tsx), extracted as
 *         generic, state-agnostic primitives so other modals (the lease creation flow) render identically
 *         instead of re-deriving the look. Underline inputs (bottom border → amber on focus), tiny uppercase
 *         labels, square --r-button cards, dashed add-buttons. Colour is token-driven (primary = amber).
 */
import { cn } from "@/lib/utils"

/** Underline input class — bottom border only, amber on focus (matches the party modal exactly). */
export function underlineInputCls(err?: boolean): string {
  return cn(
    "w-full border-0 border-b bg-transparent px-0 py-2 text-sm text-foreground placeholder:text-muted-foreground/60",
    "focus:outline-none focus:ring-0 transition-colors",
    err ? "border-destructive focus:border-destructive" : "border-input focus:border-primary",
  )
}

/** Field shell: tiny uppercase label + (optional) required marker + control + error. */
export function Field({
  label, required, error, span, htmlFor, children,
}: Readonly<{ label: string; required?: boolean; error?: string; span?: boolean; htmlFor?: string; children: React.ReactNode }>) {
  return (
    <div className={cn("space-y-1", span && "sm:col-span-2")}>
      <label htmlFor={htmlFor} className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </div>
  )
}

/** Underline text/number input. */
export function UnderlineInput({
  error, className, ...rest
}: Readonly<React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>) {
  return <input className={cn(underlineInputCls(error), className)} {...rest} />
}

export interface SelectOption { value: string; label: string }

/** Underline select (native, appearance-none). */
export function UnderlineSelect({
  value, onChange, options, className, ...rest
}: Readonly<{ value: string; onChange: (v: string) => void; options: ReadonlyArray<SelectOption>; className?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">>) {
  return (
    <select
      className={cn(underlineInputCls(false), "appearance-none", className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Section label — "01 · PERSONAL DETAILS" style rule. */
export function SectLabel({ n, children }: Readonly<{ n?: string; children: React.ReactNode }>) {
  return (
    <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
      {n && <span className="font-mono text-[11px] font-semibold text-primary">{n}</span>}
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{children}</span>
    </div>
  )
}

/** Square muted "door" card used to group a sub-form. */
export function DoorCard({ className, children }: Readonly<{ className?: string; children: React.ReactNode }>) {
  return <div className={cn("rounded-[var(--r-button)] border border-border bg-muted/20 p-3.5", className)}>{children}</div>
}

/** Dashed-border add button (matches the party repeaters). */
export function DashedAddButton({
  onClick, children,
}: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
    </button>
  )
}
