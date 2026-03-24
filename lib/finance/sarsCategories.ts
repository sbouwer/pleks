export const SARS_EXPENSE_CATEGORIES = {
  bond_interest: { sarsSection: "B", label: "Bond interest", deductible: true, isCapital: false },
  rates_taxes: { sarsSection: "B", label: "Rates and municipal taxes", deductible: true, isCapital: false },
  insurance: { sarsSection: "B", label: "Insurance premiums", deductible: true, isCapital: false },
  repairs_maintenance: { sarsSection: "B", label: "Repairs and maintenance", deductible: true, isCapital: false },
  management_fees: { sarsSection: "B", label: "Property management fees", deductible: true, isCapital: false },
  garden_services: { sarsSection: "B", label: "Garden services", deductible: true, isCapital: false },
  security: { sarsSection: "B", label: "Security", deductible: true, isCapital: false },
  levies: { sarsSection: "B", label: "Levies / HOA", deductible: true, isCapital: false },
  advertising: { sarsSection: "B", label: "Advertising", deductible: true, isCapital: false },
  other_allowable: { sarsSection: "B", label: "Other allowable expenses", deductible: true, isCapital: false },
  improvements: { sarsSection: "D", label: "Capital improvements", deductible: false, isCapital: true },
  new_fixtures: { sarsSection: "D", label: "New fixtures/fittings", deductible: false, isCapital: true },
  extensions: { sarsSection: "D", label: "Extensions / additions", deductible: false, isCapital: true },
} as const

export type SARSCategory = keyof typeof SARS_EXPENSE_CATEGORIES

export const PROVISIONAL_TAX_THRESHOLD_CENTS = 3_000_000 // R30,000
