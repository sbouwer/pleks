/**
 * lib/searchworx/suppliers.ts — Searchworx DataSupplier ID registry (ADDENDUM_14H v3 §N)
 *
 * Notes:  Numeric DataSupplier IDs appear in ResponseObject.SearchInformation.DataSupplier.
 *         Use brandLabel for all agent/applicant-facing surfaces — DataSupplierDesc is the
 *         internal Searchworx label (e.g. "CompuScan" → brandLabel "Experian Sigma").
 */

export const SEARCHWORX_DATA_SUPPLIERS = {
   2: { code: "xds",        description: "XpertDecisionSystems",  brandLabel: "XDS"           },
   5: { code: "transunion", description: "TransUnion",            brandLabel: "TransUnion"    },
   6: { code: "datasearch", description: "DataSearch",            brandLabel: "DataSearch"    },
   9: { code: "compuscan",  description: "CompuScan",             brandLabel: "Experian Sigma" },
  16: { code: "vericred",   description: "VeriCred",              brandLabel: "VeriCred"      },
} as const

export type SearchworxDataSupplierId = keyof typeof SEARCHWORX_DATA_SUPPLIERS

export function searchworxSupplierBrandLabel(id: number): string {
  const supplier = SEARCHWORX_DATA_SUPPLIERS[id as SearchworxDataSupplierId]
  return supplier?.brandLabel ?? `Supplier ${id}`
}
