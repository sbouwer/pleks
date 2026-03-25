export interface ParsedRow {
  [key: string]: string
}

export interface ParseError {
  row: number
  field: string
  message: string
  severity?: "error" | "warning"
}

export interface ImportResult {
  created: number
  skipped: number
  errors: ParseError[]
}

export function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"))
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: ParsedRow = {}
    headers.forEach((header, j) => {
      row[header] = (values[j] ?? "").trim()
    })
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }
  values.push(current)

  return values
}

export function detectTpnFormat(headers: string[]): boolean {
  const tpnHeaders = ["full name", "mobile number", "email address", "property name", "unit name"]
  const normalized = headers.map((h) => h.toLowerCase().trim())
  return tpnHeaders.filter((h) => normalized.includes(h)).length >= 3
}
