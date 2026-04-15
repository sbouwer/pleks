// roomListGenerator.ts
// Generates and manages the room list that drives inspection profiles.
// Pure functions — no server/client dependency.

export interface RoomEntry {
  /** Stable key: "{room_type}_{index}" e.g. "bedroom_0", "bedroom_1" */
  id: string
  /** Canonical type used for template matching */
  room_type: string
  /** Display label — editable by the agent */
  label: string
  /** User added this room manually */
  is_custom: boolean
  /** true = checked (in the list), false = shown as a suggestion */
  included: boolean
}

// ── Internal template ─────────────────────────────────────────────────────────

interface RoomTemplate {
  room_type: string
  label: string
  included: boolean
}

function bedroomRooms(count: number): RoomTemplate[] {
  if (count <= 0) return []
  if (count === 1) return [{ room_type: "bedroom", label: "Bedroom", included: true }]
  const rooms: RoomTemplate[] = [{ room_type: "bedroom", label: "Main bedroom", included: true }]
  for (let i = 2; i <= count; i++) {
    rooms.push({ room_type: "bedroom", label: `Bedroom ${i}`, included: true })
  }
  return rooms
}

function bathroomRooms(count: number): RoomTemplate[] {
  if (count <= 0) return []
  const floor = Math.floor(count)
  const hasHalf = count % 1 >= 0.5

  if (floor === 1 && !hasHalf) {
    return [{ room_type: "bathroom", label: "Bathroom", included: true }]
  }
  if (floor === 1 && hasHalf) {
    return [
      { room_type: "bathroom", label: "Bathroom", included: true },
      { room_type: "bathroom", label: "Guest toilet", included: true },
    ]
  }

  const rooms: RoomTemplate[] = [{ room_type: "bathroom", label: "Bathroom", included: true }]
  if (floor >= 2) rooms.push({ room_type: "bathroom", label: "En-suite", included: true })
  for (let i = 3; i <= floor; i++) {
    rooms.push({ room_type: "bathroom", label: `Bathroom ${i}`, included: true })
  }
  if (hasHalf) rooms.push({ room_type: "bathroom", label: "Guest toilet", included: true })
  return rooms
}

function templatesToEntries(templates: RoomTemplate[]): RoomEntry[] {
  const typeCounts: Record<string, number> = {}
  return templates.map((t) => {
    const n = typeCounts[t.room_type] ?? 0
    typeCounts[t.room_type] = n + 1
    return {
      id: `${t.room_type}_${n}`,
      room_type: t.room_type,
      label: t.label,
      is_custom: false,
      included: t.included,
    }
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a full room list (included + suggestions) for a unit.
 * Pass features to auto-include feature-driven rooms (Garden, Garage, Pool, etc.).
 */
export function generateRooms(
  unitType: string,
  bedrooms: number,
  bathrooms: number,
  features: string[] = [],
): RoomEntry[] {
  const beds = Math.max(0, Math.round(bedrooms))
  const baths = Math.max(0, bathrooms)
  const f = features.map((s) => s.toLowerCase())
  const has = (feat: string) => f.includes(feat.toLowerCase())

  let templates: RoomTemplate[] = []

  switch (unitType) {
    case "studio": {
      templates = [
        { room_type: "open_plan", label: "Open-plan living", included: true },
        { room_type: "kitchen", label: "Kitchenette", included: true },
        { room_type: "bathroom", label: "Bathroom", included: true },
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "balcony", label: "Balcony", included: false },
        { room_type: "storeroom", label: "Storeroom", included: false },
      ]
      break
    }

    case "apartment":
    case "flat":
    case "duplex":
    case "penthouse":
    case "loft": {
      templates = [
        { room_type: "entrance", label: "Entrance", included: true },
        { room_type: "kitchen", label: "Kitchen", included: true },
        { room_type: "lounge", label: "Lounge", included: true },
        ...bedroomRooms(beds),
        ...bathroomRooms(baths),
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "dining", label: "Dining room", included: false },
        { room_type: "balcony", label: "Balcony", included: false },
        { room_type: "storeroom", label: "Storeroom", included: false },
        { room_type: "garden", label: "Garden", included: false },
      ]
      break
    }

    case "townhouse": {
      templates = [
        { room_type: "entrance", label: "Entrance", included: true },
        { room_type: "kitchen", label: "Kitchen", included: true },
        { room_type: "lounge", label: "Lounge", included: true },
        { room_type: "dining", label: "Dining room", included: true },
        ...bedroomRooms(beds),
        ...bathroomRooms(baths),
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "garden", label: "Garden", included: has("Garden") },
        { room_type: "garage", label: "Garage", included: has("Garage") },
        { room_type: "braai", label: "Braai area", included: false },
        { room_type: "storeroom", label: "Storeroom", included: false },
      ]
      break
    }

    case "house": {
      templates = [
        { room_type: "entrance", label: "Entrance", included: true },
        { room_type: "kitchen", label: "Kitchen", included: true },
        { room_type: "lounge", label: "Lounge", included: true },
        { room_type: "dining", label: "Dining room", included: true },
        ...bedroomRooms(beds),
        ...bathroomRooms(baths),
        { room_type: "laundry", label: "Laundry / Scullery", included: true },
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "garden", label: "Garden", included: has("Garden") },
        { room_type: "garage", label: "Garage", included: has("Garage") },
        { room_type: "braai", label: "Braai area", included: has("Braai area") },
        { room_type: "pool", label: "Pool area", included: has("Pool") },
        { room_type: "storeroom", label: "Storeroom", included: false },
      ]
      break
    }

    case "cottage":
    case "farm_unit": {
      templates = [
        { room_type: "entrance", label: "Entrance", included: true },
        { room_type: "kitchen", label: "Kitchen", included: true },
        { room_type: "lounge", label: "Lounge", included: true },
        ...bedroomRooms(beds),
        ...bathroomRooms(baths),
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "garden", label: "Garden", included: false },
        { room_type: "storeroom", label: "Storeroom", included: false },
      ]
      break
    }

    case "commercial":
    case "retail":
    case "industrial": {
      templates = [
        { room_type: "reception", label: "Reception", included: true },
        { room_type: "main_area", label: "Main area", included: true },
        { room_type: "kitchen", label: "Kitchenette", included: true },
        { room_type: "bathroom", label: "Bathroom", included: true },
        { room_type: "general", label: "General / Utilities", included: true },
        { room_type: "storeroom", label: "Storeroom", included: false },
        { room_type: "parking", label: "Parking area", included: false },
      ]
      break
    }

    default: {
      templates = [
        { room_type: "entrance", label: "Entrance", included: true },
        { room_type: "kitchen", label: "Kitchen", included: true },
        { room_type: "lounge", label: "Lounge", included: true },
        ...bedroomRooms(beds),
        ...bathroomRooms(baths),
        { room_type: "general", label: "General / Utilities", included: true },
      ]
    }
  }

  return templatesToEntries(templates)
}

