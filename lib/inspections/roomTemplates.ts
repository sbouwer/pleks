export const RESIDENTIAL_ROOMS = [
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
] as const

export const COMMERCIAL_ROOMS = [
  { type: "reception", label: "Reception / Entrance lobby" },
  { type: "open_plan", label: "Open plan office" },
  { type: "boardroom", label: "Boardroom / Meeting room" },
  { type: "private_office", label: "Private office" },
  { type: "server_room", label: "Server room / IT room" },
  { type: "kitchen_comm", label: "Kitchen / Canteen" },
  { type: "ablutions", label: "Ablutions / Bathrooms" },
  { type: "storage", label: "Storage / Storeroom" },
  { type: "parking", label: "Parking / Loading bay" },
  { type: "exterior", label: "Exterior / Signage" },
  { type: "plant_room", label: "Plant room / Utility" },
  { type: "other", label: "Other area" },
] as const

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

export function getRoomTemplate(leaseType: string) {
  return leaseType === "commercial" ? COMMERCIAL_ROOMS : RESIDENTIAL_ROOMS
}

export function getItemsForRoom(leaseType: string, roomType: string): string[] {
  const items = leaseType === "commercial" ? COMMERCIAL_ITEMS : RESIDENTIAL_ITEMS
  // Match room type to item templates
  for (const [key, value] of Object.entries(items)) {
    if (roomType.includes(key)) return value
  }
  return items.default
}
