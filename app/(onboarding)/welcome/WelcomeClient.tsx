"use client"

/**
 * app/(onboarding)/welcome/WelcomeClient.tsx — Welcome interstitial interaction layer
 *
 * Notes:  Step 1 (orient): links to /settings/security/enrol-totp, returns as ?step=passkey.
 *         Step 1.5 (secured): 700ms shield payoff animation, auto-advances to step 2.
 *         Step 2 (passkey): inline registration via useEnrolPasskey — optional, skippable.
 *         welcome_seen is written on "Continue" / "Skip" click via markWelcomeSeen().
 *         §F.3: TOTP + passkey only — magic-link and SMS never presented as MFA here.
 *         prefers-reduced-motion: secured step degrades to ~120ms cross-fade.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import { markWelcomeSeen } from "@/lib/actions/welcome"

type Step = "orient" | "secured" | "passkey"
type ShieldPhase = 0 | 1 | 2  // idle → filling → done

interface WelcomeClientProps {
  firstName: string
  orgName: string
  role: string
  delegationCount: number
  delegatedByName: string
  initialStep: "orient" | "passkey"
  handlesClientFunds: boolean
}

export default function WelcomeClient({
  firstName, orgName, role,
  delegationCount, delegatedByName,
  initialStep, handlesClientFunds,
}: Readonly<WelcomeClientProps>) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(
    initialStep === "passkey" ? "secured" : "orient"
  )
  const [shieldPhase, setShieldPhase] = useState<ShieldPhase>(0)
  const [finishing, setFinishing] = useState(false)
  const { enrol, state: passkeyState, errorMsg, reset } = useEnrolPasskey()

  const isFounder = role === "owner"
  const enrolTotpUrl = "/welcome/secure"

  // Play secured payoff animation, then advance to passkey step
  useEffect(() => {
    if (step !== "secured") return
    const reduced = globalThis.window === undefined
      ? false
      : globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      setShieldPhase(2)
      const t = setTimeout(() => setStep("passkey"), 120)
      return () => clearTimeout(t)
    }
    const t1 = setTimeout(() => setShieldPhase(1), 0)
    const t2 = setTimeout(() => setShieldPhase(2), 250)
    const t3 = setTimeout(() => setStep("passkey"), 700)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [step])

  // On mount: if TOTP already enrolled, advance through secured payoff
  useEffect(() => {
    if (initialStep === "passkey") return
    const supabase = createClient()
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = (data?.totp ?? []).filter(f => f.status === "verified")
      if (verified.length > 0) setStep("secured")
    })
  }, [initialStep])

  async function handleFinish() {
    setFinishing(true)
    await markWelcomeSeen()
    router.push("/auth/resolver")
  }

  async function handleAddPasskey() {
    reset()
    await enrol()
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  const isPasskeying   = passkeyState === "in_progress"
  const passkeySuccess = passkeyState === "success"
  const passkeyFailed  = passkeyState === "error" && errorMsg !== "Cancelled"
  const passkeyIdle    = passkeyState === "idle" || (passkeyState === "error" && errorMsg === "Cancelled")

  const securityHeadline = handlesClientFunds ? "Lock the front door." : "Secure your account first."
  const securityRationale = handlesClientFunds
    ? "Your authenticator app keeps client data and trust funds protected. You'll use it each time you sign in — one secure code, a few seconds."
    : "Pleks holds rent and trust funds for the people you'll work with. Your authenticator keeps that protected — you'll use it each time you sign in."

  return (
    <div className="ob-panel">
      <div className="ob-knob"/>

      {step !== "secured" && (
        <div className="ob-step">
          <span className="ob-step-eyebrow">
            Step {step === "orient" ? "01" : "02"} of 02
          </span>
          <div className="ob-step-bars">
            <span className={`ob-step-bar ${step === "passkey" ? "ob-step-bar--done" : "ob-step-bar--current"}`}/>
            <span className={`ob-step-bar ${step === "passkey" ? "ob-step-bar--current" : "ob-step-bar--future"}`}/>
          </div>
        </div>
      )}

      {step === "orient" && (
        <OrientContent
          firstName={firstName} orgName={orgName} isFounder={isFounder}
          delegationCount={delegationCount} delegatedByName={delegatedByName}
          enrolTotpUrl={enrolTotpUrl}
          securityHeadline={securityHeadline} securityRationale={securityRationale}
          onSignOut={handleSignOut}
        />
      )}

      {step === "secured" && (
        <div className="ob-secured">
          <BigShieldSvg phase={shieldPhase}/>
          <div className="ob-secured-title">Secured.</div>
          <div className="ob-secured-sub">
            Your account is protected. One more small step — or skip straight to the dashboard.
          </div>
        </div>
      )}

      {step === "passkey" && (
        <PasskeyContent
          passkeySuccess={passkeySuccess} passkeyFailed={passkeyFailed} passkeyIdle={passkeyIdle}
          isPasskeying={isPasskeying} finishing={finishing}
          onFinish={handleFinish} onAddPasskey={handleAddPasskey} onSignOut={handleSignOut}
        />
      )}
    </div>
  )
}

// ─── Sub-sections extracted to keep WelcomeClient complexity ≤ 15 ─────────────

interface OrientProps {
  firstName: string; orgName: string; isFounder: boolean
  delegationCount: number; delegatedByName: string
  enrolTotpUrl: string
  securityHeadline: string; securityRationale: string
  onSignOut: () => void
}

function OrientContent({
  firstName, orgName, isFounder,
  delegationCount, delegatedByName,
  enrolTotpUrl, securityHeadline, securityRationale, onSignOut,
}: Readonly<OrientProps>) {
  const welcomeText = firstName ? `Welcome to Pleks, ${firstName}.` : "Welcome to Pleks."
  const firmText = isFounder
    ? `${orgName} is ready — let's secure it.`
    : `You've joined ${orgName}.`

  return (
    <>
      <h1 className="ob-heading">
        {welcomeText}<br/>
        <span className="ob-heading-soft">{firmText}</span>
      </h1>

      {!isFounder && delegationCount > 0 && (
        <div className="ob-delegation">
          <span className="ob-delegation-badge">{delegationCount}</span>
          <span>
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>{delegatedByName}</strong>
            {" "}has asked you to help set a few things up — they&apos;re waiting on your dashboard.
          </span>
        </div>
      )}

      <div className="ob-security">
        <div className="ob-security-icon"><ShieldSvg size={40} phase={0}/></div>
        <div className="ob-security-body">
          <div className="ob-security-head">{securityHeadline}</div>
          <div className="ob-security-desc">{securityRationale}</div>
        </div>
      </div>

      <a href={enrolTotpUrl} className="ob-cta">
        <span className="ob-cta-bar"/>
        <span className="ob-cta-label">Set up authenticator</span>
        <span className="ob-cta-arrow">{"→"}</span>
      </a>

      <div className="ob-escape">
        <button type="button" onClick={onSignOut}>Sign out</button>
        <a href="mailto:support@pleks.co.za">Get help</a>
      </div>
    </>
  )
}

interface PasskeyProps {
  passkeySuccess: boolean; passkeyFailed: boolean; passkeyIdle: boolean
  isPasskeying: boolean; finishing: boolean
  onFinish: () => void; onAddPasskey: () => void; onSignOut: () => void
}

function PasskeyContent({
  passkeySuccess, passkeyFailed, passkeyIdle,
  isPasskeying, finishing, onFinish, onAddPasskey, onSignOut,
}: Readonly<PasskeyProps>) {
  let passkeyHeading: React.ReactNode
  if (passkeySuccess) {
    passkeyHeading = "You’re set."
  } else if (passkeyFailed) {
    passkeyHeading = <>That didn&apos;t take &mdash;<br/><span className="ob-heading-soft">no harm done.</span></>
  } else {
    passkeyHeading = <>One tap to sign in,<br/><span className="ob-heading-soft">from now on.</span></>
  }

  return (
    <>
      <h1 className="ob-heading">{passkeyHeading}</h1>

      {passkeySuccess && (
        <>
          <div className="ob-factors">
            <div className="ob-factor-chip">
              <div className="ob-factor-chip-icon"><ShieldSvg size={20} phase={2}/></div>
              <div>
                <div className="ob-factor-chip-label">Authenticator</div>
                <div className="ob-factor-chip-status">Active</div>
              </div>
            </div>
            <div className="ob-factor-chip ob-factor-chip--accent">
              <div className="ob-factor-chip-icon"><FingerprintSvg size={20} ok/></div>
              <div>
                <div className="ob-factor-chip-label">Passkey</div>
                <div className="ob-factor-chip-status">This device</div>
              </div>
            </div>
          </div>
          <p style={{ fontFamily: "var(--pub-sans)", fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-soft)", margin: "20px 0 24px", maxWidth: "46ch" }}>
            Next time, tap once with Face ID or Touch ID. Your authenticator stays available for when you&apos;re on another device.
          </p>
          <button type="button" className="ob-cta" onClick={onFinish} disabled={finishing}>
            <span className="ob-cta-bar"/>
            <span className="ob-cta-label">{finishing ? "Loading…" : "Continue to Pleks"}</span>
            <span className="ob-cta-arrow">{"→"}</span>
          </button>
          <div className="ob-escape">
            <button type="button" onClick={onSignOut}>Sign out</button>
            <span>Manage devices</span>
          </div>
        </>
      )}

      {passkeyFailed && (
        <>
          <div className="ob-notice">
            <div className="ob-notice-icon"><FingerprintSvg size={22}/></div>
            <div>
              <div className="ob-notice-head">Passkey wasn&apos;t added this time.</div>
              <div className="ob-notice-body">
                Your account is still fully secured by your authenticator. You can add a passkey any time from Settings &rarr; Security.
              </div>
            </div>
          </div>
          <div style={{ height: 24 }}/>
          <button type="button" className="ob-cta" onClick={onFinish} disabled={finishing}>
            <span className="ob-cta-bar"/>
            <span className="ob-cta-label">{finishing ? "Loading…" : "Continue to Pleks"}</span>
            <span className="ob-cta-arrow">{"→"}</span>
          </button>
          <div style={{ height: 12 }}/>
          <button type="button" className="ob-skip" onClick={onAddPasskey} disabled={isPasskeying}>
            Try the passkey again
          </button>
          <div className="ob-escape">
            <button type="button" onClick={onSignOut}>Sign out</button>
            <a href="mailto:support@pleks.co.za">Get help</a>
          </div>
        </>
      )}

      {passkeyIdle && (
        <>
          <div className="ob-security">
            <div className="ob-security-icon"><FingerprintSvg size={40}/></div>
            <div className="ob-security-body">
              <div className="ob-security-head">Add Face ID or Touch ID.</div>
              <div className="ob-security-desc">
                Convenience that sits on top of the security you just set up. Your authenticator stays the anchor — this is just one tap, next time.
              </div>
            </div>
          </div>
          <button type="button" className="ob-cta" onClick={onAddPasskey} disabled={isPasskeying || finishing}>
            <span className="ob-cta-bar"/>
            <span className="ob-cta-label">{isPasskeying ? "Setting up…" : "Add passkey"}</span>
            <span className="ob-cta-arrow">{"→"}</span>
          </button>
          <div style={{ height: 12 }}/>
          <button type="button" className="ob-skip" onClick={onFinish} disabled={isPasskeying || finishing}>
            {finishing ? "Loading…" : "Skip — I can add this later in Settings"}
          </button>
          <div className="ob-escape">
            <button type="button" onClick={onSignOut}>Sign out</button>
            <a href="mailto:support@pleks.co.za">Get help</a>
          </div>
        </>
      )}
    </>
  )
}

// ─── Inline SVG components — CSS token vars for stroke/fill, no raw hex ───────

function ShieldSvg({ size = 36, phase = 0 }: Readonly<{ size?: number; phase?: 0 | 1 | 2 }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M18 3 L31 7 L31 17 C31 24 26 30 18 33 C10 30 5 24 5 17 L5 7 Z"
        stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" fill="none"/>
      {phase === 1 && (
        <path d="M18 3 L31 7 L31 17 C31 22 28 26 24 28"
          stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      )}
      {phase === 2 && (
        <>
          <path d="M18 3 L31 7 L31 17 C31 24 26 30 18 33 C10 30 5 24 5 17 L5 7 Z"
            stroke="var(--amber)" strokeWidth="1.6" strokeLinejoin="round" fill="none"/>
          <path d="M12.5 18 L16.5 22 L24 14.5"
            stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </>
      )}
      {phase === 0 && (
        <>
          <circle cx="18" cy="17" r="1.4" fill="var(--amber)"/>
          <line x1="18" y1="18.4" x2="18" y2="22"
            stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round"/>
        </>
      )}
    </svg>
  )
}

function FingerprintSvg({ size = 36, ok = false }: Readonly<{ size?: number; ok?: boolean }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M9 18 C9 13 13 9 18 9 C23 9 27 13 27 18 C27 21 26 25 24 28"
        stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M13 18 C13 15 15.2 13 18 13 C20.8 13 23 15 23 18 C23 22 22 25 20 28"
        stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M17 18 C17 17.4 17.4 17 18 17 C18.6 17 19 17.4 19 18 C19 22 18.5 26 16.5 29"
        stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {ok && <circle cx="27" cy="9" r="3" fill="var(--amber)"/>}
    </svg>
  )
}

function BigShieldSvg({ phase }: Readonly<{ phase: 0 | 1 | 2 }>) {
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" fill="none" aria-hidden="true">
      <path d="M38 6 L66 14 L66 36 C66 52 56 64 38 70 C20 64 10 52 10 36 L10 14 Z"
        stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" fill="none"/>
      {phase === 1 && (
        <path d="M38 6 L66 14 L66 36 C66 47 60 56 52 62"
          stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" fill="none"/>
      )}
      {phase === 2 && (
        <>
          <path d="M38 6 L66 14 L66 36 C66 52 56 64 38 70 C20 64 10 52 10 36 L10 14 Z"
            fill="var(--amber-wash)" stroke="var(--amber)" strokeWidth="2.2" strokeLinejoin="round"/>
          <path d="M22 38 L34 50 L54 28"
            stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </>
      )}
      {phase === 0 && (
        <>
          <circle cx="38" cy="36" r="3" fill="var(--amber)"/>
          <line x1="38" y1="39" x2="38" y2="47"
            stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round"/>
        </>
      )}
    </svg>
  )
}
