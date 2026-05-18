/**
 * app/api/admin/dev/searchworx-huru-spike/route.ts — Huru 4-step criminal record workflow spike
 *
 * Auth:   Admin HMAC token (enforced by proxy.ts)
 * Notes:  NOT for production use — admin/dev namespace only.
 *         ?step=1|2a|2b|3|crc|full  ?id=eva|goofy|stean|<id_number>  ?docGuid=<guid>
 *         step=crc — direct CriminalRecordCheck with Identifier=IDNumber + Surname field (no Step 1).
 *         ?diag=true — 5-test diagnostic battery to distinguish permissions gate vs wrong path/body.
 *         Step 1 on Stéan's ID resolves Interpretation A (SAPS-derived) vs B (HomeAffairs-derived).
 *         All Huru endpoints are under /Huru/* — separate service tree from credit/<bureau>/<product>.
 */
import { type NextRequest, NextResponse } from "next/server"
import { _mintToken, getSearchworxBaseUrl } from "@/lib/searchworx/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type Subject     = { idNumber: string; firstName: string; lastName: string }
type HuruResp    = { status: number; body: unknown; duration_ms: number }
type PollEntry   = { iteration: number; elapsed_ms: number; response: HuruResp }

// ─── Test ID registry ─────────────────────────────────────────────────────────

const SUBJECTS: Record<string, Subject> = {
  eva:   { idNumber: "6002100560184", firstName: "EVA",   lastName: "COMMERCE" },
  goofy: { idNumber: "7408285107080", firstName: "JUST",  lastName: "GOOFY"    },
  stean: { idNumber: "8404125024089", firstName: "STEAN", lastName: "BOUWER"   },
}

const POLL_INTERVAL_MS  = 5_000
const POLL_MAX_ATTEMPTS = 60   // 5 min ceiling

// ─── Low-level caller ─────────────────────────────────────────────────────────

async function huruPost(path: string, body: Record<string, unknown>): Promise<HuruResp> {
  const base  = getSearchworxBaseUrl().replace(/\/$/, "")
  const url   = `${base}/${path}/`
  const start = Date.now()
  const res   = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  })
  const duration_ms = Date.now() - start
  let parsed: unknown
  try   { parsed = await res.json() }
  catch { parsed = await res.text().catch(() => "") }
  return { status: res.status, body: parsed, duration_ms }
}

// ─── Field extractors ─────────────────────────────────────────────────────────

function extractProfileRef(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const top = raw as Record<string, unknown>
  const obj = (top.ResponseObject ?? top) as Record<string, unknown>
  if (typeof obj.ProfileRef === "string" && obj.ProfileRef) return obj.ProfileRef
  if (Array.isArray(obj) && obj.length > 0) {
    const first = obj[0] as Record<string, unknown>
    if (typeof first.ProfileRef === "string" && first.ProfileRef) return first.ProfileRef
  }
  return null
}

function extractDocGuid(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const top = raw as Record<string, unknown>
  const obj = (top.ResponseObject ?? top) as Record<string, unknown>
  if (typeof obj.DocumentGroupGUID === "string" && obj.DocumentGroupGUID) return obj.DocumentGroupGUID
  return null
}

function isTerminal(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false
  const top = raw as Record<string, unknown>
  const obj = (top.ResponseObject ?? top) as Record<string, unknown>
  let raw_s = ""
  if (typeof obj.Status === "string") raw_s = obj.Status
  else if (typeof obj.status === "string") raw_s = obj.status
  const s = raw_s.toLowerCase()
  return ["complete", "completed", "failed", "error", "errored"].includes(s)
}

// ─── Step runners ─────────────────────────────────────────────────────────────

