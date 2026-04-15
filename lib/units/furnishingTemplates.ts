// Standard furnishing items by room category.
// Used in the unit form (Tab 2) and as the source for inspection item injection.

export const FURNISHING_TEMPLATES: Record<string, string[]> = {
  kitchen: [
    "Fridge",
    "Stove / Oven",
    "Microwave",
    "Dishwasher",
    "Washing machine",
    "Tumble dryer",
    "Toaster",
    "Kettle",
    "Pots & pans set",
    "Cutlery set",
    "Crockery set",
    "Glassware set",
    "Utensil set",
    "Cutting boards",
    "Baking trays",
  ],
  lounge: [
    "Couch / Sofa",
    "Armchair",
    "Coffee table",
    "Side table",
    "TV unit / Stand",
    "TV",
    "Bookshelf",
    "Rug",
    "Curtains",
    "Blinds",
    "Floor lamp",
    "Table lamp",
    "Decorative cushions",
  ],
  dining: [
    "Dining table",
    "Dining chairs",
    "Sideboard / Buffet",
    "Bar stools",
    "Placemats",
    "Table runner",
  ],
  bedroom: [
    "Bed frame",
    "Mattress",
    "Mattress protector",
    "Bedside table",
    "Chest of drawers",
    "Wardrobe (freestanding)",
    "Desk",
    "Desk chair",
    "Dressing table",
    "Mirror",
    "Curtains",
    "Blinds",
    "Rug",
    "Bedside lamp",
  ],
  bathroom: [
    "Towel set",
    "Bath mat",
    "Shower curtain",
    "Mirror (freestanding)",
    "Bathroom scale",
    "Toilet brush holder",
    "Soap dispenser",
    "Laundry basket",
  ],
  outdoor: [
    "Patio table",
    "Patio chairs",
    "Sun umbrella",
    "Braai / BBQ",
    "Garden tools",
    "Hosepipe",
    "Outdoor cushions",
    "Planter boxes",
  ],
  general: [
    "Curtains (throughout)",
    "Blinds (throughout)",
    "Light shades (throughout)",
    "Door mats",
    "Iron",
    "Ironing board",
    "Vacuum cleaner",
    "Mop & bucket",
    "Broom & dustpan",
    "Laundry rack",
    "Step ladder",
    "First aid kit",
    "Fire extinguisher",
    "Heater (portable)",
    "Fan (portable)",
  ],
}

export const FURNISHING_CATEGORY_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  lounge: "Lounge",
  dining: "Dining",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  outdoor: "Outdoor",
  general: "General",
}

export type FurnishingCategory = keyof typeof FURNISHING_TEMPLATES

export const FURNISHING_CATEGORIES = Object.keys(
  FURNISHING_TEMPLATES
) as FurnishingCategory[]

export interface FurnishingItem {
  category: FurnishingCategory
  item_name: string
  quantity: number
  condition?: string
  notes?: string
  is_custom: boolean
}
