"use client"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface SelectOption {
  value: string
  label: string
}

interface FormSelectProps {
  /** Option list */
  options: SelectOption[]
  /** Native form field name — enables FormData submission */
  name?: string
  /** Controlled value */
  value?: string
  /** Uncontrolled default */
  defaultValue?: string
  /** Controlled change handler */
  onValueChange?: (value: string) => void
  required?: boolean
  disabled?: boolean
  /** Applied to the trigger button — use w-full, w-auto etc. */
  className?: string
  placeholder?: string
}

/**
 * Drop-in replacement for native <select> elements.
 * Renders options in a custom styled popup so the app font is used everywhere.
 * Supports both uncontrolled (name + defaultValue, works with FormData) and
 * controlled (value + onValueChange) usage.
 */
export function FormSelect({
  options,
  name,
  value,
  defaultValue,
  onValueChange,
  required,
  disabled,
  className,
  placeholder,
}: FormSelectProps) {
  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (v) => { if (v !== null) onValueChange(v) } : undefined}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