async function runStep1(token: string, subject: Subject): Promise<{ result: Record<string, unknown>; profileRef: string | null }> {
  const body: Record<string, unknown> = { SessionToken: token, Reference: "PLEKS-HURU-SPIKE-001", IDNumber: subject.idNumber }
  const r    = await huruPost("Huru/Search/Fingerprints", body)
  const profileRef = extractProfileRef(r.body)
  console.log(`[huru-spike] Step 1 ${subject.idNumber}: ProfileRef=${profileRef ?? "null"}`)
  return {
    profileRef,
    result: {
      request:   { url: `${getSearchworxBaseUrl().replace(/\/$/, "")}/Huru/Search/Fingerprints/`, body },
      response:  r,
      extracted: {
        profileRef,
        scenario_indicator: profileRef
          ? "Scenario A — fingerprints loaded"
          : "Scenario B — no fingerprints on file",
      },
    },
  }
}

type Step2aOut = { result: Record<string, unknown>; docGuid: string | null }

async function runStep2a(token: string, subject: Subject, profileRef: string): Promise<Step2aOut> {
  type Attempt = { body_shape: string; request_body: Record<string, unknown>; response: HuruResp }
  const attempts: Attempt[] = []
  let docGuid: string | null = null
  let winningShape = "none"

  const base2a: Record<string, unknown> = {
    SessionToken: token, Reference: "PLEKS-HURU-SPIKE-001",
    IDNumber: subject.idNumber, FirstName: subject.firstName,
    LastName: subject.lastName, AFIS_premium: false,
  }

  const body_v1 = { ...base2a, ProfileRef: profileRef }
  const a1      = await huruPost("Huru/Request/CriminalRecordCheck", body_v1)
  attempts.push({ body_shape: "ProfileRef field", request_body: body_v1, response: a1 })
  docGuid = extractDocGuid(a1.body)
  if (docGuid) winningShape = "ProfileRef field"

  if (!docGuid && JSON.stringify(a1.body).toLowerCase().includes("identifier")) {
    const body_v2 = { ...base2a, Identifier: profileRef }
    const a2      = await huruPost("Huru/Request/CriminalRecordCheck", body_v2)
    attempts.push({ body_shape: "Identifier field", request_body: body_v2, response: a2 })
    docGuid = extractDocGuid(a2.body)
    if (docGuid) winningShape = "Identifier field"
  }

  console.log(`[huru-spike] Step 2a: GUID=${docGuid ?? "null"}, shape=${winningShape}`)
  return { docGuid, result: { attempts, winning_body_shape: winningShape, extracted: { documentGroupGUID: docGuid } } }
}

async function runStep2b(token: string, subject: Subject): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    SessionToken: token, Reference: "PLEKS-HURU-SPIKE-001",
    IDNumber: subject.idNumber, FirstName: subject.firstName, LastName: subject.lastName,
  }
  const r    = await huruPost("Huru/Request/Fingerprints", body)
  const guid = extractDocGuid(r.body)
  console.log(`[huru-spike] Step 2b: GUID=${guid ?? "null"}`)
  return {
    request:   { url: `${getSearchworxBaseUrl().replace(/\/$/, "")}/Huru/Request/Fingerprints/`, body },
    response:  r,
    extracted: { documentGroupGUID: guid },
    note:      "Informational only — Pleks does not build applicant-to-SAPS UX",
  }
}

async function runStep2aWithPoll(
  token: string, subject: Subject, profileRef: string,
  step: string, out: Record<string, unknown>,
): Promise<void> {
  const s2a = await runStep2a(token, subject, profileRef)
  out.step_2a_request_criminal_check = s2a.result
  if (step === "full" && s2a.docGuid) {
    out.step_3_poll_status = await runStep3Poll(token, s2a.docGuid)
  }
}

