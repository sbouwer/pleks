// lib/rules/reformat.ts
// BUILD_44: Haiku AI reformat for informal property rules

import Anthropic from "@anthropic-ai/sdk"

const SYSTEM_PROMPT = `You are a property rules formatter for South African residential leases.

Rewrite the following informal property rule into formal, professional wording that matches the tone of a South African residential lease agreement.

Requirements:
- Use "The Lessee shall..." or "The Lessee shall not..." phrasing
- Be specific and unambiguous
- Use South African English spelling
- Keep to 1-3 sentences maximum
- Do not add legal disclaimers or penalty clauses — those belong in the lease terms
- Number sub-points if the rule has multiple parts

Example input: "no loud music after 10pm"
Example output: "The Lessee shall not play music or create noise audible beyond the boundaries of the Premises after 22:00 on any day. The Lessee shall ensure that all guests and visitors comply with this requirement."`

export async function reformatRule(informalText: string): Promise<string> {
  const client = new Anthropic()

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: informalText.trim(),
      },
    ],
  })

  const block = message.content[0]
  if (block.type !== "text") throw new Error("Unexpected response type from AI")
  return block.text.trim()
}
