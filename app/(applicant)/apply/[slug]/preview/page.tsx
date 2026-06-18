"use client"

/**
 * app/(applicant)/apply/[slug]/preview/page.tsx — VISUAL-LAYOUT PREVIEW of the redesigned applicant
 * pre-screening page (design handoff: brief/design/project/design_handoff_application_page).
 *
 * Route:  /apply/[slug]/preview
 * Auth:   public (token-gated prefix) — preview only
 * Notes:  Layout/chrome pass ONLY — left rail (property + agent + progress) and the right "door" panel
 *         (tab bar + EMPTY step section + footer). Sample/representative data; renders full-viewport
 *         (fixed inset-0) to escape the narrow (applicant) layout wrapper. Real data + the step bodies +
 *         the add-tenant-matched capture come in a later pass. Uses the app grammar: .stoep / .btn-pleks /
 *         --ink/--paper/--amber. Not wired into the live flow.
 */

const MONO = "var(--font-mono, 'JetBrains Mono', monospace)"

const STEPS = [
  { label: "Personal details", detail: "Residential lease" },
  { label: "Applicants", detail: "Not started" },
  { label: "Documents", detail: "Not started" },
  { label: "Score", detail: "Not started" },
]

function Eyebrow({ children, className = "" }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <span className={`text-[9.5px] uppercase tracking-[0.12em] text-[var(--ink-mute,#7a7d85)] ${className}`} style={{ fontFamily: MONO }}>
      {children}
    </span>
  )
}

// Step-state → style/label helpers (kept flat — no nested ternaries).
function stepCircleStyle(done: boolean, cur: boolean): React.CSSProperties {
  if (done) return { background: "var(--ink)", color: "var(--paper)" }
  if (cur) return { background: "var(--amber-wash,#fdf3e0)", border: "1.6px solid var(--amber)" }
  return { border: "1.6px solid var(--rule-strong,#cfccc2)" }
}
function stepCircleInner(done: boolean, cur: boolean): React.ReactNode {
  if (done) return "✓"
  if (cur) return <span className="size-1.5 rounded-full" style={{ background: "var(--amber)" }} />
  return null
}
function stepLabelClass(done: boolean, cur: boolean): string {
  if (cur) return "font-semibold text-[var(--ink)]"
  if (done) return "font-medium text-[var(--ink)]"
  return "font-medium text-[var(--ink-mute,#7a7d85)]"
}
function tabClass(done: boolean, cur: boolean): string {
  if (cur) return "stoep font-semibold"
  if (done) return "text-[var(--ink)]"
  return "text-[var(--ink-mute,#7a7d85)]"
}

function Fact({ k, v, big = false }: Readonly<{ k: string; v: string; big?: boolean }>) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{k}</Eyebrow>
      <span className={big ? "text-[23px] leading-none" : "text-[14px]"} style={{ fontFamily: big ? MONO : undefined, fontWeight: 500 }}>{v}</span>
    </div>
  )
}

function PropertyCard() {
  return (
    <div className="bg-[var(--paper-raised,#fff)] border border-[var(--rule,#e3e0d8)]">
      <div className="relative h-20 bg-[repeating-linear-gradient(135deg,#eceae3_0_8px,#f4f2ec_8px_16px)]">
        <span className="absolute bottom-2 left-3 bg-[var(--paper,#fbfaf7)] px-1.5 py-0.5 border border-[var(--rule,#e3e0d8)]" style={{ fontFamily: MONO, fontSize: 9 }}>{"// photo · Sea Point"}</span>
      </div>
      <div className="px-[22px] pt-[15px] pb-[17px] space-y-3">
        <div>
          <p className="text-[19px] font-semibold leading-tight tracking-[-0.018em]">2 Bedroom Apartment</p>
          <p className="text-[14px] text-[var(--ink-soft,#54565c)]">The Equinox · Sea Point</p>
          <p style={{ fontFamily: MONO }} className="text-[11px] text-[var(--ink-mute,#7a7d85)] mt-0.5">12 Marine Rd, Sea Point, 8005</p>
        </div>
        <div className="flex border border-[var(--rule,#e3e0d8)] divide-x divide-[var(--rule,#e3e0d8)]">
          <div className="flex-1 px-3 py-2.5"><Fact k="Rent / month" v="R 14 500" big /></div>
          <div className="flex-1 px-3 py-2.5"><Fact k="Deposit" v="R 14 500" big /></div>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-3">
          <Fact k="Available" v="1 Aug 2026" />
          <Fact k="Lease term" v="12 months" />
          <Fact k="Size" v="68 m²" />
          <Fact k="Layout" v="2 bed · 1 bath" />
          <Fact k="Parking" v="1 basement bay" />
          <Fact k="Furnished" v="Unfurnished" />
        </div>
      </div>
    </div>
  )
}

