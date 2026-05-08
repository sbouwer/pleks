"use client"

/**
 * app/(onboarding)/onboarding/page.tsx — Multi-step agency onboarding wizard
 *
 * Route:  /onboarding
 * Auth:   authenticated (manifest: skipOrgCheck — org does not exist yet)
 * Data:   createAccountAndOrg() server action; writes org, user_orgs, subscription, tos_acceptances
 */

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createAccountAndOrg, type OnboardingData } from "@/lib/actions/onboarding"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Plus, X, Building2, User, Users, Heart, Eye, EyeOff, Info } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

type UserType = "owner" | "agent" | "agency" | "family" | "exploring"

const SA_BANKS = [
  "ABSA", "Capitec", "FNB", "Investec", "Nedbank", "Standard Bank",
  "African Bank", "Discovery Bank", "TymeBank", "Other",
]

// ── Micro-components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ob-field">
      <label className="ob-label">{label}</label>
      {children}
    </div>
  )
}

function Btn({
  children, onClick, disabled = false, variant = "primary", style,
}: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  variant?: "primary" | "ghost"; style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={`pub-btn ${variant === "primary" ? "pub-btn-primary" : "pub-btn-ghost"}`}
      style={{ width: "100%", justifyContent: "center", ...style }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

// ── Bank fields ───────────────────────────────────────────────────────────────

interface BankFieldsProps {
  bankName: string; setBankName: (v: string) => void
  accountHolder: string; setAccountHolder: (v: string) => void
  accountNumber: string; setAccountNumber: (v: string) => void
  branchCode: string; setBranchCode: (v: string) => void
  accountType: string; setAccountType: (v: string) => void
}

function BankFields({
  bankName, setBankName, accountHolder, setAccountHolder,
  accountNumber, setAccountNumber, branchCode, setBranchCode,
  accountType, setAccountType,
}: Readonly<BankFieldsProps>) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
      <Field label="Bank name *">
        <select className="ob-input ob-select" value={bankName} onChange={(e) => setBankName(e.target.value)}>
          <option value="">Select bank</option>
          {SA_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      <Field label="Account holder name">
        <input className="ob-input" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
      </Field>
      <Field label="Account number">
        <input className="ob-input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Branch code">
        <input className="ob-input" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="Account type">
        <select className="ob-input ob-select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          <option value="savings">Savings</option>
          <option value="cheque">Cheque</option>
          <option value="transmission">Transmission</option>
        </select>
      </Field>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div style={{ textAlign: "center", paddingTop: 40, color: "var(--ink-mute)", fontSize: 14 }}>
        Loading…
      </div>
    }>
      <OnboardingWizard />
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
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [tradingAs, setTradingAs] = useState("")
  const [regNumber, setRegNumber] = useState("")
  const [vatNumber, setVatNumber] = useState("")
  const [email, setEmail] = useState("")

  // PPRA
  const [ppraStatus, setPpraStatus] = useState<string | null>(null)
  const [ppraFfc, setPpraFfc] = useState("")

  // Bank account
  const [hasBankAccount, setHasBankAccount] = useState<boolean | null>(null)
  const [bankName, setBankName] = useState("")
  const [accountHolder, setAccountHolder] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [branchCode, setBranchCode] = useState("")
  const [accountType, setAccountType] = useState("savings")
  const [bankDeclineAck, setBankDeclineAck] = useState(false)

  // Team invites
  const [invites, setInvites] = useState<Array<{ email: string; role: string }>>([{ email: "", role: "property_manager" }])

  // Account creation
  const [acctEmail, setAcctEmail] = useState("")
  const [acctPassword, setAcctPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [isAlreadyAuthenticated, setIsAlreadyAuthenticated] = useState(false)
  const [skipQuickFinish, setSkipQuickFinish] = useState(false)

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
  }, [])

  function getTotalSteps(): number {
    if (!userType) return 0
    if (userType === "exploring") return 1
    const acctStep = isAlreadyAuthenticated ? 0 : 1
    if (userType === "owner" || userType === "family") return 3 + acctStep
    if (userType === "agent") return 4 + acctStep
    return 5 + acctStep
  }

  function handleTypeSelect(type: UserType) {
    setUserType(type)
    setStep(1)
  }

  function getManagementScope() { return (userType === "agent" || userType === "agency") ? "others_only" : "own_only" }

  function getBankAccountType(): "trust" | "deposit_holding" | "ppra_trust" {
    if (ppraStatus === "registered") return "ppra_trust"
    if (userType === "agent" || userType === "agency") return "trust"
    return "deposit_holding"
  }

  function buildOrgName(): string {
    if (userType === "owner" || userType === "family") return name ? `${name.split(" ")[0]}'s Properties` : "My Properties"
    return tradingAs || name
  }

  async function handleCompleteResult(result: Awaited<ReturnType<typeof createAccountAndOrg>>, submitData: OnboardingData) {
    if (result?.error) {
      if (result.errorType === "already_exists") { globalThis.location.href = "/dashboard"; return }
      if (result.errorType === "email_exists") setEmailExists(true)
      toast.error(result.error)
      setLoading(false)
      return
    }
    if (!submitData.isAlreadyAuthenticated && submitData.password) {
      const supabase = createClient()
      await supabase.auth.signInWithPassword({ email: submitData.email, password: submitData.password })
    }
    globalThis.location.href = "/dashboard?onboarding=complete"
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
      phone,
      address: address || undefined,
      managementScope: getManagementScope(),
      ppraStatus: ppraStatus || undefined,
      ppraFfcNumber: ppraFfc || undefined,
      hasBankAccount: hasBankAccount === true,
      bankName: hasBankAccount ? bankName : undefined,
      accountHolder: hasBankAccount ? accountHolder : undefined,
      accountNumber: hasBankAccount ? accountNumber : undefined,
      branchCode: hasBankAccount ? branchCode : undefined,
      accountType: hasBankAccount ? accountType : undefined,
      bankAccountType: hasBankAccount ? getBankAccountType() : undefined,
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
      phone: phone || "—",
      managementScope: "own_only",
      hasBankAccount: false,
      onboardingComplete: true,
      isAlreadyAuthenticated: true,
    })
    if (result?.error) {
      if (result.errorType === "already_exists") { globalThis.location.href = "/dashboard"; return }
      if (result.errorType === "auth_required") { globalThis.location.href = `/login?redirect=/onboarding&email=${encodeURIComponent(emailToUse)}`; return }
      toast.error(result.error)
      setLoading(false)
      return
    }
    globalThis.location.href = "/dashboard?onboarding=complete"
  }

  async function checkEmailExists(emailToCheck: string) {
    if (!emailToCheck || emailToCheck.length < 5) return
    const res = await fetch("/api/auth/check-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailToCheck.trim() }) })
    if (res.ok) { const data = await res.json(); setEmailExists(data.exists === true) }
  }

  const totalSteps = getTotalSteps()
  const progress = totalSteps > 0 ? (step / totalSteps) * 100 : 0

  const progressBar = (
    <div style={{ marginBottom: 36 }}>
      <div className="ob-progress-track">
        <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <button type="button" onClick={() => setStep(step === 1 ? 0 : step - 1)}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: "var(--ink-mute)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={12} /> Back
        </button>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Step {step} of {totalSteps}</span>
      </div>
    </div>
  )

  // ── Shared steps ───────────────────────────────────────────────────────────

  function renderAccountStep() {
    return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Almost there</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>Create your account to save your setup.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Email address *">
            <input
              className="ob-input" type="email" autoComplete="email"
              value={acctEmail}
              onChange={(e) => { setAcctEmail(e.target.value); setEmailExists(false) }}
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
                      onClick={() => { globalThis.location.href = `/login?redirect=/onboarding&email=${encodeURIComponent(acctEmail)}` }}
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
                className="ob-input"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={acctPassword}
                onChange={(e) => setAcctPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}
                style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-mute)", display: "flex", alignItems: "center" }}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Btn onClick={handleComplete} disabled={loading || !acctEmail.trim() || acctPassword.length < 8}>
            {loading ? "Creating account…" : "Create account →"}
          </Btn>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-mute)", margin: 0 }}>
            By creating an account you agree to our{" "}
            <Link href="/terms" style={{ color: "var(--ink-soft)", textDecoration: "underline" }}>Terms</Link>{" "}
            and{" "}
            <Link href="/privacy" style={{ color: "var(--ink-soft)", textDecoration: "underline" }}>Privacy Policy</Link>
          </p>
        </div>
      </div>
    )
  }

  function renderAllSetStep(subtitle?: string) {
    return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 8px" }}>You&apos;re all set</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>{subtitle ?? "Your free Owner account is ready."}</p>
        <Btn onClick={handleComplete} disabled={loading}>
          {loading ? "Setting up…" : "Go to dashboard →"}
        </Btn>
      </div>
    )
  }

  // ── Owner / Family ─────────────────────────────────────────────────────────

  function renderOwnerFamilyStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Tell us about yourself</h2>
        <p className="pub-small" style={{ margin: "0 0 28px" }}>Just the basics — no company details needed.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your name *"><input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
          <Field label="Phone number *"><input className="ob-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" /></Field>
          <Field label="City & Province"><input className="ob-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !phone.trim()}>Continue →</Btn>
        </div>
      </div>
    )

    if (step === 2) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Deposit account</h2>
        <p className="pub-small" style={{ margin: "0 0 16px" }}>Do you have a separate account for holding tenant deposits?</p>
        <div className="ob-notice ob-notice-info" style={{ marginBottom: 20 }}>
          The Rental Housing Act requires deposits to be held in a separate interest-bearing account. This can be a savings account at any SA bank.
        </div>
        {hasBankAccount === null && (
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => setHasBankAccount(true)}>Yes, I have one</Btn>
            <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => setHasBankAccount(false)}>Not yet</Btn>
          </div>
        )}
        {hasBankAccount === true && (
          <>
            <BankFields bankName={bankName} setBankName={setBankName} accountHolder={accountHolder} setAccountHolder={setAccountHolder} accountNumber={accountNumber} setAccountNumber={setAccountNumber} branchCode={branchCode} setBranchCode={setBranchCode} accountType={accountType} setAccountType={setAccountType} />
            <Btn style={{ marginTop: 16 }} onClick={() => setStep(3)} disabled={!bankName}>Continue →</Btn>
          </>
        )}
        {hasBankAccount === false && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            <div className="ob-notice ob-notice-warn">
              Deposit receipts and Tribunal documentation will be restricted until you add this. You can add it later in Settings.
            </div>
            <label className="ob-check-row">
              <input type="checkbox" checked={bankDeclineAck} onChange={(e) => setBankDeclineAck(e.target.checked)} />
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>I understand — I&apos;ll set this up later</span>
            </label>
            <Btn onClick={() => setStep(3)} disabled={!bankDeclineAck}>Continue →</Btn>
          </div>
        )}
      </div>
    )

    if (step === 3) return isAlreadyAuthenticated ? renderAllSetStep("Your free Owner account is ready.") : renderAccountStep()
    return null
  }

  // ── Agent / Agency shared ──────────────────────────────────────────────────

  function renderAgentAgencyStep() {
    if (step === 2) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 16px" }}>Are you registered with the PPRA?</h2>
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
            <Field label="FFC Number (optional)"><input className="ob-input" value={ppraFfc} onChange={(e) => setPpraFfc(e.target.value)} placeholder="Your FFC number" /></Field>
            <Btn onClick={() => setStep(3)}>Continue →</Btn>
          </div>
        )}
        {ppraStatus !== null && ppraStatus !== "registered" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="ob-notice ob-notice-warn">
              You can still use Pleks. Note that managing property for others without PPRA registration may have legal implications.
            </div>
            <Btn onClick={() => setStep(3)}>Continue →</Btn>
          </div>
        )}
      </div>
    )

    if (step === 3) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Trust account</h2>
        <p className="pub-small" style={{ margin: "0 0 16px" }}>
          {ppraStatus === "registered" ? "Do you have a PPRA-registered trust account?" : "Do you have a separate account for holding tenant funds?"}
        </p>
        {hasBankAccount === null && (
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => setHasBankAccount(true)}>Yes</Btn>
            <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => setHasBankAccount(false)}>Not yet</Btn>
          </div>
        )}
        {hasBankAccount === true && (
          <>
            <BankFields bankName={bankName} setBankName={setBankName} accountHolder={accountHolder} setAccountHolder={setAccountHolder} accountNumber={accountNumber} setAccountNumber={setAccountNumber} branchCode={branchCode} setBranchCode={setBranchCode} accountType={accountType} setAccountType={setAccountType} />
            <Btn style={{ marginTop: 16 }} onClick={() => setStep(4)} disabled={!bankName}>Continue →</Btn>
          </>
        )}
        {hasBankAccount === false && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
            <div className="ob-notice ob-notice-warn">
              Owner statements and deposit management will be restricted until you add banking details. You can add them later in Settings.
            </div>
            <label className="ob-check-row">
              <input type="checkbox" checked={bankDeclineAck} onChange={(e) => setBankDeclineAck(e.target.checked)} />
              <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>I understand — I&apos;ll set this up later</span>
            </label>
            <Btn onClick={() => setStep(4)} disabled={!bankDeclineAck}>Continue →</Btn>
          </div>
        )}
      </div>
    )

    return null
  }

  // ── Agent ──────────────────────────────────────────────────────────────────

  function renderAgentStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px" }}>Tell us about yourself</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your full name *"><input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Trading name *"><input className="ob-input" value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="e.g. Smith Property Management" /></Field>
          <Field label="Phone number *"><input className="ob-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="City & Province"><input className="ob-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Field label="Company reg number"><input className="ob-input" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="Optional" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !tradingAs.trim() || !phone.trim()}>Continue →</Btn>
        </div>
      </div>
    )
    const shared = renderAgentAgencyStep()
    if (shared) return shared
    if (step === 4) return isAlreadyAuthenticated
      ? renderAllSetStep("Your account is ready. Upgrade to Steward or Portfolio anytime from Settings.")
      : renderAccountStep()
    return null
  }

  // ── Agency ─────────────────────────────────────────────────────────────────

  function renderAgencyStep() {
    if (step === 1) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 24px" }}>Tell us about your agency</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Agency / company name *"><input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Trading as"><input className="ob-input" value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="If different from company name" /></Field>
          <Field label="Registration number *"><input className="ob-input" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} /></Field>
          <Field label="VAT number"><input className="ob-input" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Optional" /></Field>
          <Field label="Phone number *"><input className="ob-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="City & Province"><input className="ob-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></Field>
          <Btn onClick={() => setStep(2)} disabled={!name.trim() || !regNumber.trim() || !phone.trim()}>Continue →</Btn>
        </div>
      </div>
    )
    const shared = renderAgentAgencyStep()
    if (shared) return shared
    if (step === 4) return (
      <div>
        {progressBar}
        <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>Invite your team</h2>
        <p className="pub-small" style={{ margin: "0 0 24px" }}>Add team members now or skip and invite later from Settings.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {invites.map((invite, i) => (
            <div key={`invite-${i}`} style={{ display: "flex", gap: 8 }}>
              <input
                className="ob-input" type="email" placeholder="Email" style={{ flex: 1, width: "auto" }}
                value={invite.email}
                onChange={(e) => { const u = [...invites]; u[i] = { ...u[i], email: e.target.value }; setInvites(u) }}
              />
              <select
                className="ob-input ob-select" style={{ width: 148, flexShrink: 0 }}
                value={invite.role}
                onChange={(e) => { const u = [...invites]; u[i] = { ...u[i], role: e.target.value }; setInvites(u) }}
              >
                <option value="property_manager">Property Manager</option>
                <option value="letting_agent">Letting Agent</option>
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
          <Btn variant="ghost" style={{ flex: 1, width: "auto" }} onClick={() => { setInvites([]); setStep(5) }}>Skip for now</Btn>
          <Btn style={{ flex: 1, width: "auto" }} onClick={() => setStep(5)}>Send invites &amp; continue →</Btn>
        </div>
      </div>
    )
    if (step === 5) return isAlreadyAuthenticated
      ? renderAllSetStep("Your account is ready. Upgrade to Steward or Portfolio anytime from Settings.")
      : renderAccountStep()
    return null
  }

  // ── Main dispatch ──────────────────────────────────────────────────────────

  // Returning user quick-finish
  if (step === 0 && isAlreadyAuthenticated && !isSetup && !skipQuickFinish) {
    const displayName = name?.split(" ")[0] || acctEmail?.split("@")[0] || ""
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
            Welcome back{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="pub-small" style={{ margin: 0 }}>You started setting up before. Let&apos;s finish your account.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Your name"><input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" /></Field>
          <Field label="Phone number"><input className="ob-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" /></Field>
          <Btn onClick={handleQuickFinish} disabled={loading || !name.trim()}>
            {loading ? "Setting up…" : "Go to dashboard →"}
          </Btn>
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
          <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
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
      <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", margin: "0 0 6px" }}>What&apos;s your name?</h2>
      <p className="pub-small" style={{ margin: "0 0 28px" }}>That&apos;s all we need to get you started.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Your name *"><input className="ob-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
        <Field label="Phone number"><input className="ob-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" /></Field>
        <Btn onClick={handleComplete} disabled={!name.trim() || loading}>
          {loading ? "Setting up…" : "Explore Pleks →"}
        </Btn>
      </div>
    </div>
  )

  if (userType === "owner" || userType === "family") return renderOwnerFamilyStep()
  if (userType === "agent") return renderAgentStep()
  if (userType === "agency") return renderAgencyStep()
  return null
}
