"use server"

import { createClient } from "@/lib/supabase/server"

export interface UnitLevyAmount {
  owner_id: string
  unit_id: string
  percentage?: number
  fixed_cents?: number
  calculated_cents: number
  basis_pq?: number
  basis_m2?: number
  basis_total_m2?: number
  basis_total_units?: number
}

export interface LevyCalculationResult {
  results: UnitLevyAmount[]
  totalCalculated: number
  budgetTarget: number
  validationWarning: string | null
  needsValidation: boolean
}

type Owner = { id: string; unit_id: string; participation_quota: number | null; units: unknown }

function getOwnerUnit(o: Owner) {
  return o.units as { floor_area_m2: number | null; unit_number: string; status: string } | null
}

function calcByParticipationQuota(owners: Owner[], budgetCents: number): { results: UnitLevyAmount[]; warning: string | null } {
  const totalPQ = owners.reduce((s, o) => s + (o.participation_quota ?? 0), 0)
  const warning = Math.abs(totalPQ - 1) > 0.001
    ? `PQ sum = ${(totalPQ * 100).toFixed(4)}% (expected 100%).`
    : null
  const results = owners.map((owner) => {
    const pq = owner.participation_quota ?? 0
    return { owner_id: owner.id, unit_id: owner.unit_id, percentage: pq * 100, calculated_cents: Math.round(budgetCents * pq), basis_pq: pq }
  })
  return { results, warning }
}

function calcByFloorArea(owners: Owner[], budgetCents: number): { results: UnitLevyAmount[]; warning: string | null } {
  const eligible = owners.filter((o) => (getOwnerUnit(o)?.floor_area_m2 ?? 0) > 0)
  const totalM2 = eligible.reduce((s, o) => s + (getOwnerUnit(o)?.floor_area_m2 ?? 0), 0)
  if (totalM2 === 0) throw new Error("No floor area data found")
  const missing = owners.filter((o) => !(getOwnerUnit(o)?.floor_area_m2))
  const warning = missing.length > 0 ? `${missing.length} unit(s) missing floor area.` : null
  const results = owners.map((owner) => {
    const m2 = getOwnerUnit(owner)?.floor_area_m2 ?? 0
    const share = totalM2 > 0 ? m2 / totalM2 : 0
    return { owner_id: owner.id, unit_id: owner.unit_id, percentage: share * 100, calculated_cents: Math.round(budgetCents * share), basis_m2: m2, basis_total_m2: totalM2 }
  })
  return { results, warning }
}

function calcByEqualSplit(owners: Owner[], budgetCents: number, includeVacant: boolean): { results: UnitLevyAmount[]; warning: string | null } {
  const eligible = includeVacant
    ? owners
    : owners.filter((o) => getOwnerUnit(o)?.status === "occupied")
  const count = eligible.length
  if (count === 0) throw new Error("No eligible units")
  const base = Math.floor(budgetCents / count)
  const remainder = budgetCents - base * count
  const results: UnitLevyAmount[] = eligible.map((owner, i) => ({
    owner_id: owner.id, unit_id: owner.unit_id,
    percentage: 100 / count,
    calculated_cents: i === 0 ? base + remainder : base,
    basis_total_units: count,
  }))
  // Vacant units get R0 if not included
  if (!includeVacant) {
    const vacant = owners.filter((o) => getOwnerUnit(o)?.status !== "occupied")
    for (const owner of vacant) {
      results.push({ owner_id: owner.id, unit_id: owner.unit_id, percentage: 0, calculated_cents: 0 })
    }
  }
  return { results, warning: null }
}

