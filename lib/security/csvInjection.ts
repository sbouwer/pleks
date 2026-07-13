/**
 * lib/security/csvInjection.ts — the SSOT for CSV formula injection, on both sides of the door
 *
 * Notes:  A cell whose value begins with `=`, `+`, `@`, TAB or CR — or with a `-` that is not a number — is
 *         EXECUTED as a formula by Excel, LibreOffice and Google Sheets the moment the file is opened. It is
 *         not a parsing quirk; it is the documented behaviour of every spreadsheet in use.
 *
 *         WHOSE PROBLEM IT IS. Not ours, and not the person who typed it — the NEXT READER's. An agency
 *         exports its own tenant list; the bookkeeper opens it; the formula runs on the bookkeeper's machine.
 *         `=HYPERLINK("http://…"&A1,"Click for refund")` exfiltrates the neighbouring cell on one click.
 *
 *         WHY IT IS NOT AN IMPORT PROBLEM. The importer was hardened first, and that was the wrong boundary to
 *         stop at. A tenant types `=HYPERLINK(...)` as their name in the application PORTAL; a contractor puts
 *         one in an invoice description. No import is involved anywhere. The class lives at EVERY point where
 *         attacker-controlled text leaves Pleks as a spreadsheet — and every free-text field we store is
 *         attacker-controlled, because anyone who can get onto a rent roll can type into one.
 *
 *         So: neutralise on the way IN (`lib/import` strips and flags — the row is being validated anyway),
 *         and ESCAPE on the way OUT (here). Import-side protects the data we ingest. Export-side protects every
 *         customer forever, regardless of how the text got in.
 *
 *         ESCAPE, DO NOT STRIP, on export. The value is the agency's real data and must survive the round trip
 *         — a tenant legitimately called "-Smith" keeps their name. A leading `'` is the standard neutraliser
 *         (OWASP): Excel renders the text and refuses to evaluate it.
 */

/** Leading characters a spreadsheet treats as the start of a formula. */
const FORMULA_LEAD = /^[=@\t\r]/

/** `+` and `-` lead a formula ONLY when what follows is not a number. See the note below. */
const SIGN_LEAD = /^[+-]/

/**
 * Does this value begin a formula?
 *
 * THE SIGNS ARE THE TRAP, and getting them wrong is worse than the bug being defended against.
 *
 *   `-6600.50`       is a NEGATIVE AMOUNT. Stripping the minus turns it POSITIVE — a countermeasure that
 *                    introduces the vulnerability it defends against. The poison harness caught that one.
 *   `+27821234567`   is a PHONE NUMBER in E.164 — the format every SA agency export emits. Stripping the plus
 *                    leaves `27821234567`, which is neither local (`082…`) nor international, and every SMS and
 *                    WhatsApp path downstream now holds a number that reaches nobody. The pre-PR walk caught
 *                    that one, after I had already shipped the minus fix and congratulated myself on it.
 *
 * Same trap, twice, and I only guarded one half of it. So the rule is one rule, applied to BOTH signs: a
 * leading `+` or `-` begins a formula only when what follows is NOT A NUMBER.
 *
 *   "+27821234567" → Number(…) is finite → NOT a formula. Untouched.
 *   "-6600.50"     → Number(…) is finite → NOT a formula. Untouched.
 *   "+1+cmd|'/c calc'!A0" → NaN → IS a formula.
 *   "-1+cmd|'/c calc'!A0" → NaN → IS a formula.
 */
export function looksLikeFormula(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (FORMULA_LEAD.test(v)) return true
  if (!SIGN_LEAD.test(v)) return false

  // An ALLOWLIST of what a signed number or phone number may contain — not `Number()` coercion, which cannot
  // tell a phone from an expression: `Number("+27-82-123-4567")` is NaN, so a coercion test calls a perfectly
  // ordinary hyphenated phone number a formula and eats it.
  //
  // Digits, spaces, hyphens, dots, commas, parentheses, slashes and signs are the entire vocabulary of a
  // number, an amount and a phone number in every format an SA agency writes them:
  //     -6600.50    -1 234,56    +27821234567    +27 82 123 4567    +27-82-123-4567    +27 (82) 123 4567
  //
  // An ATTACK cannot live in that vocabulary. Every payload needs a letter or a symbol outside it —
  // `+1+cmd|'/c calc'!A0`, `@SUM(…)`, `=HYPERLINK(…)` — so a leading sign followed only by number-vocabulary
  // is data, and anything else is a formula.
  return !/^[+-][\d\s().,\-/+]*$/.test(v)
}

/** Strip the leading formula character(s). For the IMPORT side, where the row is validated and flagged anyway. */
export function neutraliseFormula(value: string): string {
  let out = value.trim()
  while (looksLikeFormula(out)) out = out.slice(1).trim()
  return out
}

/**
 * Render one cell for a CSV we EMIT: formula-neutralised, then RFC 4180 quoted.
 *
 * Both halves are required and they are different problems:
 *   · the leading `'` stops Excel EXECUTING the cell
 *   · the quoting stops a comma or newline inside the value BREAKING THE ROW (which `buildTrustLedgerCSV` did
 *     not do at all for `reference` and `property_name` — an agency property called "Unit 3, Sea Point" split
 *     the row in two and shifted every column after it)
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ""

  let s = String(value)
  if (looksLikeFormula(s)) s = `'${s}`

  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`
  return s
}
