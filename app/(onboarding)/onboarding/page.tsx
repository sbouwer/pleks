"use client"

/**
 * app/(onboarding)/onboarding/page.tsx — Multi-step agency onboarding wizard
 *
 * Route:  /onboarding
 * Auth:   authenticated (manifest: skipOrgCheck — org does not exist yet)
 * Data:   createAccountAndOrg() server action; writes org, user_orgs, subscription, tos_acceptances
 * Notes:  §A — ToS checkbox required on every completion surface; CTA disabled until ticked.
 *         §E — bank/deposit step removed from all paths; trust-account setup moves to dashboard checklist.
 *         §B — on success, redirects to /auth/resolver?redirect=/dashboard; resolver routes through
 *              Welcome or directly depending on welcome_seen + assurance state.
 *              exploring path redirects to /demo (no account created, no welcome).
 */

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createAccountAndOrg, type OnboardingData } from "@/lib/actions/onboarding"
import { toast } from "sonner"

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://pleks.co.za"
import { ArrowLeft, ArrowRight, Plus, X, Building2, User, Users, Heart, Eye, EyeOff, Info } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type UserType = "owner" | "agent" | "agency" | "family" | "exploring"

// ── Micro-components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ob-field">
      <label className="ob-label">
        {label}
        {children}
      </label>
    </div>
  )
}

function Btn({
  children, onClick, disabled = false, variant = "primary", style,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  variant?: "primary" | "ghost"; style?: React.CSSProperties
}) {
  if (variant === "ghost") {
    return (
      <button type="button" className="ob-cta-ghost" style={style} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    )
  }
  // Primary — brand-signature amber-bar CTA (ink fill, amber bar, mono arrow)
  return (
    <button type="button" className="ob-cta" style={style} onClick={onClick} disabled={disabled}>
      <span className="ob-cta-bar" aria-hidden="true" />
      <span className="ob-cta-label">{children}</span>
      <span className="ob-cta-arrow" aria-hidden="true">→</span>
    </button>
  )
}

function OnboardingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ display: "flex", flexDirection: "column", gap: 28 }}
    >
      <div style={{ textAlign: "center" }}>
        <div className="ob-skel" style={{ height: 28, width: "62%", margin: "0 auto 12px" }} />
        <div className="ob-skel" style={{ height: 14, width: "46%", margin: "0 auto" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="ob-skel" style={{ height: 56 }} />
        <div className="ob-skel" style={{ height: 56 }} />
        <div className="ob-skel" style={{ height: 56 }} />
        <div className="ob-skel" style={{ height: 56 }} />
      </div>
      <span className="sr-only">Loading your account</span>
    </div>
  )
}

