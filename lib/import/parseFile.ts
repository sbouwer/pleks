import Papa from "papaparse"
import * as XLSX from "xlsx"

export interface ParsedFileResult {
  headers: string[]
  rows: Record<string, string>[]
}

export async function parseFile(file: File): Promise<ParsedFileResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith(".csv")) {
    return parseCSVFile(file)
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXLSXFile(file)
  }

  throw new Error(`Unsupported file type: ${name}. Please upload a .csv or .xlsx file.`)
}

async function parseCSVFile(file: File): Promise<ParsedFileResult> {
  const text = await file.text()

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? []
        const rows = results.data
        resolve({ headers, rows })
      },
      error(err: Error) {
        reject(new Error(`CSV parse error: ${err.message}`))
      },
    })
  })
}

async function parseXLSXFile(file: File): Promise<ParsedFileResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("XLSX file has no sheets")
  }

  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    throw new Error("Could not read first sheet")
  }

  // Get raw JSON with headers from first row
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  })

  // Convert all values to strings
  const rows: Record<string, string>[] = rawRows.map((row) => {
    const stringRow: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      stringRow[key] = value == null ? "" : String(value)
    }
    return stringRow
  })

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

  return { headers, rows }
}
