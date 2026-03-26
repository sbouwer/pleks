import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { matchColumns } from "@/lib/import/columnMapper"
import { detectEntities } from "@/lib/import/detectEntities"
import { isTpnFormat } from "@/lib/import/detectFormat"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { filename, headers, sampleRows } = await req.json()

  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return NextResponse.json({ error: "No headers found in file" }, { status: 400 })
  }

  // Phase 1: String matching (instant)
  const columnSuggestions = matchColumns(headers)

  // Phase 2: Detect entities from matched columns
  const detectedEntities = detectEntities(columnSuggestions)

  // Check for TPN format
  const tpnFormat = isTpnFormat(headers)

  // Count rows per entity type
  const rowCount = (sampleRows as Record<string, string>[])?.length ?? 0

  // Find unmapped columns
  const unmappedColumns = columnSuggestions
    .filter((s) => !s.field)
    .map((s) => s.column)

  return NextResponse.json({
    detectedEntities,
    rowCounts: {
      tenant: detectedEntities.hasTenant ? rowCount : 0,
      unit: detectedEntities.hasUnit ? rowCount : 0,
      lease: detectedEntities.hasLease ? rowCount : 0,
    },
    isTpnFormat: tpnFormat,
    columnSuggestions,
    unmappedColumns,
    filename,
  })
}