// Branded handoff loader — shown after account creation while we navigate to the
// welcome flow, so the jump reads as "things are happening" rather than a freeze.
function TransitionLoader() {
  return (
    <div className="ob-transition" role="status" aria-live="polite">
      <svg className="ob-transition-mark" width={48} height={48} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M18 3 L31 7 L31 17 C31 24 26 30 18 33 C10 30 5 24 5 17 L5 7 Z"
          stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        <circle cx="18" cy="17" r="1.6" fill="var(--amber)" />
        <line x1="18" y1="18.6" x2="18" y2="22.5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="ob-transition-title">Setting up your workspace</p>
      <p className="ob-transition-sub">Creating your account and securing your space — just a moment.</p>
      <div className="ob-transition-bar" aria-hidden="true" />
      <span className="sr-only">Setting up your account, please wait</span>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  // Single "door" panel wraps every wizard step — matches the welcome flow + login/admin.
  return (
    <Suspense fallback={
      <div className="ob-panel">
        <span className="ob-knob" aria-hidden="true" />
        <div style={{ textAlign: "center", color: "var(--ink-mute)", fontSize: 14 }}>Loading…</div>
      </div>
    }>
      <div className="ob-panel">
        <span className="ob-knob" aria-hidden="true" />
        <OnboardingWizard />
      </div>
    </Suspense>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSetup = searchParams.get("setup") === "true"

  const [userType, setUserType] = useState<UserType | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Shared
  const [name, setName] = useState("")
  const [mobile, setMobile] = useState("")
  const [address, setAddress] = useState("")
  const [tradingAs, setTradingAs] = useState("")
  const [regNumber, setRegNumber] = useState("")
  const [vatNumber, setVatNumber] = useState("")
  const [email, setEmail] = useState("")

  // PPRA
  const [ppraStatus, setPpraStatus] = useState<string | null>(null)
  const [ppraFfc, setPpraFfc] = useState("")

  // Team invites
  const [invites, setInvites] = useState<Array<{ email: string; role: string }>>([{ email: "", role: "property_manager" }])

  // Account creation
  const [acctEmail, setAcctEmail] = useState("")
  const [acctPassword, setAcctPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [isAlreadyAuthenticated, setIsAlreadyAuthenticated] = useState(false)
  const [skipQuickFinish, setSkipQuickFinish] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  // §A — explicit ToS consent; CTA disabled until ticked on every completion surface
  const [tosAccepted, setTosAccepted] = useState(false)

  // Inline validation message shown when a completion CTA is clicked with missing fields
  const [formHint, setFormHint] = useState("")

  // Branded handoff: show the transition loader, then navigate to the resolver →
  // welcome. The short delay lets the loader paint so the jump isn't abrupt.
  const [transitioning, setTransitioning] = useState(false)
  function transitionToResolver() {
    setTransitioning(true)
    setTimeout(() => { globalThis.location.href = "/auth/resolver?redirect=/dashboard" }, 700)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          setIsAlreadyAuthenticated(true)
          if (data.user.email) setAcctEmail(data.user.email)
          if (data.user.email) setEmail(data.user.email)
          const fullName = data.user.user_metadata?.full_name
          if (typeof fullName === "string" && fullName) setName(fullName)
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true))
  }, [])

  function getTotalSteps(): number {
    if (!userType) return 0
    if (userType === "exploring") return 1
    // Account and all-set are one final step slot with two render states —
    // not two separate steps — so the count is independent of auth state.
    if (userType === "owner" || userType === "family") return 2
    if (userType === "agent") return 3
    return 4 // agency
  }

  function handleTypeSelect(type: UserType) {
    setUserType(type)
    setStep(1)
  }

  function getManagementScope() { return (userType === "agent" || userType === "agency") ? "others_only" : "own_only" }

  function buildOrgName(): string {
    if (userType === "owner" || userType === "family") return name ? `${name.split(" ")[0]}'s Properties` : "My Properties"
    return tradingAs || name
  }

  async function handleCompleteResult(result: Awaited<ReturnType<typeof createAccountAndOrg>>, submitData: OnboardingData) {
    if (result?.error) {
      if (result.errorType === "already_exists") {
        console.info("[onboarding] already_exists branch → /auth/resolver", {
          userType: submitData.userType, isAlreadyAuthenticated: submitData.isAlreadyAuthenticated,
        })
        transitionToResolver(); return
      }
      if (result.errorType === "email_exists") { setEmailExists(true); setLoading(false); return }
      if (result.errorType === "email_in_use_elsewhere") {
        globalThis.location.href = `/login?redirect=/auth/resolver&email=${encodeURIComponent(acctEmail)}`
        return
      }
      toast.error(result.error)
      setLoading(false)
      return
    }
    if (!submitData.isAlreadyAuthenticated && submitData.password) {
      const supabase = createClient()
      await supabase.auth.signInWithPassword({ email: submitData.email, password: submitData.password })
    }
    console.info("[onboarding] success → /auth/resolver", { userType: submitData.userType })
    transitionToResolver()
  }

  // Account step — validate on click so a click ALWAYS gives feedback (never a
  // silent disabled button). Returns the first missing-field message, or "" if ready.
  function accountStepError(): string {
    if (!acctEmail.trim()) return "Enter your email address to continue."
    if (acctPassword.length < 8) return "Choose a password with at least 8 characters."
    if (!tosAccepted) return "Please tick the box to accept the Terms and Privacy Policy."
    return ""
  }

  function handleCreateAccount() {
    const err = accountStepError()
    if (err) { setFormHint(err); return }
    setFormHint("")
    void handleComplete()
  }

  async function handleComplete() {
    setLoading(true)
    if (userType === "exploring") {
      if (typeof globalThis.window !== "undefined") {
        globalThis.localStorage.setItem("pleks_demo_name", name)
        globalThis.location.href = "/demo"
      }
      return
    }
    const submitData: OnboardingData = {
      userType: userType!,
      name: buildOrgName(),
      tradingAs: tradingAs || undefined,
      regNumber: regNumber || undefined,
      vatNumber: vatNumber || undefined,
      contactName: name,
      email: acctEmail || email,
      mobile,
      address: address || undefined,
      managementScope: getManagementScope(),
      ppraStatus: ppraStatus || undefined,
      ppraFfcNumber: ppraFfc || undefined,
      tosAccepted,
      invites: userType === "agency" ? invites.filter((i) => i.email.trim()) : undefined,
      onboardingComplete: true,
      password: isAlreadyAuthenticated ? undefined : acctPassword,
      isAlreadyAuthenticated,
    }
    const result = await createAccountAndOrg(submitData)
    await handleCompleteResult(result, submitData)
  }

  async function handleQuickFinish() {
    setLoading(true)
    const emailToUse = acctEmail || email
    if (!emailToUse) { toast.error("Session error — please refresh and try again."); setLoading(false); return }
    const result = await createAccountAndOrg({
      userType: "owner",
      name: name ? `${name.split(" ")[0]}'s Properties` : "My Properties",
      contactName: name || emailToUse.split("@")[0],
      email: emailToUse,
      mobile: mobile || "—",
      managementScope: "own_only",
      tosAccepted,
      onboardingComplete: true,
      isAlreadyAuthenticated: true,
    })
    if (result?.error) {
      if (result.errorType === "already_exists") {
        console.info("[onboarding] already_exists branch → /auth/resolver", {
          userType: "owner", isAlreadyAuthenticated: true,
        })
        transitionToResolver(); return
      }
      if (result.errorType === "auth_required") { globalThis.location.href = `/login?redirect=/auth/resolver&email=${encodeURIComponent(emailToUse)}`; return }
      toast.error(result.error)
      setLoading(false)
      return
    }
    transitionToResolver()
  }

  async function checkEmailExists(emailToCheck: string) {
    if (!emailToCheck || emailToCheck.length < 5) return
    const res = await fetch("/api/auth/check-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailToCheck.trim() }) })
    if (res.ok) { const data = await res.json(); setEmailExists(data.exists === true) }
  }

  const totalSteps = getTotalSteps()

  const progressBar = (
    <div style={{ marginBottom: 26 }}>
      <div className="ob-step">
        <span className="ob-step-eyebrow">
          Step {String(step).padStart(2, "0")} of {String(totalSteps).padStart(2, "0")}
        </span>
        <div className="ob-step-bars">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const idx = i + 1
            let cls = "ob-step-bar--future"
            if (idx < step) cls = "ob-step-bar--done"
            else if (idx === step) cls = "ob-step-bar--current"
            return <span key={`seg-${idx}`} className={`ob-step-bar ${cls}`} />
          })}
        </div>
      </div>
      <button type="button" onClick={() => setStep(step === 1 ? 0 : step - 1)}
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink-mute)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 14 }}>
        <ArrowLeft size={12} /> Back
      </button>
    </div>
  )

  // §A — ToS checkbox rendered immediately above each final CTA
  const tosCheckbox = (
    <label className="ob-check-row" style={{ marginBottom: 12 }}>
      <input type="checkbox" id="ob-tos" name="tos-accepted" checked={tosAccepted} onChange={(e) => { setTosAccepted(e.target.checked); setFormHint("") }} />
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        I have read and agree to the{" "}
        <a href={`${MARKETING_URL}/terms`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber-ink)" }}>Terms of Service</a>
        {" "}and{" "}
        <a href={`${MARKETING_URL}/privacy`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber-ink)" }}>Privacy Policy</a>
      </span>
    </label>
  )

  // ── Shared steps ───────────────────────────────────────────────────────────

  function renderAccountStep() {
    return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Almost there</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>Create your account to save your setup.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Email address *">
            <input
              id="ob-email" name="email"
              className="ob-input" type="email" autoComplete="email"
              value={acctEmail}
              onChange={(e) => { setAcctEmail(e.target.value); setEmailExists(false); setFormHint("") }}
              onBlur={() => checkEmailExists(acctEmail)}
              placeholder="you@example.com"
            />
            {emailExists && (
              <div className="ob-email-alert">
                <Info size={14} style={{ color: "var(--amber-ink)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontWeight: 500, fontSize: 13, color: "var(--ink)", margin: "0 0 2px" }}>This email is already registered.</p>
                  <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
                    Did you start setting up before?{" "}
                    <button type="button"
                      onClick={() => { globalThis.location.href = `/login?redirect=/auth/resolver&email=${encodeURIComponent(acctEmail)}` }}
                      style={{ color: "var(--amber-ink)", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "inherit" }}>
                      Sign in to continue →
                    </button>
                  </p>
                </div>
              </div>
            )}
          </Field>
          <Field label="Password *">
            <div style={{ position: "relative" }}>
              <input
                id="ob-password" name="new-password"
                className="ob-input"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={acctPassword}
                onChange={(e) => { setAcctPassword(e.target.value); setFormHint("") }}
                placeholder="At least 8 characters"
                style={{ paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-mute)", display: "flex", alignItems: "center" }}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          {tosCheckbox}
          <Btn onClick={handleCreateAccount} disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Btn>
          {formHint && !loading && (
            <p className="ob-hint" role="status" aria-live="polite">{formHint}</p>
          )}
        </div>
      </div>
    )
  }

  function renderAllSetStep(subtitle?: string) {
    return (
      <div>
        {progressBar}
        <h2 className="ob-heading">You&apos;re all set</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>{subtitle ?? "Your free Owner account is ready."}</p>
        {tosCheckbox}
        <Btn onClick={handleComplete} disabled={loading || !tosAccepted}>
          {loading ? "Setting up…" : "Go to dashboard"}
        </Btn>
        {!loading && !tosAccepted && (
          <p className="ob-hint">Tick the checkbox above to accept the terms.</p>
        )}
      </div>
    )
  }

  // ── Owner / Family — §E: step 2 (deposit) removed; account/all-set moves from 3→2 ──

  function renderOwnerFamilyStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Tell us about yourself</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>Just the basics — no company details needed.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your name *"><input className="ob-input" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
          <Field label="Mobile number *"><input className="ob-input" type="tel" name="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="082 000 0000" /></Field>
          <Field label="City & Province"><input className="ob-input" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !mobile.trim()}>Continue</Btn>
        </div>
      </div>
    )

    if (step === 2) return isAlreadyAuthenticated ? renderAllSetStep("Your free Owner account is ready.") : renderAccountStep()
    return null
  }

  // ── Agent / Agency shared — §E: step 3 (trust account) removed entirely ──

  function renderAgentAgencyStep() {
    if (step === 2) return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Are you registered with the PPRA?</h2>
        <div className="ob-notice ob-notice-info" style={{ marginBottom: 20 }}>
          The Property Practitioners Act 22 of 2019 requires anyone managing property for others to register with the PPRA and hold a valid Fidelity Fund Certificate (FFC).
        </div>
        {ppraStatus === null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setPpraStatus("registered")}>Yes, I&apos;m registered</Btn>
            <Btn variant="ghost" onClick={() => setPpraStatus("in_progress")}>Not yet — I&apos;m in the process</Btn>
            <Btn variant="ghost" onClick={() => setPpraStatus("none")}>No — I manage informally</Btn>
          </div>
        )}
        {ppraStatus === "registered" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="FFC Number (optional)"><input className="ob-input" name="ffc-number" value={ppraFfc} onChange={(e) => setPpraFfc(e.target.value)} placeholder="Your FFC number" /></Field>
            <Btn onClick={() => setStep(3)}>Continue</Btn>
          </div>
        )}
        {ppraStatus !== null && ppraStatus !== "registered" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="ob-notice ob-notice-warn">
              You can still use Pleks. Note that managing property for others without PPRA registration may have legal implications.
            </div>
            <Btn onClick={() => setStep(3)}>Continue</Btn>
          </div>
        )}
      </div>
    )

    return null
  }

  // ── Agent — §E: account/all-set moves from step 4→3 ──

  function renderAgentStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Tell us about yourself</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your full name *"><input className="ob-input" name="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Trading name *"><input className="ob-input" name="trading-name" value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="e.g. Smith Property Management" /></Field>
          <Field label="Mobile number *"><input className="ob-input" type="tel" name="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
          <Field label="City & Province"><input className="ob-input" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Field label="Company reg number"><input className="ob-input" name="reg-number" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="Optional" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !tradingAs.trim() || !mobile.trim()}>Continue</Btn>
        </div>
      </div>
    )
    const shared = renderAgentAgencyStep()
    if (shared) return shared
    if (step === 3) return isAlreadyAuthenticated
      ? renderAllSetStep("Your account is ready. Upgrade to Steward or Portfolio anytime from Settings.")
      : renderAccountStep()
    return null
  }

  // ── Agency — §E: invites moves from step 4→3; account/all-set from step 5→4 ──

  function renderAgencyStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Tell us about your agency</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Agency / company name *"><input className="ob-input" name="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Trading as"><input className="ob-input" name="trading-name" value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="If different from company name" /></Field>
          <Field label="Registration number *"><input className="ob-input" name="reg-number" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} /></Field>
          <Field label="VAT number"><input className="ob-input" name="vat-number" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Mobile number *"><input className="ob-input" type="tel" name="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
          <Field label="City & Province"><input className="ob-input" name="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !regNumber.trim() || !mobile.trim()}>Continue</Btn>
        </div>
      </div>
    )
    const shared = renderAgentAgencyStep()
    if (shared) return shared
    if (step === 3) return (
      <div>
        {progressBar}
        <h2 className="ob-heading">Invite your team</h2>
        <p className="pub-small" style={{ margin: "0 0 24px" }}>Add team members now or skip and invite later from Settings.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {invites.map((invite, i) => (
            <div key={`invite-${i}`} style={{ display: "flex", gap: 8 }}>
              <input
                name={`invite-email-${i}`}
                className="ob-input" type="email" placeholder="Email" style={{ flex: 1, width: "auto" }}
                value={invite.email}
                onChange={(e) => { const u = [...invites]; u[i] = { ...u[i], email: e.target.value }; setInvites(u) }}
              />
              <select
                name={`invite-role-${i}`}
                className="ob-input ob-select" style={{ width: 148, flexShrink: 0 }}
                value={invite.role}
                onChange={(e) => { const u = [...invites]; u[i] = { ...u[i], role: e.target.value }; setInvites(u) }}
              >
                <option value="property_manager">Property Manager</option>
                <option value="agent">Letting Agent</option>
                <option value="accountant">Accountant</option>
                <option value="maintenance_manager">Maintenance</option>
              </select>
              {invites.length > 1 && (
                <button type="button" onClick={() => setInvites(invites.filter((_, j) => j !== i))}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, border: "1px solid var(--rule)", borderRadius: "var(--r-sm)", background: "none", cursor: "pointer", color: "var(--ink-mute)", flexShrink: 0 }}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setInvites([...invites, { email: "", role: "property_manager" }])}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--amber-ink)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <Plus size={12} /> Add another
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => { setInvites([]); setStep(4) }}>Skip for now</Btn>
          <Btn style={{ flex: 1, width: "auto" }} onClick={() => setStep(4)}>Send invites &amp; continue</Btn>
        </div>
      </div>
    )
    if (step === 4) return isAlreadyAuthenticated
      ? renderAllSetStep("Your account is ready. Upgrade to Steward or Portfolio anytime from Settings.")
      : renderAccountStep()
    return null
  }

  // ── Main dispatch ──────────────────────────────────────────────────────────

  if (!authChecked) return <OnboardingSkeleton />
  if (transitioning) return <TransitionLoader />

  // Returning user quick-finish
  if (step === 0 && isAlreadyAuthenticated && !isSetup && !skipQuickFinish) {
    const displayName = name?.split(" ")[0] || acctEmail?.split("@")[0] || ""
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <h1 className="ob-heading" style={{ margin: "0 0 8px" }}>
            Welcome back{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="pub-small" style={{ margin: 0 }}>You started setting up before. Let&apos;s finish your account.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your name"><input className="ob-input" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" /></Field>
          <Field label="Mobile number"><input className="ob-input" type="tel" name="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="082 000 0000" /></Field>
          {tosCheckbox}
          <Btn onClick={handleQuickFinish} disabled={loading || !name.trim() || !tosAccepted}>
            {loading ? "Setting up…" : "Go to dashboard"}
          </Btn>
          {!loading && !tosAccepted && (
            <p className="ob-hint">Tick the checkbox above to accept the terms.</p>
          )}
          <button type="button" onClick={() => setSkipQuickFinish(true)}
            style={{ fontSize: 12.5, color: "var(--ink-mute)", background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>
            I want to choose a different account type
          </button>
        </div>
      </div>
    )
  }

  // Type selection
  if (step === 0) {
    const allTypes: Array<{ type: UserType; icon: typeof Building2; title: string; desc: string }> = [
      { type: "owner",     icon: Building2, title: "I own rental properties",         desc: "Manage your own portfolio" },
      { type: "agent",     icon: User,      title: "I'm a property agent / manager",  desc: "You manage properties for clients" },
      { type: "agency",    icon: Users,     title: "We're a team or agency",           desc: "Multiple staff, business entity" },
      { type: "family",    icon: Heart,     title: "I'm helping a family member",      desc: "Informal arrangement, not a business" },
      { type: "exploring", icon: Eye,       title: "Just exploring for now",           desc: "I want to see what Pleks can do" },
    ]
    const types = isSetup ? allTypes.filter((t) => t.type !== "exploring") : allTypes
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <h1 className="ob-heading" style={{ margin: "0 0 8px" }}>
            {isSetup ? "Choose your account type" : "How will you be using Pleks?"}
          </h1>
          <p className="pub-small" style={{ margin: 0 }}>
            {isSetup ? "You're upgrading from demo mode." : "We'll set up your account to match."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {types.map((t) => (
            <button key={t.type} type="button" className="ob-type-card" onClick={() => handleTypeSelect(t.type)}>
              <t.icon size={18} style={{ color: "var(--amber-ink)", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", margin: 0 }}>{t.title}</p>
                <p style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: "2px 0 0" }}>{t.desc}</p>
              </div>
              <ArrowRight size={13} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
        {isSetup && (
          <button type="button" onClick={() => router.push("/demo")}
            style={{ fontSize: 13, color: "var(--ink-mute)", background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>
            ← Back to demo
          </button>
        )}
      </div>
    )
  }

  // Exploring
  if (userType === "exploring") return (
    <div>
      {progressBar}
      <h2 className="ob-heading">What&apos;s your name?</h2>
      <p className="pub-small" style={{ margin: "0 0 28px" }}>That&apos;s all we need to get you started.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Your name *"><input className="ob-input" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
        <Field label="Mobile number"><input className="ob-input" type="tel" name="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Optional" /></Field>
        {tosCheckbox}
        <Btn onClick={handleComplete} disabled={!name.trim() || loading || !tosAccepted}>
          {loading ? "Setting up…" : "Explore Pleks"}
        </Btn>
      </div>
    </div>
  )

  if (userType === "owner" || userType === "family") return renderOwnerFamilyStep()
  if (userType === "agent") return renderAgentStep()
  if (userType === "agency") return renderAgencyStep()
  return null
}
