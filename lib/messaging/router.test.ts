/**
 * lib/messaging/router.test.ts — M-3: SMS/WhatsApp legs honour opt-out (canSend) before dispatch
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const sendSMS = vi.fn()
const sendWhatsApp = vi.fn()
const sendEmail = vi.fn()
const canSend = vi.fn()
const getTemplate = vi.fn()

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => Promise.resolve({}) }))
vi.mock("@/lib/comms/send-email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }))
vi.mock("@/lib/sms/sendSMS", () => ({ sendSMS: (...a: unknown[]) => sendSMS(...a) }))
vi.mock("@/lib/whatsapp/sendWhatsApp", () => ({ sendWhatsApp: (...a: unknown[]) => sendWhatsApp(...a) }))
vi.mock("@/lib/comms/preferences", () => ({ canSend: (...a: unknown[]) => canSend(...a) }))
vi.mock("@/lib/comms/template-registry", () => ({ getTemplate: (...a: unknown[]) => getTemplate(...a) }))
// Frequency limiter is orthogonal to M-3 — always allow so the channel loop is reached.
vi.mock("./frequency", () => ({ checkFrequencyLimit: () => Promise.resolve({ allowed: true }) }))

import { routeAndSend, type RouteAndSendParams } from "./router"

const baseParams: RouteAndSendParams = {
  orgId: "org-1",
  templateKey: "arrears.reminder_step1",
  tenantId: "t-1",
  to: { email: "a@x.test", phone: "+2711", name: "Tenant" },
  subject: "Hi",
  smsBody: "body",
}

beforeEach(() => {
  vi.clearAllMocks()
  sendSMS.mockResolvedValue({ sent: true, logId: "log-sms" })
  sendWhatsApp.mockResolvedValue({ sent: true, logId: "log-wa" })
})

describe("routeAndSend — M-3 per-channel opt-out gate", () => {
  it("non-mandatory SMS: canSend refusal skips the send and surfaces the reason", async () => {
    getTemplate.mockReturnValue({ key: "arrears.reminder_step1", is_mandatory: false, allowed_channels: ["sms"] })
    canSend.mockResolvedValue({ allowed: false, reason: "opted_out_arrears" })

    const res = await routeAndSend(baseParams)

    expect(sendSMS).not.toHaveBeenCalled()
    expect(res.success).toBe(false)
    expect(res.error).toBe("sms_skipped:opted_out_arrears")
    // canSend was asked about the SMS leg specifically.
    expect(canSend).toHaveBeenCalledWith(expect.objectContaining({ channel: "sms" }))
  })

  it("non-mandatory SMS: canSend allow dispatches normally", async () => {
    getTemplate.mockReturnValue({ key: "arrears.reminder_step1", is_mandatory: false, allowed_channels: ["sms"] })
    canSend.mockResolvedValue({ allowed: true })

    const res = await routeAndSend(baseParams)

    expect(sendSMS).toHaveBeenCalledTimes(1)
    expect(res.success).toBe(true)
    expect(res.channel).toBe("sms")
  })

  it("mandatory templates bypass the opt-out gate entirely (canSend not consulted for the phone leg)", async () => {
    getTemplate.mockReturnValue({ key: "notice.demand", is_mandatory: true, allowed_channels: ["sms"] })

    const res = await routeAndSend({ ...baseParams, templateKey: "notice.demand" })

    expect(canSend).not.toHaveBeenCalled()
    expect(sendSMS).toHaveBeenCalledTimes(1)
    expect(res.success).toBe(true)
  })
})
