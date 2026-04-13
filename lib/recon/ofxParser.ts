/**
 * OFX/QFX parser for SA bank statements.
 *
 * OFX is SGML-based (not always well-formed XML). SA banks export it from
 * their online banking portals under "Download statement" → "OFX" or "Money".
 *
 * We use a regex-based SGML approach rather than an XML parser because many
 * SA bank OFX files use unclosed SGML shorthand tags.
 */

export interface ParsedTransaction {
  externalId: string         // FITID — used for dedup
  date: string               // YYYY-MM-DD
  amountCents: number        // positive = credit, negative = debit
  direction: "credit" | "debit"
  descriptionRaw: string     // NAME or MEMO
  referenceRaw: string       // MEMO (or NAME if MEMO absent)
  descriptionClean: string
  referenceClean: string
  balanceCents?: number
}

export interface OFXParseResult {
  transactions: ParsedTransaction[]
  accountNumber?: string
  bankId?: string
  periodFrom?: string        // YYYY-MM-DD
  periodTo?: string          // YYYY-MM-DD
  closingBalanceCents?: number
  error?: string
}

function extractTag(content: string, tag: string): string | null {
  // Handles both <TAG>value</TAG> and <TAG>value\n style
  const re = new RegExp(`<${tag}>([^<\r\n]+)`, "i")
  const m = content.match(re)
  return m ? m[1].trim() : null
}


function parseOFXDate(raw: string): string {
  // OFX dates: 20260403 or 20260403120000[-5:EST] → YYYY-MM-DD
  const digits = raw.replace(/[^\d]/g, "").slice(0, 8)
  if (digits.length < 8) return raw
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function cleanDescription(raw: string): string {
  return raw
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[^\w\s.,&()/-]/g, "")
    .trim()
    .toUpperCase()
}

function extractTransactionBlocks(content: string): string[] {
  const blocks: string[] = []
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    blocks.push(m[1])
  }
  if (blocks.length === 0) {
    // SGML style: no closing tags — split by <STMTTRN>
    const parts = content.split(/<STMTTRN>/i)
    for (let i = 1; i < parts.length; i++) {
      // Take until next major tag or end
      const chunk = parts[i].split(/<\/BANKTRANLIST>/i)[0]
      blocks.push(chunk)
    }
  }
  return blocks
}

export function parseOFX(raw: string): OFXParseResult {
  try {
    const content = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n")

    const accountNumber = extractTag(content, "ACCTID") ?? undefined
    const bankId = extractTag(content, "BANKID") ?? undefined
    const dtStart = extractTag(content, "DTSTART")
    const dtEnd = extractTag(content, "DTEND")
    const balAmt = extractTag(content, "BALAMT")

    const periodFrom = dtStart ? parseOFXDate(dtStart) : undefined
    const periodTo = dtEnd ? parseOFXDate(dtEnd) : undefined
    const closingBalanceCents = balAmt
      ? Math.round(parseFloat(balAmt) * 100)
      : undefined

    const blocks = extractTransactionBlocks(content)
    const transactions: ParsedTransaction[] = []

    for (const block of blocks) {
      const fitid = extractTag(block, "FITID")
      const dtposted = extractTag(block, "DTPOSTED")
      const trnamt = extractTag(block, "TRNAMT")
      const trntype = extractTag(block, "TRNTYPE")
      const name = extractTag(block, "NAME") ?? ""
      const memo = extractTag(block, "MEMO") ?? ""

      if (!fitid || !dtposted || !trnamt) continue

      const amount = parseFloat(trnamt)
      if (isNaN(amount)) continue

      const direction: "credit" | "debit" =
        trntype?.toUpperCase() === "CREDIT" || amount > 0 ? "credit" : "debit"
      const amountCents = Math.round(Math.abs(amount) * 100)
      const signedCents = direction === "credit" ? amountCents : -amountCents

      const descriptionRaw = name || memo
      const referenceRaw = memo || name

      transactions.push({
        externalId: fitid,
        date: parseOFXDate(dtposted),
        amountCents: signedCents,
        direction,
        descriptionRaw,
        referenceRaw,
        descriptionClean: cleanDescription(descriptionRaw),
        referenceClean: cleanDescription(referenceRaw),
      })
    }

    return { transactions, accountNumber, bankId, periodFrom, periodTo, closingBalanceCents }
  } catch (err) {
    return { transactions: [], error: String(err) }
  }
}
