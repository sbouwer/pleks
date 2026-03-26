"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { createAccountAndOrg, type OnboardingData } from "@/lib/actions/onboarding"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Plus, X, Building2, User, Users, Heart, Eye, Info } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

type UserType = "owner" | "agent" | "agency" | "family" | "exploring"

interface BankFieldsProps {
  bankName: string
  setBankName: (v: string) => void
  accountHolder: string
  setAccountHolder: (v: string) => void
  accountNumber: string
  setAccountNumber: (v: string) => void
  branchCode: string
  setBranchCode: (v: string) => void
  accountType: string
  setAccountType: (v: string) => void
}

function BankFields({ bankName, setBankName, accountHolder, setAccountHolder, accountNumber, setAccountNumber, branchCode, setBranchCode, accountType, setAccountType }: Readonly<BankFieldsProps>) {
  return (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Bank name *</Label>
        <Select value={bankName} onValueChange={(v) => setBankName(v ?? "")}>
          <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
          <SelectContent>
            {SA_BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Account holder name</Label>
        <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Account number</Label>
        <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label>Branch code</Label>
        <Input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label>Account type</Label>
        <Select value={accountType} onValueChange={(v) => setAccountType(v ?? "savings")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="savings">Savings</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
            <SelectItem value="transmission">Transmission</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

const SA_BANKS = [
  "ABSA", "Capitec", "FNB", "Investec", "Nedbank", "Standard Bank",
  "African Bank", "Discovery Bank", "TymeBank", "Other",
]

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground text-center mt-20">Loading...</div>}>
      <OnboardingWizard />
    </Suspense>
  )
}

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSetup = searchParams.get("setup") === "true"

  const [userType, setUserType] = useState<UserType | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  // Shared state
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

  // Account creation (final step)
  const [acctEmail, setAcctEmail] = useState("")
  const [acctPassword, setAcctPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [emailExists, setEmailExists] = useState(false)
  const [isAlreadyAuthenticated, setIsAlreadyAuthenticated] = useState(false)
  const [skipQuickFinish, setSkipQuickFinish] = useState(false)

  // Check if user already has a Supabase auth session
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
      .catch(() => {
        // Not authenticated — that's fine, they'll create an account
      })
  }, [])

  function getTotalSteps(): number {
    if (!userType) return 0
    if (userType === "exploring") return 1
    // Account creation step added unless already authenticated
    const acctStep = isAlreadyAuthenticated ? 0 : 1
    if (userType === "owner" || userType === "family") return 3 + acctStep
    if (userType === "agent") return 4 + acctStep
    return 5 + acctStep // agency
  }


  function handleTypeSelect(type: UserType) {
    setUserType(type)
    setStep(1)
  }

  function getManagementScope(): string {
    if (userType === "agent" || userType === "agency") return "others_only"
    return "own_only"
  }

  function getBankAccountType(): "trust" | "deposit_holding" | "ppra_trust" {
    if (ppraStatus === "registered") return "ppra_trust"
    if (userType === "agent" || userType === "agency") return "trust"
    return "deposit_holding"
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

    function buildOrgName() {
      if (userType === "owner" || userType === "family") {
        return name ? `${name.split(" ")[0]}'s Properties` : "My Properties"
      }
      return tradingAs || name
    }
    const orgName = buildOrgName()

    const submitData: OnboardingData = {
      userType: userType!,
      name: orgName,
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
    if (result?.error) {
      if (result.errorType === "already_exists") {
        globalThis.location.href = "/dashboard"
        return
      }
      if (result.errorType === "email_exists") {
        setEmailExists(true)
      }
      toast.error(result.error)
      setLoading(false)
      return
    }
    globalThis.location.href = "/dashboard?onboarding=complete"
  }

  async function checkEmailExists(emailToCheck: string) {
    if (!emailToCheck || emailToCheck.length < 5) return
    const res = await fetch("/api/auth/check-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailToCheck.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      setEmailExists(data.exists === true)
    }
  }

  const totalSteps = getTotalSteps()
  const progress = totalSteps > 0 ? (step / totalSteps) * 100 : 0

  // ─── Progress bar ───────────────────────────────────────

  const progressBar = (
    <div className="mb-6">
      <div className="h-1 bg-border/50 rounded-full overflow-hidden">
        <div className="h-full bg-brand transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={() => setStep(step === 1 ? 0 : step - 1)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="size-3" /> Back
        </button>
        <span className="text-xs text-muted-foreground">Step {step} of {totalSteps}</span>
      </div>
    </div>
  )

  // ─── RETURNING USER: Quick finish ─────────────────────

  // If user already has auth but no org AND hasn't picked a type yet,
  // show a quick "finish setup" screen instead of the full wizard
  if (step === 0 && isAlreadyAuthenticated && !isSetup && !skipQuickFinish) {
    const displayName = name?.split(" ")[0] || acctEmail?.split("@")[0] || ""
    return (
      <div className="max-w-sm mx-auto space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl mb-2">Welcome back{displayName ? `, ${displayName}` : ""}</h1>
          <p className="text-sm text-muted-foreground">
            You started setting up before. Let&apos;s finish your account.
          </p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Your name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" />
          </div>
          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" type="tel" />
          </div>
          <Button
            className="w-full"
            onClick={async () => {
              setLoading(true)
              const emailToUse = acctEmail || email
              if (!emailToUse) {
                toast.error("Session error — please refresh and try again.")
                setLoading(false)
                return
              }
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
                if (result.errorType === "already_exists") {
                  globalThis.location.href = "/dashboard"
                  return
                }
                if (result.errorType === "auth_required") {
                  globalThis.location.href = `/login?redirect=/onboarding&email=${encodeURIComponent(emailToUse)}`
                  return
                }
                toast.error(result.error)
                setLoading(false)
                return
              }
              globalThis.location.href = "/dashboard?onboarding=complete"
            }}
            disabled={loading || (!name.trim())}
          >
            {loading ? "Setting up..." : "Go to dashboard →"}
          </Button>
          <button
            type="button"
            onClick={() => setSkipQuickFinish(true)}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            I want to choose a different account type
          </button>
        </div>
      </div>
    )
  }

  // ─── STEP 0: Type selection ─────────────────────────────

  if (step === 0) {
    const allTypes: Array<{ type: UserType; icon: typeof Building2; title: string; desc: string }> = [
      { type: "owner", icon: Building2, title: "I own rental properties", desc: "Manage your own portfolio" },
      { type: "agent", icon: User, title: "I'm a property agent / manager", desc: "You manage properties for clients" },
      { type: "agency", icon: Users, title: "We're a team or agency", desc: "Multiple staff, business entity" },
      { type: "family", icon: Heart, title: "I'm helping a family member or friend", desc: "Informal arrangement, not a business" },
      { type: "exploring", icon: Eye, title: "Just exploring for now", desc: "I want to see what Pleks can do" },
    ]
    // Hide "exploring" when coming from demo setup — they already explored
    const types = isSetup ? allTypes.filter((t) => t.type !== "exploring") : allTypes

    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl mb-2">
            {isSetup ? "Choose your account type" : "How will you be using Pleks?"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSetup ? "You're upgrading from demo mode." : "We'll set up your account to match."}
          </p>
        </div>
        <div className="space-y-3">
          {types.map((t) => (
            <Card key={t.type} className="cursor-pointer hover:border-brand/50 transition-colors" onClick={() => handleTypeSelect(t.type)}>
              <CardContent className="py-4 flex items-center gap-4">
                <t.icon className="size-6 text-brand shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground ml-auto shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
        {isSetup && (
          <Button variant="ghost" size="sm" onClick={() => router.push("/demo")} className="w-full text-muted-foreground">
            ← Back to demo
          </Button>
        )}
      </div>
    )
  }

  // ─── EXPLORING: Step 1 ──────────────────────────────────

  if (userType === "exploring" && step === 1) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">What&apos;s your name?</h2>
        <p className="text-sm text-muted-foreground mb-6">That&apos;s all we need to get you started.</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Your name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </div>
          <div className="space-y-2">
            <Label>Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" type="tel" />
          </div>
          <Button className="w-full" onClick={handleComplete} disabled={!name.trim() || loading}>
            {loading ? "Setting up..." : "Explore Pleks →"}
          </Button>
        </div>
      </div>
    )
  }

  // ─── OWNER / FAMILY: Step 1 ─────────────────────────────

  if ((userType === "owner" || userType === "family") && step === 1) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Tell us about yourself</h2>
        <p className="text-sm text-muted-foreground mb-6">Just the basics — no company details needed.</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Your name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </div>
          <div className="space-y-2">
            <Label>Phone number *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" type="tel" required />
          </div>
          <div className="space-y-2">
            <Label>City &amp; Province</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" />
          </div>
          <Button className="w-full" onClick={() => setStep(2)} disabled={!name.trim() || !phone.trim()}>Continue →</Button>
        </div>
      </div>
    )
  }

  // ─── OWNER / FAMILY: Step 2 — Deposit account ──────────

  if ((userType === "owner" || userType === "family") && step === 2) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Deposit account</h2>
        <p className="text-sm text-muted-foreground mb-4">Do you have a separate account for holding tenant deposits?</p>
        <Card className="mb-4 border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-3 text-xs text-blue-200 leading-relaxed">
            The Rental Housing Act requires deposits to be held in a separate interest-bearing account. This can be a savings account at any SA bank.
          </CardContent>
        </Card>
        {hasBankAccount === null && (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setHasBankAccount(true)}>Yes, I have one</Button>
            <Button variant="outline" className="flex-1" onClick={() => setHasBankAccount(false)}>Not yet</Button>
          </div>
        )}
        {hasBankAccount === true && (
          <>
            <BankFields bankName={bankName} setBankName={setBankName} accountHolder={accountHolder} setAccountHolder={setAccountHolder} accountNumber={accountNumber} setAccountNumber={setAccountNumber} branchCode={branchCode} setBranchCode={setBranchCode} accountType={accountType} setAccountType={setAccountType} />
            <Button className="w-full mt-4" onClick={() => setStep(3)} disabled={!bankName}>Continue →</Button>
          </>
        )}
        {hasBankAccount === false && (
          <div className="space-y-4 mt-4">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-3 text-xs text-amber-200 leading-relaxed">
                Deposit receipts and Tribunal documentation will be restricted until you add this. You can add it later in Settings.
              </CardContent>
            </Card>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={bankDeclineAck} onChange={(e) => setBankDeclineAck(e.target.checked)} className="accent-brand mt-0.5" />
              <span className="text-xs text-muted-foreground">I understand — I&apos;ll set this up later</span>
            </label>
            <Button className="w-full" onClick={() => setStep(3)} disabled={!bankDeclineAck}>Continue →</Button>
          </div>
        )}
      </div>
    )
  }

  // ─── OWNER / FAMILY: Step 3 — Account creation or Done ──

  if ((userType === "owner" || userType === "family") && step === 3) {
    if (isAlreadyAuthenticated) {
      return (
        <div className="max-w-sm mx-auto">
          {progressBar}
          <h2 className="font-heading text-xl mb-4">You&apos;re all set</h2>
          <p className="text-sm text-muted-foreground mb-6">Your free Owner account is ready.</p>
          <Button className="w-full" onClick={handleComplete} disabled={loading}>
            {loading ? "Setting up..." : "Go to dashboard →"}
          </Button>
        </div>
      )
    }
    return renderAccountStep()
  }

  // ─── AGENT: Step 1 ──────────────────────────────────────

  if (userType === "agent" && step === 1) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-4">Tell us about yourself</h2>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Your full name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-2"><Label>Trading name *</Label><Input value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="e.g. Smith Property Management" required /></div>
          <div className="space-y-2"><Label>Phone number *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required /></div>
          <div className="space-y-2"><Label>City &amp; Province</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></div>
          <div className="space-y-2"><Label>Company reg number</Label><Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} placeholder="Optional" /></div>
          <Button className="w-full" onClick={() => setStep(2)} disabled={!name.trim() || !tradingAs.trim() || !phone.trim()}>Continue →</Button>
        </div>
      </div>
    )
  }

  // ─── AGENCY: Step 1 ─────────────────────────────────────

  if (userType === "agency" && step === 1) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-4">Tell us about your agency</h2>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Agency / company name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-2"><Label>Trading as</Label><Input value={tradingAs} onChange={(e) => setTradingAs(e.target.value)} placeholder="If different from company name" /></div>
          <div className="space-y-2"><Label>Registration number *</Label><Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} required /></div>
          <div className="space-y-2"><Label>VAT number</Label><Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Optional" /></div>
          <div className="space-y-2"><Label>Phone number *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" required /></div>
          <div className="space-y-2"><Label>City &amp; Province</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Cape Town, WC" /></div>
          <Button className="w-full" onClick={() => setStep(2)} disabled={!name.trim() || !regNumber.trim() || !phone.trim()}>Continue →</Button>
        </div>
      </div>
    )
  }

  // ─── AGENT / AGENCY: Step 2 — PPRA ─────────────────────

  if ((userType === "agent" || userType === "agency") && step === 2) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Are you registered with the PPRA?</h2>
        <Card className="my-4 border-blue-500/20 bg-blue-500/5">
          <CardContent className="py-3 text-xs text-blue-200 leading-relaxed">
            The Property Practitioners Act 22 of 2019 requires anyone managing property for others to register with the PPRA and hold a valid Fidelity Fund Certificate (FFC).
          </CardContent>
        </Card>
        {ppraStatus === null ? (
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => setPpraStatus("registered")}>Yes, I&apos;m registered</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setPpraStatus("in_progress")}>Not yet — I&apos;m in the process</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setPpraStatus("none")}>No — I manage informally</Button>
          </div>
        ) : ppraStatus === "registered" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>FFC Number (optional)</Label>
              <Input value={ppraFfc} onChange={(e) => setPpraFfc(e.target.value)} placeholder="Your FFC number" />
            </div>
            <Button className="w-full" onClick={() => setStep(3)}>Continue →</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-3 text-xs text-amber-200 leading-relaxed">
                You can still use Pleks. Note that managing property for others without PPRA registration may have legal implications.
              </CardContent>
            </Card>
            <Button className="w-full" onClick={() => setStep(3)}>Continue →</Button>
          </div>
        )}
      </div>
    )
  }

  // ─── AGENT / AGENCY: Step 3 — Trust account ────────────

  if ((userType === "agent" || userType === "agency") && step === 3) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Trust account</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {ppraStatus === "registered" ? "Do you have a PPRA-registered trust account?" : "Do you have a separate account for holding tenant funds?"}
        </p>
        {hasBankAccount === null && (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setHasBankAccount(true)}>Yes</Button>
            <Button variant="outline" className="flex-1" onClick={() => setHasBankAccount(false)}>Not yet</Button>
          </div>
        )}
        {hasBankAccount === true && (
          <>
            <BankFields bankName={bankName} setBankName={setBankName} accountHolder={accountHolder} setAccountHolder={setAccountHolder} accountNumber={accountNumber} setAccountNumber={setAccountNumber} branchCode={branchCode} setBranchCode={setBranchCode} accountType={accountType} setAccountType={setAccountType} />
            <Button className="w-full mt-4" onClick={() => setStep(4)} disabled={!bankName}>Continue →</Button>
          </>
        )}
        {hasBankAccount === false && (
          <div className="space-y-4 mt-4">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-3 text-xs text-amber-200 leading-relaxed">
                Owner statements and deposit management will be restricted until you add banking details. You can add them later in Settings.
              </CardContent>
            </Card>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={bankDeclineAck} onChange={(e) => setBankDeclineAck(e.target.checked)} className="accent-brand mt-0.5" />
              <span className="text-xs text-muted-foreground">I understand — I&apos;ll set this up later</span>
            </label>
            <Button className="w-full" onClick={() => setStep(4)} disabled={!bankDeclineAck}>Continue →</Button>
          </div>
        )}
      </div>
    )
  }

  // ─── AGENCY: Step 4 — Invite team ───────────────────────

  if (userType === "agency" && step === 4) {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Invite your team</h2>
        <p className="text-sm text-muted-foreground mb-4">Add team members now or skip and invite later from Settings.</p>
        <div className="space-y-3">
          {invites.map((invite, i) => (
            <div key={`invite-${i}`} className="flex gap-2">
              <Input placeholder="Email" type="email" value={invite.email} onChange={(e) => { const u = [...invites]; u[i] = { ...u[i], email: e.target.value }; setInvites(u) }} className="flex-1" />
              <Select value={invite.role} onValueChange={(v) => { const u = [...invites]; u[i] = { ...u[i], role: v ?? "property_manager" }; setInvites(u) }}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="property_manager">Property Manager</SelectItem>
                  <SelectItem value="letting_agent">Letting Agent</SelectItem>
                  <SelectItem value="accountant">Accountant</SelectItem>
                  <SelectItem value="maintenance_manager">Maintenance</SelectItem>
                </SelectContent>
              </Select>
              {invites.length > 1 && <Button variant="ghost" size="icon" onClick={() => setInvites(invites.filter((_, j) => j !== i))}><X className="size-4" /></Button>}
            </div>
          ))}
          <button type="button" onClick={() => setInvites([...invites, { email: "", role: "property_manager" }])} className="text-xs text-brand hover:underline flex items-center gap-1">
            <Plus className="size-3" /> Add another
          </button>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={() => { setInvites([]); setStep(5) }}>Skip for now</Button>
          <Button className="flex-1" onClick={() => setStep(5)}>Send invites &amp; continue →</Button>
        </div>
      </div>
    )
  }

  // ─── Final step — Account creation or Done ──────────────

  if (
    (userType === "agent" && step === 4) ||
    (userType === "agency" && step === 5)
  ) {
    if (isAlreadyAuthenticated) {
      return (
        <div className="max-w-sm mx-auto">
          {progressBar}
          <h2 className="font-heading text-xl mb-4">You&apos;re all set</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Your free Owner account is ready. Upgrade to Steward or Portfolio anytime from Settings.
          </p>
          <Button className="w-full" onClick={handleComplete} disabled={loading}>
            {loading ? "Setting up..." : "Go to dashboard →"}
          </Button>
        </div>
    )
    }
    return renderAccountStep()
  }

  // Account step for agent (step 5) or agency (step 6) when not already authenticated
  if (
    (!isAlreadyAuthenticated) &&
    ((userType === "agent" && step === 5) || (userType === "agency" && step === 6))
  ) {
    return renderAccountStep()
  }

  return null

  // ─── Account creation step (shared) ─────────────────

  function renderAccountStep() {
    return (
      <div className="max-w-sm mx-auto">
        {progressBar}
        <h2 className="font-heading text-xl mb-1">Almost there</h2>
        <p className="text-sm text-muted-foreground mb-6">Create your account to save your setup.</p>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="acct-email">Email address *</Label>
            <Input
              id="acct-email"
              type="email"
              autoComplete="email"
              value={acctEmail}
              onChange={(e) => { setAcctEmail(e.target.value); setEmailExists(false) }}
              onBlur={() => checkEmailExists(acctEmail)}
              placeholder="you@example.com"
              required
            />
            {emailExists && (
              <div className="rounded-md bg-brand/5 border border-brand/30 p-3 text-sm flex items-start gap-2">
                <Info className="size-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">This email is already registered.</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Did you start setting up before?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        globalThis.location.href = `/login?redirect=/onboarding&email=${encodeURIComponent(acctEmail)}`
                      }}
                      className="text-brand underline"
                    >
                      Sign in to continue →
                    </button>
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="acct-password">Password *</Label>
            <div className="relative">
              <Input
                id="acct-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={acctPassword}
                onChange={(e) => setAcctPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="pr-10"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <X className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            className="w-full"
            onClick={handleComplete}
            disabled={loading || !acctEmail.trim() || acctPassword.length < 8}
          >
            {loading ? "Creating account..." : "Create account →"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By creating an account you agree to our{" "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms</Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>
          </p>
        </div>
      </div>
    )
  }
}
