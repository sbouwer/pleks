/**
 * lib/extraction/archetypeClassifier.ts — Classify application archetype from filenames
 *
 * Uses Haiku with cached system prompt. Sends only filenames (not document content).
 *
 * Spec: ADDENDUM_14L D-14L-06
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { ARCHETYPE_SYSTEM_PROMPT, ARCHETYPE_USER_TEMPLATE } from "./prompts/archetype"
import type { ApplicationArchetype } from "./types"

const VALID_ARCHETYPES = new Set<string>([
  "residential-single",
  "residential-single-destressed",
  "residential-single-family",
  "residential-single-guarantee",
  "residential-multi",
  "commercial-single-director",
  "commercial-multi-director",
])

export async function classifyArchetype(
  filenames: string[],
  aiOpts: Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">,
): Promise<{ archetype: ApplicationArchetype | null; confidence: number }> {
  const { message } = await createMessage(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: ARCHETYPE_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: ARCHETYPE_USER_TEMPLATE(filenames),
        },
      ],
    },
    {
      orgId: aiOpts.orgId,
      purpose: "document_archetype_classification",
      suppressLogging: aiOpts.suppressLogging,
      harnessMode: aiOpts.harnessMode,
    },
  )

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  const jsonStart = text.indexOf("{")
  const jsonEnd   = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd <= jsonStart) return { archetype: null, confidence: 0 }

  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    archetype?: string
    confidence?: number
  }
  const archetype = parsed.archetype && VALID_ARCHETYPES.has(parsed.archetype)
    ? (parsed.archetype as ApplicationArchetype)
    : null

  return { archetype, confidence: parsed.confidence ?? 0 }
}