function calcByPresetAmounts(
  owners: Owner[],
  budgetCents: number,
  method: "fixed_amount" | "percentage_of_budget",
  presetMap: Map<string, { fixed_cents: number | null; percentage: number | null }>
): { results: UnitLevyAmount[]; warning: string | null } {
  const results: UnitLevyAmount[] = owners.map((owner) => {
    const preset = presetMap.get(owner.unit_id)
    if (method === "fixed_amount") {
      const cents = preset?.fixed_cents ?? 0
      return { owner_id: owner.id, unit_id: owner.unit_id, fixed_cents: cents, calculated_cents: cents, percentage: budgetCents > 0 ? (cents / budgetCents) * 100 : 0 }
    }
    const pct = preset?.percentage ?? 0
    return { owner_id: owner.id, unit_id: owner.unit_id, percentage: pct, calculated_cents: Math.round(budgetCents * (pct / 100)) }
  })
  const total = results.reduce((s, r) => s + r.calculated_cents, 0)
  const warning = Math.abs(total - budgetCents) > 100
    ? `Amounts total R${(total / 100).toFixed(2)} but budget is R${(budgetCents / 100).toFixed(2)}.`
    : null
  return { results, warning }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function resolveCalculationMethod(
  supabase: SupabaseClient,
  schedule: { calculation_method: string; total_budget_cents: number; include_vacant_units: boolean },
  scheduleId: string,
  owners: Owner[]
): Promise<{ results: UnitLevyAmount[]; warning: string | null }> {
  switch (schedule.calculation_method) {
    case "participation_quota":
      return calcByParticipationQuota(owners, schedule.total_budget_cents)
    case "floor_area_m2":
      return calcByFloorArea(owners, schedule.total_budget_cents)
    case "equal_split":
      return calcByEqualSplit(owners, schedule.total_budget_cents, schedule.include_vacant_units)
    case "fixed_amount":
    case "percentage_of_budget": {
      const { data: existing } = await supabase
        .from("levy_unit_amounts")
        .select("unit_id, fixed_cents, percentage")
        .eq("schedule_id", scheduleId)
      const presetMap = new Map((existing ?? []).map((e) => [e.unit_id, e]))
      const method: "fixed_amount" | "percentage_of_budget" = schedule.calculation_method === "fixed_amount" ? "fixed_amount" : "percentage_of_budget"
      return calcByPresetAmounts(owners, schedule.total_budget_cents, method, presetMap)
    }
    default:
      return { results: [], warning: null }
  }
}

async function saveLevyUnitAmounts(
  supabase: SupabaseClient,
  results: UnitLevyAmount[],
  schedule: { org_id: string; hoa_id: string },
  scheduleId: string,
  validationWarning: string | null
): Promise<void> {
  for (const result of results) {
    await supabase.from("levy_unit_amounts").upsert({
      org_id: schedule.org_id,
      schedule_id: scheduleId,
      hoa_id: schedule.hoa_id,
      unit_id: result.unit_id,
      owner_id: result.owner_id,
      percentage: result.percentage ?? null,
      fixed_cents: result.fixed_cents ?? null,
      calculated_cents: result.calculated_cents,
      basis_pq: result.basis_pq ?? null,
      basis_m2: result.basis_m2 ?? null,
      basis_total_m2: result.basis_total_m2 ?? null,
      basis_total_units: result.basis_total_units ?? null,
      is_validated: false,
      validation_warning: validationWarning,
    }, { onConflict: "schedule_id,unit_id" })
  }
}

export async function calculateLevyAmounts(
  scheduleId: string
): Promise<LevyCalculationResult> {
  const supabase = await createClient()

  const { data: schedule } = await supabase
    .from("levy_schedules")
    .select("*")
    .eq("id", scheduleId)
    .single()

  if (!schedule) throw new Error("Schedule not found")

  const { data: owners } = await supabase
    .from("hoa_unit_owners")
    .select("id, unit_id, participation_quota, units(floor_area_m2, unit_number, status)")
    .eq("hoa_id", schedule.hoa_id)
    .eq("is_active", true)
    .is("owned_until", null)

  if (!owners?.length) throw new Error("No active owners found")

  const { results, warning: validationWarning } = await resolveCalculationMethod(
    supabase, schedule, scheduleId, owners as Owner[]
  )

  await saveLevyUnitAmounts(supabase, results, schedule, scheduleId, validationWarning)

  return {
    results,
    totalCalculated: results.reduce((s, r) => s + r.calculated_cents, 0),
    budgetTarget: schedule.total_budget_cents,
    validationWarning,
    needsValidation: !!validationWarning,
  }
}
