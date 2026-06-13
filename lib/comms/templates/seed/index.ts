/**
 * lib/comms/templates/seed/index.ts — the centralized template seed source (ADDENDUM_70E E3)
 *
 * Data:   SYSTEM_TEMPLATE_SEEDS — every external comm, corrected (70B F-1) + standardized (70F),
 *         as typed blocks. The generator (scripts/gen-template-seed.mts) is the ONLY consumer that
 *         emits both the CD review doc and the seed SQL. NOT seeded to the DB until CD's review pass.
 * Notes:  Fold-in progress: statutory batch 1 (arrears). Correspondence + service + remaining statutory
 *         append here as they are folded. Once the document_templates store is seeded (E3), this module
 *         becomes the seed/migration input — the store, not this, is then SSOT.
 */

import type { TemplateSeed } from "./types"
import { STATUTORY_SEEDS } from "./statutory"

export const SYSTEM_TEMPLATE_SEEDS: TemplateSeed[] = [
  ...STATUTORY_SEEDS,
]

export type { TemplateSeed }
