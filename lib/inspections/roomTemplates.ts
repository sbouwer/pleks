/**
 * lib/inspections/roomTemplates.ts — static residential/commercial ITEM templates and condition options for inspections
 *
 * Notes:  Legacy flat fallback template set (used when a unit has no profile/unit_type); the richer path is templateEngine.
 *         The ROOM half of that fallback is gone as of 2026-08-21: two module-local arrays
 *         (RESIDENTIAL_ROOMS, 16 areas; COMMERCIAL_ROOMS, 12) and the two accessors that were their
 *         only door — getRoomTemplate(leaseType) and getItemsForRoom(leaseType, roomType) — had no
 *         callers anywhere, and the arrays were never exported, so nothing outside could reach them.
 *         The ITEM tables below ARE exported and still imported; they stay.
 */
export const RESIDENTIAL_ITEMS: Record<string, string[]> = {
  default: ["Walls", "Ceiling", "Floor", "Windows", "Doors", "Light fittings", "Power points"],
  bedroom: ["Walls", "Ceiling", "Floor / Carpet", "Windows", "Window blinds", "Curtain rails", "Doors", "Door handles", "Built-in cupboards", "Light fittings", "Power points"],
  kitchen: ["Walls", "Ceiling", "Floor", "Windows", "Doors", "Cupboards", "Countertops", "Sink", "Taps", "Stove / Hob", "Oven", "Extractor fan", "Light fittings", "Power points"],
  bathroom: ["Walls / Tiles", "Ceiling", "Floor / Tiles", "Bath / Shower", "Shower door", "Basin", "Taps", "Toilet", "Mirror", "Towel rails", "Cabinet", "Extractor fan", "Light fittings"],
  garden: ["Lawn condition", "Garden beds", "Trees / Shrubs", "Irrigation", "Fencing", "Gate", "Paving", "Pool (if applicable)"],
}

export const COMMERCIAL_ITEMS: Record<string, string[]> = {
  default: ["Walls / Partitions", "Ceiling", "Floor", "Windows", "Doors", "Lighting", "Power / Data points", "Air conditioning"],
  open_plan: ["Walls / Partitions", "Ceiling / Suspended tiles", "Floor / Carpet tiles", "Windows", "Blinds", "Doors", "Power / Data points", "Lighting", "Air conditioning", "Cable management", "Signage"],
  reception: ["Walls", "Ceiling", "Floor", "Reception desk", "Access control", "Intercom", "Lighting", "Signage"],
  ablutions: ["Walls / Tiles", "Ceiling", "Floor / Tiles", "Basins", "Taps", "Toilets", "Mirrors", "Hand dryers", "Lighting", "Ventilation"],
}

export const CONDITION_OPTIONS = [
  { value: "excellent", label: "Excellent", color: "text-success" },
  { value: "good", label: "Good", color: "text-success" },
  { value: "fair", label: "Fair", color: "text-warning" },
  { value: "poor", label: "Poor", color: "text-warning" },
  { value: "damaged", label: "Damaged", color: "text-danger" },
  { value: "missing", label: "Missing", color: "text-danger" },
  { value: "not_inspected", label: "Not Inspected", color: "text-muted-foreground" },
] as const
