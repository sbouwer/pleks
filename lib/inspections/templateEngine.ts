/**
 * templateEngine.ts
 *
 * Unit-type-aware inspection room + item generation.
 * When a unit has a unit_type set, this engine uses bedroom/bathroom counts
 * and feature flags to build a precise room list.
 * Falls back to the flat roomTemplates.ts behaviour when unit_type is unknown.
 */

import { RESIDENTIAL_ITEMS, COMMERCIAL_ITEMS } from "./roomTemplates"

// ── Types ────────────────────────────────────────────────────────────────────

export interface UnitContext {
  unit_type?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  features?: string[] | null
}

export interface RoomSuggestion {
  type: string
  label: string
  items: string[]
}

// ── Item banks ────────────────────────────────────────────────────────────────

const ENTRANCE_ITEMS = [
  "Front door",
  "Door frame",
  "Door lock / Handle",
  "Security gate",
  "Intercom / Doorbell",
  "Walls",
  "Ceiling",
  "Floor",
  "Light fittings",
  "Electrical meter box",
]

const KITCHEN_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor",
  "Windows",
  "Doors",
  "Cupboards",
  "Countertops",
  "Sink",
  "Taps",
  "Stove / Hob",
  "Oven",
  "Extractor fan",
  "Light fittings",
  "Power points",
]

const LOUNGE_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor",
  "Windows",
  "Curtain rails",
  "Blinds",
  "Doors",
  "Light fittings",
  "Power points",
  "TV aerial / DSTV point",
]

const DINING_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor",
  "Windows",
  "Curtain rails",
  "Light fittings",
  "Power points",
]

const BEDROOM_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor / Carpet",
  "Windows",
  "Window blinds",
  "Curtain rails",
  "Doors",
  "Door handles",
  "Built-in cupboards",
  "Light fittings",
  "Power points",
]

const BATHROOM_ITEMS = [
  "Walls / Tiles",
  "Ceiling",
  "Floor / Tiles",
  "Bath / Shower",
  "Shower door",
  "Basin",
  "Taps",
  "Toilet",
  "Mirror",
  "Towel rails",
  "Cabinet",
  "Extractor fan",
  "Light fittings",
]

const LAUNDRY_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor",
  "Taps / Connections",
  "Drain",
  "Light fittings",
  "Power points",
]

const GARAGE_ITEMS = [
  "Garage door",
  "Garage door motor",
  "Walls",
  "Ceiling",
  "Floor",
  "Light fittings",
  "Power points",
  "Storage shelves",
]

const GARDEN_ITEMS = [
  "Lawn condition",
  "Garden beds",
  "Trees / Shrubs",
  "Irrigation",
  "Fencing",
  "Gate",
  "Paving",
]

const POOL_ITEMS = [
  "Pool condition",
  "Pool pump",
  "Pool filter",
  "Pool cover",
  "Pool light",
  "Surrounding tiles / Paving",
  "Safety barrier / Fence",
]

const STOREROOM_ITEMS = [
  "Walls",
  "Ceiling",
  "Floor",
  "Door",
  "Lock",
  "Light fittings",
]

const BRAAI_ITEMS = [
  "Braai structure",
  "Paving / Decking",
  "Seating area",
  "Drainage",
  "Power points",
]

// ── Feature → optional room mapping ──────────────────────────────────────────

function hasFeature(features: string[] | null | undefined, name: string): boolean {
  if (!features) return false
  return features.some((f) => f.toLowerCase() === name.toLowerCase())
}

// ── Core engine ───────────────────────────────────────────────────────────────

function buildBedroomRooms(count: number): RoomSuggestion[] {
  const rooms: RoomSuggestion[] = []
  for (let i = 1; i <= count; i++) {
    rooms.push({
      type: `bedroom_${i}`,
      label: i === 1 ? "Bedroom 1 (Main)" : `Bedroom ${i}`,
      items: [...BEDROOM_ITEMS],
    })
  }
  return rooms
}

function buildBathroomRooms(count: number): RoomSuggestion[] {
  const rooms: RoomSuggestion[] = []
  for (let i = 1; i <= count; i++) {
    let label: string
    if (i === 1) label = "Bathroom / Shower"
    else if (i === 2) label = "En-suite"
    else label = `Bathroom ${i}`
    rooms.push({ type: `bathroom_${i}`, label, items: [...BATHROOM_ITEMS] })
  }
  return rooms
}

