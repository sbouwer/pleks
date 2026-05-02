/**
 * lib/arrears/defaultSequences.ts — default arrears sequence step definitions
 *
 * Data:   static seed data; seeded into arrears_sequences + arrears_sequence_steps on org creation
 * Notes:  action_type values map to template keys in arrears-sequence/route.ts (BUILD_63).
 *         "letter_of_demand" → arrears.letter_of_demand; "pre_legal_notice" → arrears.final_notice.
 */
export const RESIDENTIAL_DEFAULT_SEQUENCE = [
  { step_number: 1, trigger_days: 3, action_type: "sms", tone: "friendly", ai_draft: true, requires_agent_approval: false },
  { step_number: 2, trigger_days: 7, action_type: "email", tone: "friendly", ai_draft: true, requires_agent_approval: false },
  { step_number: 3, trigger_days: 14, action_type: "email", tone: "firm", ai_draft: true, requires_agent_approval: false },
  { step_number: 4, trigger_days: 20, action_type: "letter_of_demand", tone: "formal", ai_draft: true, requires_agent_approval: true },
  { step_number: 5, trigger_days: 30, action_type: "pre_legal_notice", tone: "legal", ai_draft: true, requires_agent_approval: true },
  { step_number: 6, trigger_days: 45, action_type: "agent_task", tone: "legal", ai_draft: false, requires_agent_approval: false },
] as const

export const COMMERCIAL_DEFAULT_SEQUENCE = [
  { step_number: 1, trigger_days: 3, action_type: "email", tone: "friendly", ai_draft: true, requires_agent_approval: false },
  { step_number: 2, trigger_days: 10, action_type: "email", tone: "firm", ai_draft: true, requires_agent_approval: false },
  { step_number: 3, trigger_days: 20, action_type: "letter_of_demand", tone: "formal", ai_draft: true, requires_agent_approval: true },
  { step_number: 4, trigger_days: 30, action_type: "agent_task", tone: "legal", ai_draft: false, requires_agent_approval: false },
] as const
