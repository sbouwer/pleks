/**
 * lib/maintenance/categories.ts — single source of truth for maintenance request categories
 *
 * Data:   in-code SSOT. The triage model + validation, the work-order number prefix, and any
 *         category display all derive from MAINTENANCE_CATEGORIES here.
 * Notes:  `code` is the 3-letter token embedded in the work-order number (WO-YYYYMM-<CODE>-NNNNN).
 *         Codes must stay STABLE once live (they appear in historical WO numbers) and unique.
 *         Adding a category = add one row here; the triage list and WO codes update automatically.
 */

export interface MaintenanceCategory {
  /** stored value on maintenance_requests.category (and the triage model's enum). */
  value: string
  /** human label for display. */
  label: string
  /** 3-letter, stable, unique token used in the work-order number. */
  code: string
}

export const MAINTENANCE_CATEGORIES: readonly MaintenanceCategory[] = [
  { value: "electrical",     label: "Electrical",      code: "ELE" },
  { value: "plumbing",       label: "Plumbing",        code: "PLU" },
  { value: "hvac",           label: "HVAC / Air-con",  code: "HVA" },
  { value: "structural",     label: "Structural",      code: "STR" },
  { value: "roofing",        label: "Roofing",         code: "ROO" },
  { value: "windows_doors",  label: "Windows & doors", code: "WND" },
  { value: "appliances",     label: "Appliances",      code: "APP" },
  { value: "garden",         label: "Garden",          code: "GDN" },
  { value: "pest_control",   label: "Pest control",    code: "PST" },
  { value: "painting",       label: "Painting",        code: "PNT" },
  { value: "flooring",       label: "Flooring",        code: "FLR" },
  { value: "security",       label: "Security",        code: "SEC" },
  { value: "access_control", label: "Access control",  code: "ACC" },
  { value: "cleaning",       label: "Cleaning",        code: "CLN" },
  { value: "other",          label: "Other",           code: "OTH" },
] as const

/** All valid category values (for triage validation / enum checks). */
export const MAINTENANCE_CATEGORY_VALUES: readonly string[] = MAINTENANCE_CATEGORIES.map((c) => c.value)

const CODE_BY_VALUE = new Map(MAINTENANCE_CATEGORIES.map((c) => [c.value, c.code]))
const LABEL_BY_VALUE = new Map(MAINTENANCE_CATEGORIES.map((c) => [c.value, c.label]))

/** 3-letter work-order code for a category; falls back to OTHER for unknown values. */
export function workOrderCategoryCode(category: string | null | undefined): string {
  return (category && CODE_BY_VALUE.get(category)) || "OTH"
}

/** Human label for a category; falls back to the raw value. */
export function maintenanceCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Other"
  return LABEL_BY_VALUE.get(category) ?? category
}