function buildFeatureRooms(features: string[]): RoomSuggestion[] {
  const rooms: RoomSuggestion[] = []
  if (hasFeature(features, "Garage"))    rooms.push({ type: "garage",    label: "Garage",       items: [...GARAGE_ITEMS] })
  if (hasFeature(features, "Carport"))   rooms.push({ type: "carport",   label: "Carport",      items: ["Structure", "Roof", "Floor", "Light fittings"] })
  if (hasFeature(features, "Garden"))    rooms.push({ type: "garden",    label: "Garden / Yard", items: [...GARDEN_ITEMS] })
  if (hasFeature(features, "Pool"))      rooms.push({ type: "pool",      label: "Pool Area",    items: [...POOL_ITEMS] })
  if (hasFeature(features, "Braai area")) rooms.push({ type: "braai",   label: "Braai Area",   items: [...BRAAI_ITEMS] })
  if (hasFeature(features, "Storeroom")) rooms.push({ type: "storeroom", label: "Storeroom",    items: [...STOREROOM_ITEMS] })
  return rooms
}

/**
 * Generate room suggestions for a residential unit with a known unit_type.
 */
function buildResidentialRooms(unit: UnitContext): RoomSuggestion[] {
  const rooms: RoomSuggestion[] = []
  const features = unit.features ?? []
  const bedrooms = unit.bedrooms ?? 1
  const bathrooms = Math.round(unit.bathrooms ?? 1)
  const unitType = unit.unit_type ?? "apartment"

  // Entrance
  rooms.push({ type: "entrance", label: "Entrance / Hallway", items: [...ENTRANCE_ITEMS] })

  // Lounge — studios get a combined lounge/dining label
  if (unitType === "studio") {
    rooms.push({ type: "lounge", label: "Living Area", items: [...LOUNGE_ITEMS, ...DINING_ITEMS] })
  } else {
    rooms.push(
      { type: "lounge", label: "Lounge", items: [...LOUNGE_ITEMS] },
      { type: "dining", label: "Dining Room", items: [...DINING_ITEMS] },
    )
  }

  // Kitchen, bedrooms, bathrooms
  const bedroomCount = unitType === "studio" ? 0 : Math.max(bedrooms, 0)
  rooms.push(
    { type: "kitchen", label: "Kitchen", items: [...KITCHEN_ITEMS] },
    ...buildBedroomRooms(bedroomCount),
    ...buildBathroomRooms(Math.max(bathrooms, 1)),
  )

  // Laundry — houses + cottages always
  if (unitType === "house" || unitType === "cottage" || unitType === "farm") {
    rooms.push({ type: "laundry", label: "Laundry / Utility", items: [...LAUNDRY_ITEMS] })
  }

  // Feature-driven optional rooms, then fixed tail
  rooms.push(
    ...buildFeatureRooms(features),
    { type: "exterior", label: "Exterior", items: ["Walls", "Roof", "Gutters", "Paving / Paths", "Boundary walls", "Gate", "Letterbox"] },
    { type: "other", label: "Other", items: ["Walls", "Ceiling", "Floor", "Light fittings", "Power points"] },
  )

  return rooms
}

/**
 * Build commercial rooms (unchanged from flat template).
 */
function buildCommercialRooms(): RoomSuggestion[] {
  return [
    { type: "reception", label: "Reception / Entrance lobby", items: [...(COMMERCIAL_ITEMS.reception ?? COMMERCIAL_ITEMS.default)] },
    { type: "open_plan", label: "Open plan office", items: [...(COMMERCIAL_ITEMS.open_plan ?? COMMERCIAL_ITEMS.default)] },
    { type: "boardroom", label: "Boardroom / Meeting room", items: [...COMMERCIAL_ITEMS.default] },
    { type: "private_office", label: "Private office", items: [...COMMERCIAL_ITEMS.default] },
    { type: "server_room", label: "Server room / IT room", items: [...COMMERCIAL_ITEMS.default] },
    { type: "kitchen_comm", label: "Kitchen / Canteen", items: [...COMMERCIAL_ITEMS.default] },
    { type: "ablutions", label: "Ablutions / Bathrooms", items: [...(COMMERCIAL_ITEMS.ablutions ?? COMMERCIAL_ITEMS.default)] },
    { type: "storage", label: "Storage / Storeroom", items: [...COMMERCIAL_ITEMS.default] },
    { type: "parking", label: "Parking / Loading bay", items: [...COMMERCIAL_ITEMS.default] },
    { type: "exterior", label: "Exterior / Signage", items: [...COMMERCIAL_ITEMS.default] },
    { type: "plant_room", label: "Plant room / Utility", items: [...COMMERCIAL_ITEMS.default] },
    { type: "other", label: "Other area", items: [...COMMERCIAL_ITEMS.default] },
  ]
}

