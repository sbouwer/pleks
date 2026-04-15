"use client"

import { useActionState, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FURNISHING_TEMPLATES,
  FURNISHING_CATEGORIES,
  FURNISHING_CATEGORY_LABELS,
  type FurnishingItem,
} from "@/lib/units/furnishingTemplates"
import { X } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgMember {
  user_id: string
  role: string
  user_profiles: { full_name: string | null } | null
}

export interface UnitFormProps {
  readonly action: (formData: FormData) => Promise<{ error?: string } | void>
  readonly members: OrgMember[]
  readonly defaultValues?: {
    unit_number?: string
    unit_type?: string
    floor?: number
    size_m2?: number
    bedrooms?: number
    bathrooms?: number
    parking_bays?: number
    furnishing_status?: string
    furnishings?: FurnishingItem[]
    features?: string[]
    asking_rent?: number
    deposit_amount?: number
    managed_by?: string
    notes?: string
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIT_TYPES = [
  { value: "studio", label: "Studio" },
  { value: "apartment", label: "Apartment / Flat" },
  { value: "house", label: "House" },
  { value: "cottage", label: "Cottage / Granny flat" },
  { value: "townhouse", label: "Townhouse" },
  { value: "duplex", label: "Duplex" },
  { value: "penthouse", label: "Penthouse" },
  { value: "loft", label: "Loft" },
  { value: "farm_unit", label: "Farm / Agricultural unit" },
  { value: "commercial", label: "Commercial / Office" },
  { value: "retail", label: "Retail space" },
  { value: "industrial", label: "Industrial / Warehouse" },
  { value: "other", label: "Other" },
]

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  property_manager: "Property Manager",
  agent: "Agent",
  accountant: "Accountant",
  maintenance_manager: "Maintenance Manager",
}

// All available features. Ordering is per unit type — see getOrderedFeatures().
const ALL_FEATURES = [
  "Parking",
  "Carport",
  "Garage",
  "Balcony",
  "Fibre",
  "DSTV",
  "Air-conditioning",
  "Alarm",
  "Storeroom",
  "Pet-friendly",
  "Pool",
  "Garden",
  "Solar",
  "Borehole",
  "Braai area",
  "Electric fence",
  "Wheelchair-accessible",
  "Stables",
  "Dam",
  "Workers' quarters",
  "Barn",
]

/**
 * Returns the full feature list reordered by unit type relevance.
 * Nothing is hidden — only the order changes.
 */
function getOrderedFeatures(unitType: string): string[] {
  const priorities: Record<string, string[]> = {
    studio: ["Parking", "Carport", "Fibre", "DSTV", "Air-conditioning", "Alarm", "Balcony", "Storeroom", "Pet-friendly"],
    apartment: ["Parking", "Carport", "Balcony", "Fibre", "DSTV", "Air-conditioning", "Alarm", "Storeroom", "Pet-friendly", "Pool"],
    townhouse: ["Parking", "Carport", "Garage", "Garden", "Braai area", "Alarm", "Fibre", "DSTV", "Air-conditioning", "Balcony", "Pet-friendly", "Pool"],
    duplex: ["Parking", "Carport", "Garage", "Balcony", "Fibre", "DSTV", "Air-conditioning", "Alarm", "Storeroom", "Pet-friendly"],
    penthouse: ["Parking", "Balcony", "Air-conditioning", "Pool", "Fibre", "DSTV", "Alarm", "Storeroom"],
    loft: ["Parking", "Carport", "Balcony", "Fibre", "DSTV", "Air-conditioning", "Alarm"],
    house: ["Garden", "Pool", "Garage", "Braai area", "Alarm", "Solar", "Borehole", "Electric fence", "Pet-friendly", "Carport", "Parking", "Fibre", "DSTV", "Air-conditioning"],
    cottage: ["Garden", "Braai area", "Pet-friendly", "Alarm", "Carport", "Parking", "Solar", "Borehole", "Electric fence", "Fibre", "DSTV", "Air-conditioning"],
    farm_unit: ["Stables", "Dam", "Borehole", "Solar", "Workers' quarters", "Barn", "Garden", "Braai area", "Electric fence", "Alarm", "Carport", "Parking", "Fibre"],
    commercial: ["Parking", "Carport", "Fibre", "Air-conditioning", "Wheelchair-accessible", "Alarm", "Solar", "Borehole", "DSTV"],
    retail: ["Parking", "Wheelchair-accessible", "Alarm", "Fibre", "Air-conditioning"],
    industrial: ["Parking", "Carport", "Alarm", "Solar", "Borehole"],
  }

  const priority = priorities[unitType] ?? []
  const rest = ALL_FEATURES.filter((f) => !priority.includes(f))
  return [...priority, ...rest]
}

// ── Furnishing inventory helpers ──────────────────────────────────────────────

interface CategoryInventory {
  [itemName: string]: { checked: boolean; quantity: number }
}

type InventoryState = Record<string, CategoryInventory>

function buildInitialInventory(furnishings?: FurnishingItem[]): InventoryState {
  const state: InventoryState = {}
  for (const cat of FURNISHING_CATEGORIES) {
    state[cat] = {}
    for (const item of FURNISHING_TEMPLATES[cat]) {
      state[cat][item] = { checked: false, quantity: 1 }
    }
  }
  if (furnishings) {
    for (const f of furnishings) {
      const cat = f.category
      if (!state[cat]) state[cat] = {}
      state[cat][f.item_name] = { checked: true, quantity: f.quantity }
    }
  }
  return state
}

// ── Main component ─────────────────────────────────────────────────────────────

export function UnitForm({ action, members, defaultValues }: UnitFormProps) {
  const [unitType, setUnitType] = useState<string>(defaultValues?.unit_type ?? "")
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(defaultValues?.features ?? [])
  const [customFeatures, setCustomFeatures] = useState<string[]>([])
  const [customFeatureInput, setCustomFeatureInput] = useState("")
  const [managedBy, setManagedBy] = useState<string>(defaultValues?.managed_by ?? "")
  const [furnishingStatus, setFurnishingStatus] = useState<string>(
    defaultValues?.furnishing_status ?? "unfurnished"
  )
  const [inventory, setInventory] = useState<InventoryState>(
    () => buildInitialInventory(defaultValues?.furnishings)
  )
  const [customItems, setCustomItems] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    if (defaultValues?.furnishings) {
      for (const f of defaultValues.furnishings) {
        if (f.is_custom) {
          map[f.category] = [...(map[f.category] ?? []), f.item_name]
        }
      }
    }
    return map
  })
  const [customItemInputs, setCustomItemInputs] = useState<Record<string, string>>({})
  const customFeatureRef = useRef<HTMLInputElement>(null)

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      // Append features (selected + custom)
      ;[...selectedFeatures, ...customFeatures].forEach((f) => formData.append("features", f))
      if (managedBy) formData.set("managed_by", managedBy)
      formData.set("furnishing_status", furnishingStatus)

      // Serialize furnishing inventory as JSON
      const furnishingRows: Array<{
        category: string
        item_name: string
        quantity: number
        is_custom: boolean
      }> = []

      for (const cat of FURNISHING_CATEGORIES) {
        // Standard items
        for (const [itemName, state] of Object.entries(inventory[cat] ?? {})) {
          if (state.checked) {
            furnishingRows.push({ category: cat, item_name: itemName, quantity: state.quantity, is_custom: false })
          }
        }
        // Custom items in this category
        for (const itemName of customItems[cat] ?? []) {
          furnishingRows.push({ category: cat, item_name: itemName, quantity: 1, is_custom: true })
        }
      }

      formData.set("furnishings_json", JSON.stringify(furnishingRows))

      const result = await action(formData)
      return result ?? null
    },
    null
  )

  // ── Feature chip handlers ──────────────────────────────────────────────────

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    )
  }

  function addCustomFeature() {
    const val = customFeatureInput.trim()
    if (!val || customFeatures.includes(val) || selectedFeatures.includes(val)) return
    setCustomFeatures((prev) => [...prev, val])
    setSelectedFeatures((prev) => [...prev, val])
    setCustomFeatureInput("")
    customFeatureRef.current?.focus()
  }

  function removeCustomFeature(feature: string) {
    setCustomFeatures((prev) => prev.filter((f) => f !== feature))
    setSelectedFeatures((prev) => prev.filter((f) => f !== feature))
  }

  // ── Inventory handlers ─────────────────────────────────────────────────────

  function toggleItem(cat: string, itemName: string) {
    setInventory((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [itemName]: {
          ...prev[cat]?.[itemName],
          checked: !prev[cat]?.[itemName]?.checked,
        },
      },
    }))
  }

  function setQuantity(cat: string, itemName: string, qty: number) {
    setInventory((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [itemName]: {
          ...prev[cat]?.[itemName],
          quantity: Math.max(1, qty),
        },
      },
    }))
  }

  function addCustomItem(cat: string) {
    const val = customItemInputs[cat]?.trim()
    if (!val) return
    setCustomItems((prev) => ({ ...prev, [cat]: [...(prev[cat] ?? []), val] }))
    // Also mark it as checked in inventory
    setInventory((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [val]: { checked: true, quantity: 1 },
      },
    }))
    setCustomItemInputs((prev) => ({ ...prev, [cat]: "" }))
  }

  // ── Ordered feature list ───────────────────────────────────────────────────

  const orderedFeatures = getOrderedFeatures(unitType)
  const showInventory = furnishingStatus === "semi_furnished" || furnishingStatus === "furnished"

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <form action={formAction} className="max-w-2xl">
      {state?.error && (
        <p className="text-sm text-danger mb-4 p-3 bg-danger/10 rounded-md">{state.error}</p>
      )}

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="details" className="flex-1">Unit details</TabsTrigger>
          <TabsTrigger value="features" className="flex-1">Features & furnishings</TabsTrigger>
          <TabsTrigger value="rental" className="flex-1">Rental & lease</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Unit details ────────────────────────────────────────── */}
        <TabsContent value="details" className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="unit_number">Unit Name / Number *</Label>
            <Input
              id="unit_number"
              name="unit_number"
              defaultValue={defaultValues?.unit_number}
              placeholder='e.g. "Flat 1", "House", "Unit 2A"'
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit_type">Unit type *</Label>
            <Select name="unit_type" value={unitType} onValueChange={(v) => setUnitType(v ?? "")}>
              <SelectTrigger id="unit_type">
                <SelectValue placeholder="Select unit type..." />
              </SelectTrigger>
              <SelectContent>
                {UNIT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bedrooms">Bedrooms</Label>
              <Input
                id="bedrooms"
                name="bedrooms"
                type="number"
                min="0"
                defaultValue={defaultValues?.bedrooms ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                name="bathrooms"
                type="number"
                min="0"
                step="0.5"
                defaultValue={defaultValues?.bathrooms ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parking_bays">Parking bays</Label>
              <Input
                id="parking_bays"
                name="parking_bays"
                type="number"
                min="0"
                defaultValue={defaultValues?.parking_bays ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size_m2">Size (m²)</Label>
              <Input
                id="size_m2"
                name="size_m2"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.size_m2 ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2 max-w-[120px]">
            <Label htmlFor="floor">Floor</Label>
            <Input
              id="floor"
              name="floor"
              type="number"
              defaultValue={defaultValues?.floor ?? ""}
              placeholder="0 = ground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={defaultValues?.notes}
              rows={3}
              placeholder="Visible to team only — not shown on listings"
            />
          </div>
        </TabsContent>

        {/* ── Tab 2: Features & furnishings ─────────────────────────────── */}
        <TabsContent value="features" className="space-y-8">

          {/* Features */}
          <div className="space-y-3">
            <div>
              <Label className="text-base font-semibold">Features</Label>
              {unitType && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Most relevant for {UNIT_TYPES.find((t) => t.value === unitType)?.label ?? unitType} shown first
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {orderedFeatures.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => toggleFeature(f)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    selectedFeatures.includes(f)
                      ? "bg-brand text-brand-dim border-brand"
                      : "border-border text-muted-foreground hover:border-brand/50"
                  }`}
                >
                  {f}
                </button>
              ))}
              {/* Custom features */}
              {customFeatures.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 px-3 py-1 text-sm rounded-full border bg-brand text-brand-dim border-brand"
                >
                  {f}
                  <button
                    type="button"
                    onClick={() => removeCustomFeature(f)}
                    className="opacity-70 hover:opacity-100"
                    aria-label={`Remove ${f}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            {/* Add custom feature */}
            <div className="flex gap-2 max-w-xs">
              <Input
                ref={customFeatureRef}
                value={customFeatureInput}
                onChange={(e) => setCustomFeatureInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomFeature() } }}
                placeholder="Add custom feature..."
                className="text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomFeature}>
                Add
              </Button>
            </div>
          </div>

          {/* Furnishing status */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Furnishing status</Label>
            <div className="space-y-2">
              {[
                { value: "unfurnished", label: "Unfurnished" },
                { value: "semi_furnished", label: "Semi-furnished" },
                { value: "furnished", label: "Fully furnished" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="furnishing_status_radio"
                    value={opt.value}
                    checked={furnishingStatus === opt.value}
                    onChange={() => setFurnishingStatus(opt.value)}
                    className="accent-brand"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Furnishing inventory (semi or fully furnished) */}
          {showInventory && (
            <div className="space-y-6">
              <div>
                <Label className="text-base font-semibold">Included furnishings</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Checked items become inspection checklist items at move-in and move-out.
                </p>
              </div>

              {FURNISHING_CATEGORIES.map((cat) => {
                const allItems = [
                  ...FURNISHING_TEMPLATES[cat],
                  ...(customItems[cat] ?? []),
                ]
                return (
                  <div key={cat} className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {FURNISHING_CATEGORY_LABELS[cat]}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {allItems.map((itemName) => {
                        const itemState = inventory[cat]?.[itemName] ?? { checked: false, quantity: 1 }
                        return (
                          <label
                            key={itemName}
                            className="flex items-center gap-2 py-1 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              checked={itemState.checked}
                              onChange={() => toggleItem(cat, itemName)}
                              className="accent-brand flex-shrink-0"
                            />
                            <span className="text-sm flex-1">{itemName}</span>
                            {itemState.checked && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <span className="text-xs text-muted-foreground">×</span>
                                <Input
                                  type="number"
                                  min="1"
                                  value={itemState.quantity}
                                  onChange={(e) => setQuantity(cat, itemName, Number.parseInt(e.target.value) || 1)}
                                  className="w-14 h-6 text-xs px-1"
                                  onClick={(e) => e.preventDefault()}
                                />
                              </div>
                            )}
                          </label>
                        )
                      })}
                    </div>

                    {/* Add custom item in this category */}
                    <div className="flex gap-2 max-w-xs pt-1">
                      <Input
                        value={customItemInputs[cat] ?? ""}
                        onChange={(e) => setCustomItemInputs((prev) => ({ ...prev, [cat]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomItem(cat) } }}
                        placeholder={`Add item to ${FURNISHING_CATEGORY_LABELS[cat].toLowerCase()}...`}
                        className="text-xs"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => addCustomItem(cat)}>
                        Add
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: Rental & lease ──────────────────────────────────────── */}
        <TabsContent value="rental" className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="asking_rent">Asking rent (ZAR)</Label>
              <Input
                id="asking_rent"
                name="asking_rent"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.asking_rent ?? ""}
                placeholder="e.g. 8500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deposit_amount">Deposit (ZAR)</Label>
              <Input
                id="deposit_amount"
                name="deposit_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={defaultValues?.deposit_amount ?? ""}
                placeholder="e.g. 17000"
              />
              {furnishingStatus === "furnished" && (
                <p className="text-xs text-muted-foreground">
                  Furnished units typically require 3× monthly rent.
                </p>
              )}
              {furnishingStatus === "semi_furnished" && (
                <p className="text-xs text-muted-foreground">
                  Semi-furnished units typically require 2–3× monthly rent.
                </p>
              )}
            </div>
          </div>

          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Managing person</Label>
              <Select value={managedBy} onValueChange={(v) => setManagedBy(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {managedBy && !members.some((m) => m.user_id === managedBy) && (
                    <SelectItem value={managedBy} disabled>
                      Unknown agent (removed)
                    </SelectItem>
                  )}
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.user_profiles?.full_name || "Unnamed"}{" "}
                      <span className="text-muted-foreground">
                        ({ROLE_LABELS[m.role] ?? m.role})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-8 pt-6 border-t">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Saving..." : "Save Unit"}
        </Button>
      </div>
    </form>
  )
}
