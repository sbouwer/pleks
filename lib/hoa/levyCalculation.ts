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

  const results: UnitLevyAmount[] = []
  let validationWarning: string | null = null

  switch (schedule.calculation_method) {
    case "participation_quota": {
      const totalPQ = owners.reduce((s, o) => s + (o.participation_quota ?? 0), 0)
      if (Math.abs(totalPQ - 1.0) > 0.001) {
        validationWarning = `PQ sum = ${(totalPQ * 100).toFixed(4)}% (expected 100%).`
      }
      for (const owner of owners) {
        const pq = owner.participation_quota ?? 0
        results.push({
          owner_id: owner.id, unit_id: owner.unit_id,
          percentage: pq * 100,
          calculated_cents: Math.round(schedule.total_budget_cents * pq),
          basis_pq: pq,
        })
      }
      break
    }

    case "floor_area_m2": {
      const unit = (o: typeof owners[number]) =>
        o.units as unknown as { floor_area_m2: number | null; unit_number: string; status: string } | null

      const eligible = owners.filter((o) => (unit(o)?.floor_area_m2 ?? 0) > 0)
      const totalM2 = eligible.reduce((s, o) => s + (unit(o)?.floor_area_m2 ?? 0), 0)

      if (totalM2 === 0) throw new Error("No floor area data found")

      const missing = owners.filter((o) => !(unit(o)?.floor_area_m2))
      if (missing.length > 0) {
        validationWarning = `${missing.length} unit(s) missing floor area.`
      }

      for (const owner of owners) {
        const m2 = unit(owner)?.floor_area_m2 ?? 0
        const share = totalM2 > 0 ? m2 / totalM2 : 0
        results.push({
          owner_id: owner.id, unit_id: owner.unit_id,
          percentage: share * 100,
          calculated_cents: Math.round(schedule.total_budget_cents * share),
          basis_m2: m2, basis_total_m2: totalM2,
        })
      }
      break
    }

    case "equal_split": {
      const unit = (o: typeof owners[number]) =>
        o.units as unknown as { status: string } | null

      const eligible = schedule.include_vacant_units
        ? owners
        : owners.filter((o) => unit(o)?.status === "occupied")

      const count = eligible.length
      if (count === 0) throw new Error("No eligible units")

      const base = Math.floor(schedule.total_budget_cents / count)
      const remainder = schedule.total_budget_cents - (base * count)

      eligible.forEach((owner, i) => {
        results.push({
          owner_id: owner.id, unit_id: owner.unit_id,
          percentage: 100 / count,
          calculated_cents: i === 0 ? base + remainder : base,
          basis_total_units: count,
        })
      })

      // Vacant units get R0 if not included
      if (!schedule.include_vacant_units) {
        const vacant = owners.filter((o) => unit(o)?.status !== "occupied")
        for (const owner of vacant) {
          results.push({
            owner_id: owner.id, unit_id: owner.unit_id,
            percentage: 0, calculated_cents: 0,
          })
        }
      }
      break
    }

    case "fixed_amount":
    case "percentage_of_budget": {
      // Read pre-set amounts from levy_unit_amounts
      const { data: existing } = await supabase
        .from("levy_unit_amounts")
        .select("unit_id, fixed_cents, percentage")
        .eq("schedule_id", scheduleId)

      const map = new Map((existing ?? []).map((e) => [e.unit_id, e]))

      for (const owner of owners) {
        const preset = map.get(owner.unit_id)
        if (schedule.calculation_method === "fixed_amount") {
          const cents = preset?.fixed_cents ?? 0
          results.push({
            owner_id: owner.id, unit_id: owner.unit_id,
            fixed_cents: cents, calculated_cents: cents,
            percentage: schedule.total_budget_cents > 0 ? (cents / schedule.total_budget_cents) * 100 : 0,
          })
        } else {
          const pct = preset?.percentage ?? 0
          results.push({
            owner_id: owner.id, unit_id: owner.unit_id,
            percentage: pct,
            calculated_cents: Math.round(schedule.total_budget_cents * (pct / 100)),
          })
        }
      }

      // Validate totals
      const total = results.reduce((s, r) => s + r.calculated_cents, 0)
      if (Math.abs(total - schedule.total_budget_cents) > 100) {
        validationWarning = `Amounts total R${(total / 100).toFixed(2)} but budget is R${(schedule.total_budget_cents / 100).toFixed(2)}.`
      }
      break
    }
  }

  // Save to levy_unit_amounts
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

  return {
    results,
    totalCalculated: results.reduce((s, r) => s + r.calculated_cents, 0),
    budgetTarget: schedule.total_budget_cents,
    validationWarning,
    needsValidation: !!validationWarning,
  }
}
