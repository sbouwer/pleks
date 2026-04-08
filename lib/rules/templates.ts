// lib/rules/templates.ts
// BUILD_44: Rule template types, feature→rule mapping, tier limits

export interface RuleTemplate {
  id: string
  rule_key: string
  title: string
  body_template: string
  category: string
  feature_key: string | null
  default_params: Record<string, string>
  sort_order: number
}

export interface PropertyRule {
  id: string
  property_id: string
  org_id: string
  rule_template_id: string | null
  title: string
  body_text: string
  params: Record<string, string>
  is_custom: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Joined from rule_templates
  template?: Pick<RuleTemplate, "rule_key" | "title" | "body_template" | "category" | "default_params">
}

// Maps unit feature keys → rule_keys that should be suggested
export const FEATURE_RULE_MAP: Record<string, string[]> = {
  "Pool":        ["pool_hours", "pool_no_glass"],
  "Garden":      ["garden_maintenance", "garden_no_alterations"],
  "Pet friendly":["pet_restrictions", "pet_waste"],
  "Alarm":       ["alarm_access"],
  "Braai":       ["braai_usage"],
}

// Returns a deduplicated list of rule_keys suggested by the given feature set
export function getRuleSuggestions(features: string[]): string[] {
  const keys = new Set<string>()
  for (const feature of features) {
    const suggested = FEATURE_RULE_MAP[feature] ?? []
    for (const key of suggested) keys.add(key)
  }
  return Array.from(keys)
}

// AI reformat credit limits per org tier (at property level)
// owner=0 means the feature is disabled for owner-tier orgs
export const TIER_REFORMAT_LIMITS: Record<string, number> = {
  owner:     0,
  steward:   3,
  portfolio: 5,
  firm:      10,
}

// Renders a rule body template by replacing {{tokens}} with param values
export function renderRuleBody(
  bodyTemplate: string,
  params: Record<string, string>,
  defaultParams: Record<string, string> = {}
): string {
  const merged = { ...defaultParams, ...params }
  return bodyTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => merged[key] ?? `{{${key}}}`)
}