async function runStep3Poll(token: string, docGuid: string): Promise<Record<string, unknown>> {
  const polls: PollEntry[] = []
  const wallStart = Date.now()

  for (let i = 1; i <= POLL_MAX_ATTEMPTS; i++) {
    if (i > 1) await new Promise<void>(r => setTimeout(r, POLL_INTERVAL_MS))
    const body: Record<string, unknown> = { SessionToken: token, DocumentGroupGUID: docGuid }
    const r          = await huruPost("Huru/GetStatus/CriminalRecordCheck", body)
    const elapsed_ms = Date.now() - wallStart
    polls.push({ iteration: i, elapsed_ms, response: r })
    console.log(`[huru-spike] Poll ${i}: elapsed=${elapsed_ms}ms, terminal=${isTerminal(r.body)}`)
    if (isTerminal(r.body)) break
  }

  const last = polls.at(-1)
  return { polls, total_wallclock_ms: last?.elapsed_ms ?? 0, terminal_state: last?.response.body ?? null }
}

async function runCRCDirect(token: string, subject: Subject): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    SessionToken: token, Reference: "PLEKS-HURU-SPIKE-DIAG-002",
    Identifier:   subject.idNumber, IDNumber: subject.idNumber,
    FirstName:    subject.firstName, Surname: subject.lastName,
    AFIS_premium: false,
  }
  const r    = await huruPost("Huru/Request/CriminalRecordCheck", body)
  const guid = extractDocGuid(r.body)
  console.log(`[huru-spike] CRC-direct: status=${r.status}, guid=${guid ?? "null"}`)
  return {
    request:   { url: `${getSearchworxBaseUrl().replace(/\/$/, "")}/Huru/Request/CriminalRecordCheck/`, body },
    response:  r,
    extracted: { documentGroupGUID: guid },
    note:      "Identifier=IDNumber (no prior fingerprint lookup), Surname field (not LastName)",
  }
}

// ─── Diagnostic battery ───────────────────────────────────────────────────────

async function rawPost(
  url: string,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<HuruResp> {
  const start = Date.now()
  const res   = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body:    JSON.stringify(body),
  })
  const duration_ms = Date.now() - start
  let parsed: unknown
  try   { parsed = await res.json() }
  catch { parsed = await res.text().catch(() => "") }
  return { status: res.status, body: parsed, duration_ms }
}

type DiagEntry = { label: string; url?: string; response: HuruResp }

async function diagTest1(token: string, subject: Subject, base: string): Promise<Record<string, unknown>> {
  const body = { SessionToken: token, Reference: "PLEKS-HURU-DIAG", IDNumber: subject.idNumber }
  const variants: DiagEntry[] = await Promise.all([
    rawPost(`${base}/Huru/Search/Fingerprints/`,  body).then(r => ({ label: "canonical_trailing_slash",  url: `${base}/Huru/Search/Fingerprints/`,  response: r })),
    rawPost(`${base}/Huru/Search/Fingerprints`,   body).then(r => ({ label: "no_trailing_slash",         url: `${base}/Huru/Search/Fingerprints`,   response: r })),
    rawPost(`${base}/huru/search/fingerprints/`,  body).then(r => ({ label: "lowercase",                 url: `${base}/huru/search/fingerprints/`,  response: r })),
    rawPost(`${base}/HuruSearchFingerprints/`,    body).then(r => ({ label: "merged_no_separators",      url: `${base}/HuruSearchFingerprints/`,    response: r })),
    rawPost(`${base}/Huru/FICTIONAL_CONTROL/`,    body).then(r => ({ label: "fictional_control",         url: `${base}/Huru/FICTIONAL_CONTROL/`,    response: r })),
  ])
  return { label: "path_variants", variants }
}

async function diagTest2(token: string, subject: Subject, base: string): Promise<Record<string, unknown>> {
  const url   = `${base}/Huru/Search/Fingerprints/`
  const base2 = { SessionToken: token, IDNumber: subject.idNumber }
  const shapes: DiagEntry[] = await Promise.all([
    rawPost(url, base2).then(r => ({ label: "minimal_no_reference", response: r })),
    rawPost(url, { ...base2, Reference: "PLEKS-HURU-DIAG" }).then(r => ({ label: "with_reference", response: r })),
    rawPost(url, { ...base2, Reference: "PLEKS-HURU-DIAG", FirstName: subject.firstName, LastName: subject.lastName }).then(r => ({ label: "with_name", response: r })),
    rawPost(url, { ...base2, Reference: "PLEKS-HURU-DIAG", FirstName: subject.firstName, LastName: subject.lastName, AFIS_premium: false }).then(r => ({ label: "full_body", response: r })),
    rawPost(url, { sessionToken: token, reference: "PLEKS-HURU-DIAG", idNumber: subject.idNumber }).then(r => ({ label: "camelcase_fields", response: r })),
  ])
  return { label: "body_shapes", shapes }
}

