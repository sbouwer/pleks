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

function findHeaderRow(sheet: XLSX.WorkSheet): { headerRowIndex: number; headers: string[] } {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1")
  for (let r = range.s.r; r <= Math.min(range.e.r, 9); r++) {
    const rowValues: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      if (cell?.v != null && String(cell.v).trim() !== "") {
        rowValues.push(String(cell.v).trim())
      }
    }
    if (rowValues.length >= 3) {
      const headers: string[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = sheet[addr]
        const val = cell?.v != null ? String(cell.v).trim() : ""
        if (val !== "") headers.push(val)
      }
      return { headerRowIndex: r, headers }
    }
  }
  return { headerRowIndex: 0, headers: [] }
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

  const { headerRowIndex, headers } = findHeaderRow(sheet)

  // Read data rows starting after the detected header row
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: headers,
    range: headerRowIndex + 1,
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

  return { headers, rows }
}
