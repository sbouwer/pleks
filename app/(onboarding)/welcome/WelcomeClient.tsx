"use client"

/**
 * app/(onboarding)/welcome/WelcomeClient.tsx — Welcome interstitial interaction layer
 *
 * Notes:  ADDENDUM_70 Slice B: pick-one-+-backup, in the bespoke welcome aesthetic.
 *         Step 1 (orient): choose a PRIMARY factor — passkey (recommended) OR authenticator.
 *           passkey → inline registration ceremony; authenticator → embedded EnrolTotp.
 *         Step 1.5 (secured): 700ms shield payoff animation, auto-advances to the backup offer.
 *         Step 2 (backup): offer the OTHER factor, gated on self-recovery (Option C, D-70-04/05).
 *           Synced passkey primary → skippable with a soft note; TOTP / device-bound passkey
 *           primary → firm (skip behind an explicit lockout acknowledgement). Copy informs the
 *           security reasoning, no step-counter framing on this screen (D-70-11).
 *         welcome_seen is written on "Continue" / "Skip" click via markWelcomeSeen().
 *         §F.3: TOTP + passkey only — magic-link and SMS never presented as MFA here.
 *         prefers-reduced-motion: secured step degrades to ~120ms cross-fade.
 *         All passkey/listFactors awaits are guarded against React #460 on teardown.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useEnrolPasskey } from "@/lib/auth/passkeys/useEnrolPasskey"
import { markWelcomeSeen } from "@/lib/actions/welcome"
import { EnrolTotp } from "@/components/auth/EnrolTotp"
import { TransitionLoader } from "@/components/onboarding/TransitionLoader"

type Step = "orient" | "enrol-totp" | "secured" | "backup" | "enrol-totp-backup"
type Primary = "passkey" | "totp"
type ShieldPhase = 0 | 1 | 2  // idle → filling → done

// Deliberate minimum "breathing space" for the secured payoff. The shield always plays its full
// reveal-and-hold even when enrolment resolved instantly — this is a floor on how long the moment
// lasts, not a loader tied to background timing (we only enter "secured" once the factor verifies).
// Give the user a beat to feel the account is locked before moving on.
const SECURED_HOLD_MS = 2200

interface WelcomeClientProps {
  firstName: string
  orgName: string
  role: string
  delegationCount: number
  delegatedByName: string
  initialStep: "orient" | "passkey"
  handlesClientFunds: boolean
  redirect: string
}

export default function WelcomeClient({
  firstName, orgName, role,
  delegationCount, delegatedByName,
  initialStep, handlesClientFunds, redirect,
}: Readonly<WelcomeClientProps>) {
  const router = useRouter()
  // initialStep "passkey" = the primary (TOTP) was already enrolled on a prior pass → resume at
  // the secured payoff with TOTP as the chosen primary, so the backup offer is the passkey.
  const [step, setStep] = useState<Step>(initialStep === "passkey" ? "secured" : "orient")
  const [primary, setPrimary] = useState<Primary | null>(initialStep === "passkey" ? "totp" : null)
  const [shieldPhase, setShieldPhase] = useState<ShieldPhase>(0)
  const [finishing, setFinishing] = useState(false)
  const [riskAck, setRiskAck] = useState(false)
  const passkey = useEnrolPasskey()

  const isFounder = role === "owner"

  // Play secured payoff animation, then advance to the backup offer
  useEffect(() => {
    if (step !== "secured") return
    const reduced = globalThis.window === undefined
      ? false
      : globalThis.window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      // Reduced-motion = no DRAWING animation, but the payoff still gets its breathing beat:
      // show the completed shield immediately and hold it for the same minimum (just static).
      // (A 120ms flash here read as "no shield at all".)
      setShieldPhase(2)
      const t = setTimeout(() => setStep("backup"), SECURED_HOLD_MS)
      return () => clearTimeout(t)
    }
    // Shield draws (60→360ms), check settles (360ms), then HOLD "Secured." so the payoff lands
    // before advancing to the backup step. Total = SECURED_HOLD_MS, enforced as a minimum even if
    // the enrolment that preceded this step returned instantly — the beat is the point.
    const t1 = setTimeout(() => setShieldPhase(1), 60)
    const t2 = setTimeout(() => setShieldPhase(2), 360)
    const t3 = setTimeout(() => setStep("backup"), SECURED_HOLD_MS)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [step])

  // On mount: if TOTP already enrolled, treat it as the chosen primary and advance through the
  // secured payoff to the (passkey) backup offer.
  // Guarded against post-unmount setState: gotrue's cross-tab Web Locks contention can
  // delay listFactors until handleFinish's location.href teardown has begun — an
  // unguarded setStep() then throws React #460 (Firefox loses this race). The active
  // flag makes a late resolve a no-op; the catch keeps a rejected probe non-fatal.
  useEffect(() => {
    if (initialStep === "passkey") return
    let active = true
    const supabase = createClient()
    supabase.auth.mfa.listFactors()
      .then(({ data }) => {
        if (!active) return
        const verified = (data?.totp ?? []).filter(f => f.status === "verified")
        if (verified.length > 0) { setPrimary("totp"); setStep("secured") }
      })
      .catch((e) => {
        if (!active) return
        console.warn("[welcome] listFactors failed on mount (non-fatal):", e instanceof Error ? e.message : "unknown")
      })
    return () => { active = false }
  }, [initialStep])

  async function handleFinish() {
    setFinishing(true)
    await markWelcomeSeen()
    // Full-page navigation (NOT router.push): /auth/resolver is a route handler that
    // returns a server redirect. Client RSC navigation can't follow it cleanly and
    // loops (ERR_TOO_MANY_REDIRECTS). The browser must follow resolver → dashboard.
    globalThis.location.href = `/auth/resolver?redirect=${encodeURIComponent(redirect)}`
  }

  // Primary = passkey: run the ceremony inline, then play the secured payoff.
  async function choosePasskey() {
    setPrimary("passkey")
    passkey.reset()
    const ok = await passkey.enrol("Primary device")
    if (ok) setStep("secured")
  }

  function chooseTotp() {
    setPrimary("totp")
    setStep("enrol-totp")
  }

  // Backup = passkey (primary was TOTP): ceremony inline, then straight to the dashboard.
  async function addPasskeyBackup() {
    passkey.reset()
    const ok = await passkey.enrol("Backup device")
    if (ok) await handleFinish()
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
  }

  const isPasskeying  = passkey.state === "in_progress"
  const passkeyFailed = passkey.state === "error" && passkey.errorMsg !== "Cancelled"

  const securityHeadline = handlesClientFunds ? "Lock the front door." : "Secure your account first."
  const securityRationale = handlesClientFunds
    ? "Pleks holds rent and trust money for the people you work with. A second way to confirm it's you keeps that protected if your password is ever stolen."
    : "Pleks holds rent and trust funds for the people you'll work with. A second way to confirm it's you keeps that protected if your password is ever stolen."

  // The instant Continue/Skip is clicked (finishing=true), cover the whole panel with the
  // branded loader BEFORE handleFinish fires location.href. The resolver→dashboard hop
  // (~1s) tears down this React tree; without the cover, /welcome's error boundary paints
  // a ~2s "Something went wrong" flash over the teardown. The loader is what's mounted
  // during teardown, so the boundary has nothing to flash over. (Mirrors OnboardingWizard.)
  if (finishing) {
    return (
      <div className="ob-panel">
        <div className="ob-knob"/>
        <TransitionLoader title="Taking you in" sub="Loading your dashboard — just a moment." />
      </div>
    )
  }

  // Step counter only on the PRIMARY-enrolment screens — the backup screen must not read like a
  // mission/checklist (D-70-11), and the secured payoff is a beat, not a step.
  const showSteps = step === "orient" || step === "enrol-totp"

  return (
    <div className="ob-panel">
      <div className="ob-knob"/>

      {showSteps && (
        <div className="ob-step">
          <span className="ob-step-eyebrow">Step 01 of 02</span>
          <div className="ob-step-bars">
            <span className="ob-step-bar ob-step-bar--current"/>
            <span className="ob-step-bar ob-step-bar--future"/>
          </div>
        </div>
      )}

      {step === "orient" && (
        <OrientContent
          firstName={firstName} orgName={orgName} isFounder={isFounder}
          delegationCount={delegationCount} delegatedByName={delegatedByName}
          securityHeadline={securityHeadline} securityRationale={securityRationale}
          isPasskeying={isPasskeying} passkeyFailed={passkeyFailed}
          passkeyError={passkey.errorMsg}
          onChoosePasskey={choosePasskey} onChooseTotp={chooseTotp}
          onSignOut={handleSignOut}
        />
      )}

      {step === "enrol-totp" && (
        <>
          <h1 className="ob-heading">Add Pleks to your authenticator app.</h1>
          <p style={{ fontFamily: "var(--pub-sans)", fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-soft)", margin: "4px 0 20px", maxWidth: "52ch" }}>
            Scan the code with Google Authenticator, 1Password, Authy, or any app you already use, then enter the six-digit code to confirm.
          </p>
          <EnrolTotp embedded mandatory variant="welcome" onVerified={() => setStep("secured")} />
          <div className="ob-escape">
            <button type="button" onClick={handleSignOut}>Sign out</button>
            <a href="mailto:support@pleks.co.za">Get help</a>
          </div>
        </>
      )}

      {step === "secured" && (
        <div className="ob-secured">
          <BigShieldSvg phase={shieldPhase}/>
          <div className="ob-secured-title">Secured.</div>
          <div className="ob-secured-sub">
            Your account is protected. One more layer to keep you covered — or head straight in.
          </div>
        </div>
      )}

      {step === "backup" && primary && (
        <BackupContent
          primary={primary}
          selfRecovering={primary === "passkey" && passkey.lastBackedUp === true}
          isPasskeying={isPasskeying} passkeyFailed={passkeyFailed} passkeyError={passkey.errorMsg}
          riskAck={riskAck} setRiskAck={setRiskAck}
          onAddPasskeyBackup={addPasskeyBackup}
          onAddTotpBackup={() => setStep("enrol-totp-backup")}
          onSkip={handleFinish}
          onSignOut={handleSignOut}
        />
      )}

      {step === "enrol-totp-backup" && (
        <>
          <h1 className="ob-heading">Add your authenticator backup.</h1>
          <p style={{ fontFamily: "var(--pub-sans)", fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-soft)", margin: "4px 0 20px", maxWidth: "52ch" }}>
            Scan the code with Google Authenticator, 1Password, Authy, or any app you already use, then enter the six-digit code to confirm.
          </p>
          <EnrolTotp embedded variant="welcome" onVerified={handleFinish} />
          <div className="ob-escape">
            <button type="button" onClick={handleSignOut}>Sign out</button>
            <a href="mailto:support@pleks.co.za">Get help</a>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-sections extracted to keep WelcomeClient complexity ≤ 15 ─────────────

interface OrientProps {
  firstName: string; orgName: string; isFounder: boolean
  delegationCount: number; delegatedByName: string
  securityHeadline: string; securityRationale: string
  isPasskeying: boolean; passkeyFailed: boolean; passkeyError: string | null
  onChoosePasskey: () => void; onChooseTotp: () => void
  onSignOut: () => void
}

function OrientContent({
  firstName, orgName, isFounder,
  delegationCount, delegatedByName,
  securityHeadline, securityRationale,
  isPasskeying, passkeyFailed, passkeyError,
  onChoosePasskey, onChooseTotp, onSignOut,
}: Readonly<OrientProps>) {
  const welcomeText = firstName ? `Welcome to Pleks, ${firstName}.` : "Welcome to Pleks."
  // Founders get an auto-created org named after them/their company — calling that org "ready"
  // reads oddly for a solo owner, so speak to their profile being set up instead.
  const firmText = isFounder
    ? "Your profile is ready — let's secure it."
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

      <p style={{ fontFamily: "var(--pub-sans)", fontSize: "13px", lineHeight: 1.5, color: "var(--ink-soft)", margin: "4px 0 10px" }}>
        Choose how you&apos;ll confirm it&apos;s you — both are equally secure.
      </p>

      <FactorChoiceButton
        kind="passkey" recommended busy={isPasskeying}
        onClick={onChoosePasskey} disabled={isPasskeying}
      />
      <div style={{ height: 10 }}/>
      <FactorChoiceButton kind="totp" onClick={onChooseTotp} disabled={isPasskeying} />

      {passkeyFailed && (
        <p style={{ fontFamily: "var(--pub-sans)", fontSize: "12.5px", color: "var(--danger)", margin: "12px 0 0" }}>
          {passkeyError === "Cancelled" ? "Passkey setup was cancelled." : "That didn't take — try again, or use an authenticator app instead."}
        </p>
      )}

      <div className="ob-escape">
        <button type="button" onClick={onSignOut}>Sign out</button>
        <a href="mailto:support@pleks.co.za">Get help</a>
      </div>
    </>
  )
}

function FactorChoiceButton({
  kind, recommended = false, busy = false, onClick, disabled,
}: Readonly<{ kind: "passkey" | "totp"; recommended?: boolean; busy?: boolean; onClick: () => void; disabled?: boolean }>) {
  const isPasskey = kind === "passkey"
  const title = isPasskey ? "Use a passkey" : "Use an authenticator app"
  const desc = isPasskey
    ? "Face ID, fingerprint, or your device PIN. Nothing to type, and it can't be phished."
    : "A 6-digit code from Google Authenticator, 1Password, or Authy. Best if your device doesn't support passkeys."

  return (
    <button type="button" className="ob-choice" onClick={onClick} disabled={disabled}>
      <span className="ob-choice-icon">
        {isPasskey ? <FingerprintSvg size={26}/> : <ShieldSvg size={26} phase={0}/>}
      </span>
      <span className="ob-choice-body">
        <span className="ob-choice-title">
          {busy ? "Setting up…" : title}
          {recommended && !busy && <span className="ob-choice-badge">Recommended</span>}
        </span>
        <span className="ob-choice-desc">{desc}</span>
      </span>
      <span className="ob-choice-arrow">{busy ? "" : "→"}</span>
    </button>
  )
}

interface BackupProps {
  primary: Primary
  selfRecovering: boolean
  isPasskeying: boolean; passkeyFailed: boolean; passkeyError: string | null
  riskAck: boolean; setRiskAck: (v: boolean) => void
  onAddPasskeyBackup: () => void
  onAddTotpBackup: () => void
  onSkip: () => void
  onSignOut: () => void
}

function BackupContent({
  primary, selfRecovering,
  isPasskeying, passkeyFailed, passkeyError,
  riskAck, setRiskAck,
  onAddPasskeyBackup, onAddTotpBackup, onSkip, onSignOut,
}: Readonly<BackupProps>) {
  const backupIsPasskey = primary === "totp"  // primary TOTP → backup is a passkey; primary passkey → backup is TOTP
  const addLabel = backupIsPasskey ? "Add a passkey" : "Add an authenticator app"

  // D-70-11: lead with the reason, grounded in what's true for Pleks; state the honest
  // consequence scaled to the primary; frame the backup as protection, not a task owed.
  let headline: string
  let reason: string
  if (selfRecovering) {
    headline = "One more layer — your call."
    reason = "Your passkey is already saved to your device's account (iCloud or Google), so it follows you to a new phone — you're largely covered. Adding an authenticator app is extra insurance, not a requirement."
  } else if (primary === "passkey") {
    headline = "Add a backup so a lost device can't lock you out."
    reason = "This passkey lives on this device only. Pleks holds rent and trust money, so we never want you locked out — add an authenticator app and a lost or replaced device can't shut you out of your account."
  } else {
    headline = "Add a backup so a lost phone can't lock you out."
    reason = "Your authenticator codes live on one phone. Pleks holds rent and trust money, so we never want you locked out — add a passkey and a lost phone can't shut you out, of your account or the people relying on you."
  }

  return (
    <>
      <h1 className="ob-heading">{headline}</h1>

      <div className="ob-security">
        <div className="ob-security-icon">
          {backupIsPasskey ? <FingerprintSvg size={40}/> : <ShieldSvg size={40} phase={0}/>}
        </div>
        <div className="ob-security-body">
          <div className="ob-security-desc" style={{ maxWidth: "48ch" }}>{reason}</div>
        </div>
      </div>

      <button
        type="button" className="ob-cta"
        onClick={backupIsPasskey ? onAddPasskeyBackup : onAddTotpBackup}
        disabled={isPasskeying}
      >
        <span className="ob-cta-bar"/>
        <span className="ob-cta-label">{isPasskeying ? "Setting up…" : addLabel}</span>
        <span className="ob-cta-arrow">{"→"}</span>
      </button>

      {passkeyFailed && (
        <p style={{ fontFamily: "var(--pub-sans)", fontSize: "12.5px", color: "var(--danger)", margin: "12px 0 0" }}>
          {passkeyError === "Cancelled" ? "Passkey setup was cancelled." : "That didn't take — give it another try."}
        </p>
      )}

      <div style={{ height: 14 }}/>

      {selfRecovering ? (
        <button type="button" className="ob-skip" onClick={onSkip} disabled={isPasskeying}>
          Skip for now — my passkey is backed up
        </button>
      ) : (
        <div className="ob-riskack">
          <label className="ob-riskack-label">
            <input type="checkbox" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} />
            <span>
              I understand that without a backup, losing my {backupIsPasskey ? "phone" : "device"} could lock me out — and getting back in would need my agency or Pleks support to reset it.
            </span>
          </label>
          <button type="button" className="ob-skip" onClick={onSkip} disabled={!riskAck || isPasskeying}>
            Continue without a backup
          </button>
        </div>
      )}

      <div className="ob-escape">
        <button type="button" onClick={onSignOut}>Sign out</button>
        <a href="mailto:support@pleks.co.za">Get help</a>
      </div>
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