async function diagTest3(token: string, subject: Subject, base: string): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    SessionToken: token, Reference: "PLEKS-HURU-DIAG",
    IDNumber: subject.idNumber, FirstName: subject.firstName, LastName: subject.lastName,
  }
  const endpoints: DiagEntry[] = await Promise.all([
    rawPost(`${base}/Huru/Search/Fingerprints/`,           body).then(r => ({ label: "Search_Fingerprints",          response: r })),
    rawPost(`${base}/Huru/Request/Fingerprints/`,          body).then(r => ({ label: "Request_Fingerprints",         response: r })),
    rawPost(`${base}/Huru/Request/CriminalRecordCheck/`,   { ...body, AFIS_premium: false }).then(r => ({ label: "Request_CriminalRecordCheck",  response: r })),
    rawPost(`${base}/Huru/GetStatus/CriminalRecordCheck/`, { SessionToken: token, DocumentGroupGUID: "DIAG-NO-GUID" }).then(r => ({ label: "GetStatus_CriminalRecordCheck", response: r })),
  ])
  return { label: "sister_endpoints", endpoints }
}

async function diagTest4(token: string, base: string): Promise<Record<string, unknown>> {
  const r = await rawPost(`${base}/auth/validatetoken/`, { SessionToken: token })
  return {
    label:    "auth_probe_validatetoken",
    response: r,
    note:     "Look for permissions array, account flags, or product access list in response body",
  }
}

async function diagTest5(token: string, subject: Subject, base: string): Promise<Record<string, unknown>> {
  const url  = `${base}/Huru/Search/Fingerprints/`
  const body = { SessionToken: token, Reference: "PLEKS-HURU-DIAG", IDNumber: subject.idNumber }
  const variants: DiagEntry[] = await Promise.all([
    rawPost(url, body).then(r                                               => ({ label: "default_content_type_only",   response: r })),
    rawPost(url, body, { Accept: "application/json" }).then(r               => ({ label: "with_accept_json",            response: r })),
    rawPost(url, body, { "X-Client-Version": "1.0" }).then(r                => ({ label: "with_client_version_header", response: r })),
  ])
  return { label: "header_variations", variants }
}

function diagVerdict(t1: Record<string, unknown>, t3: Record<string, unknown>): Record<string, unknown> {
  const variants  = (t1.variants  as DiagEntry[]) ?? []
  const endpoints = (t3.endpoints as DiagEntry[]) ?? []

  const canonical   = variants.find(v => v.label === "canonical_trailing_slash")
  const fictional   = variants.find(v => v.label === "fictional_control")
  const canonicalMsg = (canonical?.response.body as Record<string, unknown>)?.ResponseMessage
  const fictionalMsg = (fictional?.response.body as Record<string, unknown>)?.ResponseMessage

  let root_cause: string
  let interpretation: string

  if (canonical?.response.status !== 200) {
    root_cause     = "wrong_path_or_transport_error"
    interpretation = `Canonical path returned HTTP ${canonical?.response.status ?? "unknown"} — URL structure may be wrong.`
  } else if (fictional?.response.status === 200 && canonicalMsg === fictionalMsg) {
    root_cause     = "account_permission_gate_confirmed"
    interpretation = "Both canonical and fictional paths return HTTP 200 with the same message — namespace-level account permission flag, not a URL or body problem."
  } else {
    root_cause     = "account_permission_gate_likely"
    interpretation = "Canonical returns HTTP 200/'not enabled'; fictional returns non-200. Permission gate fires before per-path routing."
  }

  const msgs       = endpoints.map(e => (e.response.body as Record<string, unknown>)?.ResponseMessage)
  const consistent = msgs.every(m => m === msgs[0])

  return {
    root_cause,
    interpretation,
    sister_endpoints_consistent: consistent,
    sister_message: msgs[0] ?? null,
    action: root_cause.includes("account_permission_gate")
      ? "Ask John to enable Huru product access on the UAT API account."
      : "Investigate URL path and body structure in the spike route.",
  }
}