function AgentCard() {
  return (
    <div className="bg-[var(--paper-raised,#fff)] border border-[var(--rule,#e3e0d8)] px-[22px] py-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--paper)] text-[13px] font-semibold">AP</div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">Annelise Pretorius</p>
          <p className="text-[12px] text-[var(--ink-soft,#54565c)]">Rox &amp; Co Property Management</p>
        </div>
        <span className="text-[9.5px] uppercase tracking-[0.08em] text-[var(--amber-ink,#6b4a12)] border-b-2 border-[var(--amber)] pb-0.5" style={{ fontFamily: MONO }}>PPRA FFC · 2025-0041</span>
      </div>
      <div className="border-t border-[var(--rule,#e3e0d8)] pt-3 grid grid-cols-2 gap-3">
        <div><Eyebrow>Call</Eyebrow><p style={{ fontFamily: MONO }} className="text-[12.5px] mt-0.5">082 551 0934</p></div>
        <div><Eyebrow>Email</Eyebrow><p style={{ fontFamily: MONO }} className="text-[12.5px] mt-0.5">annelise@roxco.co.za</p></div>
      </div>
    </div>
  )
}

function ProgressList({ step }: Readonly<{ step: number }>) {
  return (
    <div className="bg-[var(--paper-raised,#fff)] border border-[var(--rule,#e3e0d8)] px-[22px] py-4">
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>Your application</Eyebrow>
        <Eyebrow>saved · {step + 1}/4</Eyebrow>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const done = i < step
          const cur = i === step
          const faded = i > step
          return (
            <li key={s.label} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px]" style={stepCircleStyle(done, cur)}>
                {stepCircleInner(done, cur)}
              </span>
              <div className="min-w-0">
                <p className={`text-[13px] ${stepLabelClass(done, cur)}`}>{s.label}</p>
                <p className={`text-[11px] ${faded ? "text-[var(--ink-faint,#a8a59c)]" : "text-[var(--ink-soft,#54565c)]"}`} style={{ fontFamily: MONO }}>{faded ? "Not started" : s.detail}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function TabBar({ step }: Readonly<{ step: number }>) {
  return (
    <div className="flex gap-6 border-b border-[var(--rule,#e3e0d8)]">
      {STEPS.map((s, i) => {
        const done = i < step
        const cur = i === step
        return (
          <span key={s.label} className={`flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(done, cur)}`}>
            <span
              className="flex size-[18px] items-center justify-center rounded-full text-[10px]"
              style={done ? { background: "var(--ink)", color: "var(--paper)" } : { border: "1.4px solid var(--rule-strong,#cfccc2)" }}
            >
              {done ? "✓" : i + 1}
            </span>
            {s.label}
          </span>
        )
      })}
    </div>
  )
}

export default function ApplyPreviewPage() {
  const step = 0
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[var(--paper,#fbfaf7)] text-[var(--ink)]" style={{ fontFamily: "var(--font-sans, 'Inter Tight', system-ui)" }}>
      {/* Top bar */}
      <header className="flex h-[58px] items-center justify-between border-b border-[var(--rule,#e3e0d8)] px-11 bg-[oklch(0.99_0.004_85_/_0.7)]">
        <div className="flex items-center gap-3">
          <span className="text-[16px] tracking-[-0.04em]"><span className="font-semibold">pleks</span><span style={{ fontFamily: MONO }} className="text-[var(--ink-soft,#54565c)]">.co.za</span></span>
          <span className="h-4 w-px bg-[var(--rule,#e3e0d8)]" />
          <Eyebrow>Rental application</Eyebrow>
        </div>
        <div className="flex items-center gap-2">
          <Eyebrow>Ref · SP-304</Eyebrow>
          <span className="size-3.5 text-[var(--ink-mute,#7a7d85)]">🛡</span>
          <Eyebrow>Encrypted</Eyebrow>
        </div>
      </header>

      {/* Content row */}
      <div className="mx-auto flex max-w-[1320px] gap-8 px-11 pt-[26px] pb-10">
        {/* Left rail */}
        <aside className="flex w-[446px] shrink-0 flex-col gap-3">
          <PropertyCard />
          <AgentCard />
          <ProgressList step={step} />
        </aside>

        {/* Right "door" panel */}
        <main className="relative flex-1">
          <div className="relative border-2 border-b-0 border-[var(--ink)] bg-[var(--paper-raised,#fff)] px-[38px] pt-[22px] pb-[26px] min-h-[560px] flex flex-col">
            {/* amber knob */}
            <span className="absolute right-[18px] top-[26px] size-[7px] rounded-full" style={{ background: "var(--amber)" }} />
            <TabBar step={step} />

            {/* EMPTY step section — bodies come in a later pass */}
            <div className="flex flex-1 items-center justify-center py-16">
              <p style={{ fontFamily: MONO }} className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-faint,#a8a59c)]">
                step {step + 1} content · {STEPS[step].label}
              </p>
            </div>

            {/* Step footer */}
            <div className="flex items-center justify-between border-t border-[var(--rule,#e3e0d8)] pt-3">
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-soft,#54565c)]" style={{ fontFamily: MONO }}>
                <span className="size-1.5 rounded-full" style={{ background: "var(--positive,#2f9e63)" }} /> Saved automatically · step {step + 1} of 4
              </span>
              <span className="text-[11px] text-[var(--ink-soft,#54565c)]" style={{ fontFamily: MONO }}>Questions? Annelise · 082 551 0934</span>
            </div>
          </div>
          {/* 6px amber baseline bar (overhangs ±2px) */}
          <span className="absolute -bottom-1.5 -left-0.5 -right-0.5 h-1.5" style={{ background: "var(--amber)" }} />
        </main>
      </div>
    </div>
  )
}
