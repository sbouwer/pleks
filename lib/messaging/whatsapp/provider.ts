import { createHmac, timingSafeEqual } from "node:crypto"

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface WASendParams {
  to: string
  templateName: string
  parameters: string[]
  orgId: string
  leaseId?: string
}

export interface WASendResult {
  messageId?: string
  error?: string
}

export interface WAInboundMessage {
  from: string
  body: string
  messageId: string
  timestamp?: string
}

export interface WATemplateApproval {
  templateName: string
  status: string
  rejectionReason?: string
}

export interface WAWebhookEvent {
  type: "delivery_status" | "inbound_message" | "template_approval" | "unknown"
  messageId?: string
  status?: string
  failureReason?: string
  inbound?: WAInboundMessage
  templateApproval?: WATemplateApproval
  raw: unknown
}

// ── Env helpers ────────────────────────────────────────────────────────────────

function getApiKey(): string {
  return process.env.WA_API_KEY ?? process.env.AT_API_KEY ?? ""
}

function getUsername(): string {
  return process.env.WA_USERNAME ?? process.env.AT_USERNAME ?? ""
}

function isSandbox(): boolean {
  return process.env.WA_SANDBOX === "true" || process.env.AT_USERNAME === "sandbox"
}

function getBaseUrl(): string {
  if (isSandbox()) {
    return "https://api.sandbox.africastalking.com/chat/whatsapp/v1"
  }
  return "https://api.africastalking.com/chat/whatsapp/v1"
}

// ── Send ───────────────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(params: WASendParams): Promise<WASendResult> {
  const apiKey = getApiKey()
  const username = getUsername()

  if (!apiKey || !username) {
    return { error: "Africa's Talking WhatsApp credentials not configured" }
  }

  const phoneId = process.env.WA_BUSINESS_PHONE_ID
  if (!phoneId) {
    return { error: "WA_BUSINESS_PHONE_ID not configured" }
  }

  const body = {
    username,
    phoneNumberId: phoneId,
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      components: buildTemplateComponents(params.parameters),
    },
  }

  try {
    const response = await fetch(`${getBaseUrl()}/message`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      return { error: `AT WhatsApp API error: ${response.status} ${text}` }
    }

    const data = (await response.json()) as Record<string, unknown>
    const messageId = extractMessageId(data)
    return { messageId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "WhatsApp send failed" }
  }
}

function buildTemplateComponents(parameters: string[]): unknown[] {
  if (parameters.length === 0) return []
  return [
    {
      type: "body",
      parameters: parameters.map((value) => ({ type: "text", text: value })),
    },
  ]
}

function extractMessageId(data: Record<string, unknown>): string | undefined {
  if (typeof data.messageId === "string") return data.messageId
  if (typeof data.message_id === "string") return data.message_id
  const messages = data.messages
  if (Array.isArray(messages) && messages.length > 0) {
    const first = messages[0] as Record<string, unknown>
    if (typeof first.id === "string") return first.id
  }
  return undefined
}

// ── Webhook verification ───────────────────────────────────────────────────────

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.WA_WEBHOOK_SECRET
  if (!secret) return false

  try {
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
    const expectedBuf = Buffer.from(expected, "utf8")
    const signatureBuf = Buffer.from(signature.replace(/^sha256=/, ""), "utf8")

    if (expectedBuf.length !== signatureBuf.length) return false
    return timingSafeEqual(expectedBuf, signatureBuf)
  } catch {
    return false
  }
}

// ── Webhook parsing ────────────────────────────────────────────────────────────

export function parseWebhookEvent(raw: unknown): WAWebhookEvent {
  const payload = raw as Record<string, unknown>
  const eventType = payload.type as string | undefined

  if (eventType === "messages.message_delivery_status_update") {
    return parseDeliveryStatus(payload, raw)
  }

  if (eventType === "messages.message_received") {
    return parseInboundMessage(payload, raw)
  }

  if (eventType === "templates.template_approval_status_update") {
    return parseTemplateApproval(payload, raw)
  }

  return { type: "unknown", raw }
}

function parseDeliveryStatus(payload: Record<string, unknown>, raw: unknown): WAWebhookEvent {
  const data = (payload.data ?? payload) as Record<string, unknown>
  return {
    type: "delivery_status",
    messageId: data.messageId as string | undefined ?? data.message_id as string | undefined,
    status: data.status as string | undefined,
    failureReason: data.failureReason as string | undefined ?? data.failure_reason as string | undefined,
    raw,
  }
}

function parseInboundMessage(payload: Record<string, unknown>, raw: unknown): WAWebhookEvent {
  const data = (payload.data ?? payload) as Record<string, unknown>
  const message = (data.message ?? data) as Record<string, unknown>
  return {
    type: "inbound_message",
    messageId: message.id as string | undefined,
    inbound: {
      from: message.from as string ?? data.from as string ?? "",
      body: extractMessageBody(message),
      messageId: message.id as string ?? "",
      timestamp: message.timestamp as string | undefined,
    },
    raw,
  }
}

function extractMessageBody(message: Record<string, unknown>): string {
  if (typeof message.body === "string") return message.body
  const text = message.text as Record<string, unknown> | undefined
  if (text && typeof text.body === "string") return text.body
  return ""
}

function parseTemplateApproval(payload: Record<string, unknown>, raw: unknown): WAWebhookEvent {
  const data = (payload.data ?? payload) as Record<string, unknown>
  return {
    type: "template_approval",
    templateApproval: {
      templateName: data.templateName as string ?? data.template_name as string ?? "",
      status: data.status as string ?? "",
      rejectionReason: data.rejectionReason as string | undefined ?? data.rejection_reason as string | undefined,
    },
    raw,
  }
}
