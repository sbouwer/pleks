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

// Per-item placeholder examples shown in the description input.
export const FURNISHING_PLACEHOLDERS: Record<string, string> = {
  // Kitchen
  "Fridge":             "e.g. Hisense 130L silver, no ice dispenser",
  "Stove / Oven":       "e.g. Defy 4-plate electric stove with oven",
  "Microwave":          "e.g. Samsung 28L black combi",
  "Dishwasher":         "e.g. Bosch 60cm built-in, 12 place settings",
  "Washing machine":    "e.g. LG 7kg front-loader white",
  "Tumble dryer":       "e.g. Defy 5kg condenser white",
  "Toaster":            "e.g. Russell Hobbs 4-slice stainless",
  "Kettle":             "e.g. KitchenAid 1.7L red",
  "Pots & pans set":    "e.g. 5-piece non-stick set, grey",
  "Cutlery set":        "e.g. 24-piece stainless, in wooden block",
  "Crockery set":       "e.g. 16-piece white ceramic",
  "Glassware set":      "e.g. 6 wine glasses, 6 tumblers",
  "Utensil set":        "e.g. 6-piece silicone set in holder",
  // Lounge
  "Couch / Sofa":       "e.g. L-shaped 3-seater from Coricraft, dark grey fabric",
  "Armchair":           "e.g. Single tub chair, mustard velvet",
  "Coffee table":       "e.g. Rectangular glass-top with gold frame",
  "Side table":         "e.g. Round wooden side table, oak finish",
  "TV unit / Stand":    "e.g. 2m floating wall unit, white gloss",
  "TV":                 "e.g. Samsung 55' 4K smart TV",
  "Bookshelf":          "e.g. 5-shelf white melamine, 180cm tall",
  "Rug":                "e.g. 2×3m grey geometric, short pile",
  "Curtains":           "e.g. Floor-length blackout curtains, navy",
  "Blinds":             "e.g. White venetian 80cm, all windows",
  "Floor lamp":         "e.g. Black arc lamp with white shade",
  "Table lamp":         "e.g. Ceramic base, white shade",
  // Dining
  "Dining table":       "e.g. 6-seater wooden table, 1.8m, walnut",
  "Dining chairs":      "e.g. 6× padded dining chairs, charcoal fabric",
  "Sideboard / Buffet": "e.g. 2-door oak sideboard, 1.6m",
  "Bar stools":         "e.g. 2× black metal counter stools, adjustable",
  // Bedroom
  "Bed frame":          "e.g. Queen wooden sleigh bed, dark stain",
  "Mattress":           "e.g. Sealy Posturepedic queen, medium",
  "Mattress protector": "e.g. Waterproof queen mattress protector",
  "Bedside table":      "e.g. 2× white floating bedside shelves",
  "Chest of drawers":   "e.g. 6-drawer IKEA Hemnes, white",
  "Wardrobe (freestanding)": "e.g. 3-door PAX wardrobe, mirror centre door",
  "Desk":               "e.g. White IKEA Micke, 105cm",
  "Desk chair":         "e.g. Black mesh office chair",
  "Dressing table":     "e.g. White dressing table with mirror and stool",
  "Mirror":             "e.g. Full-length leaning mirror, black frame",
  // Bathroom
  "Towel set":          "e.g. 4× grey cotton bath towels",
  "Bath mat":           "e.g. 2× memory foam bath mats, white",
  "Shower curtain":     "e.g. White waffle-weave shower curtain with rings",
  "Mirror (freestanding)": "e.g. Oval standing mirror, rose gold frame",
  "Bathroom scale":     "e.g. Digital glass scale, black",
  // Outdoor
  "Patio table":        "e.g. 4-seater round aluminium table, charcoal",
  "Patio chairs":       "e.g. 4× stackable resin chairs, white",
  "Sun umbrella":       "e.g. 2.7m market umbrella, taupe, with base",
  "Braai / BBQ":        "e.g. Weber kettle braai, 57cm, black",
  "Garden tools":       "e.g. Spade, rake, fork and trowel set",
  "Hosepipe":           "e.g. 20m retractable hose with fittings",
  // General
  "Curtains (throughout)": "e.g. All rooms — eyelet blackout, charcoal",
  "Blinds (throughout)":   "e.g. All rooms — white roller blinds",
  "Iron":               "e.g. Philips steam iron, 2400W",
  "Ironing board":      "e.g. Foldable 120cm board with cover",
  "Vacuum cleaner":     "e.g. Dyson V8 cordless",
  "Mop & bucket":       "e.g. Spin mop with bucket, grey",
  "Heater (portable)":  "e.g. Oil-filled 9-fin heater, 2000W",
  "Fan (portable)":     "e.g. Goldair 40cm pedestal fan, white",
}

export function getFurnishingPlaceholder(itemName: string): string {
  return FURNISHING_PLACEHOLDERS[itemName] ?? `e.g. Brand, size, colour, model`
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

export const FURNISHING_CATEGORIES: FurnishingCategory[] = [
  "kitchen", "lounge", "dining", "bedroom", "bathroom", "outdoor", "general",
]

export interface FurnishingItem {
  category: FurnishingCategory
  item_name: string
  quantity: number
  condition?: string
  notes?: string
  is_custom: boolean
}