/**
 * Merge an updated room generation into the current state.
 * Used when bedrooms/bathrooms count changes to add/remove room rows
 * without discarding the user's edits to other rooms.
 *
 * Rules:
 * - For rooms with matching IDs: preserve user's label + included choice
 * - For new rooms in `fresh`: add them (included state from fresh)
 * - For custom rooms in `current` not in `fresh`: keep them
 * - For non-custom rooms in `current` not in `fresh`: drop them
 */
export function mergeRoomList(current: RoomEntry[], fresh: RoomEntry[]): RoomEntry[] {
  const currentMap = new Map(current.map((r) => [r.id, r]))
  const freshIds = new Set(fresh.map((r) => r.id))

  // Take fresh rooms, preserving user edits where IDs match
  const merged: RoomEntry[] = fresh.map((r) => {
    const existing = currentMap.get(r.id)
    if (existing) {
      return { ...r, label: existing.label, included: existing.included }
    }
    return r
  })

  // Append custom rooms not in fresh
  for (const r of current) {
    if (r.is_custom && !freshIds.has(r.id)) {
      merged.push(r)
    }
  }

  return merged
}

/**
 * Serialize included rooms to a JSON string for form submission.
 * Only saves included rooms — suggestions are reconstructed from unit type on load.
 */
export function serializeRooms(rooms: RoomEntry[]): string {
  return JSON.stringify(
    rooms
      .filter((r) => r.included)
      .map((r, i) => ({
        room_type: r.room_type,
        label: r.label,
        sort_order: i,
        is_custom: r.is_custom,
      })),
  )
}

/**
 * Reconstruct RoomEntry[] from saved DB rows + fresh generation (for suggestions).
 * Call this to initialise form state when the unit already has a saved profile.
 */
export function deserializeRooms(
  savedRooms: Array<{ room_type: string; label: string; sort_order: number; is_custom: boolean }>,
  unitType: string,
  bedrooms: number,
  bathrooms: number,
  features: string[],
): RoomEntry[] {
  if (!savedRooms.length) {
    return generateRooms(unitType, bedrooms, bathrooms, features)
  }

  // Sort by saved order and give stable IDs
  const sorted = [...savedRooms].sort((a, b) => a.sort_order - b.sort_order)
  const typeCounts: Record<string, number> = {}
  const included: RoomEntry[] = sorted.map((r) => {
    const n = typeCounts[r.room_type] ?? 0
    typeCounts[r.room_type] = n + 1
    return {
      id: `${r.room_type}_${n}`,
      room_type: r.room_type,
      label: r.label,
      is_custom: r.is_custom,
      included: true,
    }
  })

  // Generate fresh list to pick up suggestions not already included
  const includedIds = new Set(included.map((r) => r.id))
  const freshSuggestions = generateRooms(unitType, bedrooms, bathrooms, features)
    .filter((r) => !r.included && !includedIds.has(r.id))

  return [...included, ...freshSuggestions]
}