async function runDiagnostics(token: string, subject: Subject): Promise<Record<string, unknown>> {
  const base = getSearchworxBaseUrl().replace(/\/$/, "")
  const [t1, t2, t3, t4, t5] = await Promise.all([
    diagTest1(token, subject, base),
    diagTest2(token, subject, base),
    diagTest3(token, subject, base),
    diagTest4(token, base),
    diagTest5(token, subject, base),
  ])
  return {
    mode:    "diagnostic",
    subject,
    tests:   { test1_path_variants: t1, test2_body_shapes: t2, test3_sister_endpoints: t3, test4_auth_probe: t4, test5_header_variations: t5 },
    verdict: diagVerdict(t1, t3),
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not available in production", { status: 404 })
  }

  const sp      = req.nextUrl.searchParams
  const step    = sp.get("step")    ?? "1"
  const idAlias = sp.get("id")      ?? "eva"
  const docGuid = sp.get("docGuid") ?? null

  const subject: Subject = SUBJECTS[idAlias] ?? { idNumber: idAlias, firstName: "UNKNOWN", lastName: "UNKNOWN" }

  let token: string
  try { token = await _mintToken() }
  catch (err) { return NextResponse.json({ error: "Token mint failed", detail: String(err) }, { status: 500 }) }

  if (sp.get("diag") === "true") {
    return NextResponse.json(await runDiagnostics(token, subject))
  }

  if (step === "3" && !docGuid) {
    return NextResponse.json({ error: "?docGuid= is required for step=3" }, { status: 400 })
  }

  const out: Record<string, unknown> = { step, subject: { alias: idAlias, ...subject }, scenario: "unknown" }

  // Direct CRC probe — no Step 1 fingerprint lookup
  if (step === "crc") {
    out.crc_direct = await runCRCDirect(token, subject)
    return NextResponse.json(out)
  }

  // Step 1
  let profileRef: string | null = null
  if (["1", "2a", "2b", "full"].includes(step)) {
    const s1 = await runStep1(token, subject)
    out.step_1_search_fingerprints = s1.result
    profileRef = s1.profileRef
  }
  out.scenario = profileRef ? "A" : "B"

  // Step 2a + optional Step 3 poll
  if ((step === "2a" || step === "full") && profileRef) {
    await runStep2aWithPoll(token, subject, profileRef, step, out)
  }

  // Step 2b (Scenario B — informational)
  if (step === "2b" || (step === "full" && !profileRef)) {
    out.step_2b_request_fingerprints = await runStep2b(token, subject)
  }

  // Step 3 single-poll (docGuid guaranteed non-null by early return above)
  if (step === "3") {
    const guid = docGuid ?? ""
    const r3   = await huruPost("Huru/GetStatus/CriminalRecordCheck", {
      SessionToken: token, DocumentGroupGUID: guid,
    })
    out.step_3_poll_status = {
      polls: [{ iteration: 1, elapsed_ms: 0, response: r3 }],
      total_wallclock_ms: r3.duration_ms,
      terminal_state: isTerminal(r3.body) ? "terminal" : "still-pending",
    }
  }

  console.log("[huru-spike] done:", JSON.stringify({ step, id: idAlias, scenario: out.scenario }))
  return NextResponse.json(out)
}