/**
 * Main entry point.
 * When unit has a unit_type, generates precise rooms.
 * Falls back to the flat RESIDENTIAL_ROOMS template when unit_type is absent.
 */
export function getRoomSuggestions(
  leaseType: string,
  unit?: UnitContext | null,
): RoomSuggestion[] {
  if (leaseType === "commercial") {
    return buildCommercialRooms()
  }

  // If we have a unit_type, use the smart engine
  if (unit?.unit_type) {
    return buildResidentialRooms(unit)
  }

  // Fallback: flat default residential rooms (legacy — no unit_type set)
  return buildLegacyResidentialRooms()
}

/**
 * Legacy fallback — mirrors the flat RESIDENTIAL_ROOMS constant.
 * Used when the unit has no unit_type (pre-57A units).
 */
function buildLegacyResidentialRooms(): RoomSuggestion[] {
  const rooms: Array<{ type: string; label: string }> = [
    { type: "entrance", label: "Entrance / Hallway" },
    { type: "lounge", label: "Lounge" },
    { type: "dining", label: "Dining Room" },
    { type: "kitchen", label: "Kitchen" },
    { type: "bedroom_1", label: "Bedroom 1 (Main)" },
    { type: "bedroom_2", label: "Bedroom 2" },
    { type: "bedroom_3", label: "Bedroom 3" },
    { type: "bathroom_1", label: "Bathroom / Shower" },
    { type: "bathroom_2", label: "En-suite" },
    { type: "toilet", label: "Toilet" },
    { type: "laundry", label: "Laundry / Utility" },
    { type: "garage", label: "Garage" },
    { type: "garden", label: "Garden / Yard" },
    { type: "pool", label: "Pool Area" },
    { type: "storeroom", label: "Storeroom" },
    { type: "other", label: "Other" },
  ]

  return rooms.map((r) => ({
    type: r.type,
    label: r.label,
    items: getItemsForRoomType(r.type),
  }))
}

export function getItemsForRoomType(roomType: string): string[] {
  if (roomType.startsWith("bedroom")) return [...BEDROOM_ITEMS]
  if (roomType === "kitchen") return [...KITCHEN_ITEMS]
  if (roomType.startsWith("bathroom") || roomType === "toilet") return [...BATHROOM_ITEMS]
  if (roomType === "garden") return [...GARDEN_ITEMS]
  if (roomType === "garage") return [...GARAGE_ITEMS]
  if (roomType === "entrance") return [...ENTRANCE_ITEMS]
  if (roomType === "lounge") return [...LOUNGE_ITEMS]
  if (roomType === "dining") return [...DINING_ITEMS]
  if (roomType === "laundry") return [...LAUNDRY_ITEMS]
  if (roomType === "pool") return [...POOL_ITEMS]
  if (roomType === "storeroom") return [...STOREROOM_ITEMS]
  return [...(RESIDENTIAL_ITEMS.default)]
}

/**
 * Inject unit_furnishings items into the matching room's item list.
 * Called when an inspection is seeded for a furnished unit.
 * The "(furnished)" suffix flags landlord-owned items for move-out checks.
 */
export function injectFurnishingItems(
  rooms: RoomSuggestion[],
  furnishings: Array<{ category: string; item_name: string }>,
): RoomSuggestion[] {
  for (const item of furnishings) {
    const tag = `${item.item_name} (furnished)`
    // Map furnishing category to room type(s)
    const matchedRoom = rooms.find((r) => {
      if (item.category === "kitchen") return r.type === "kitchen"
      if (item.category === "lounge" || item.category === "dining") return r.type === "lounge" || r.type === "dining"
      if (item.category === "bedroom") return r.type.startsWith("bedroom")
      if (item.category === "bathroom") return r.type.startsWith("bathroom")
      if (item.category === "outdoor") return r.type === "garden" || r.type === "exterior" || r.type === "braai"
      if (item.category === "general") return r.type === "other" || r.type === "entrance"
      return false
    })
    if (matchedRoom && !matchedRoom.items.includes(tag)) {
      matchedRoom.items.push(tag)
    }
  }
  return rooms
}
