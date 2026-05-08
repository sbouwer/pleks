/**
 * lib/rules/types.ts — PleksRule type definitions for the autonomous intelligence engine
 *
 * Auth:   Internal — imported by engine, registry, and individual rule files
 * Notes:  Two rule scopes: platform (runs once per cycle) and org (runs per active org).
 *         See BUILD_67_RULES_ENGINE.md for full architecture.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type RuleDomain =
  | "tenant"
  | "lease"
  | "maintenance"
  | "trust"
  | "application"
  | "communication"
  | "compliance"
  | "property"
  | "subscription"
  | "platform"

export type RuleFrequency = "daily" | "weekly" | "monthly"
export type RuleScope     = "org"   | "platform"

export type SubscriptionTier = "owner" | "steward" | "growth" | "portfolio" | "firm" | "bespoke"

export interface OrgRuleContext {
  supabase:  SupabaseClient
  org:       { id: string; name: string; type: string }
  sub:       { tier: SubscriptionTier; status: string } | null
  tier:      SubscriptionTier
  isActive:  boolean           // status is 'active' or 'trialing'
  now:       Date
  log:       (msg: string, data?: unknown) => void
}

export interface PlatformRuleContext {
  supabase:  SupabaseClient
  now:       Date
  log:       (msg: string, data?: unknown) => void
}

export interface RuleActionResult {
  summary:  string
  count?:   number
  data?:    Record<string, unknown>
}

export interface OrgRule {
  id:              string
  domain:          RuleDomain
  description:     string
  scope:           "org"
  frequency:       RuleFrequency
  monthDay?:       number               // 1–28 — only used when frequency = 'monthly'
  tiers?:          SubscriptionTier[]   // if omitted, runs for all tiers
  requiresActive?: boolean              // if true, skips paused/cancelled orgs
  cooldownDays?:   number               // org-level: min days between actioned outcomes
  tags:            string[]

  condition: (ctx: OrgRuleContext) => Promise<boolean> | boolean
  action:    (ctx: OrgRuleContext) => Promise<RuleActionResult>
}

export interface PlatformRule {
  id:          string
  domain:      RuleDomain
  description: string
  scope:       "platform"
  frequency:   RuleFrequency
  tags:        string[]

  condition: (ctx: PlatformRuleContext) => Promise<boolean> | boolean
  action:    (ctx: PlatformRuleContext) => Promise<RuleActionResult>
}

export type PleksRule = OrgRule | PlatformRule
