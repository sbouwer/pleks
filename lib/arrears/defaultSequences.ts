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
