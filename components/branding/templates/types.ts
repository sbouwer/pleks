export interface CoverIdentity {
  name: string
  tradingAs: string | null
  registration: string | null
  eaab: string | null
  address: string
  phone: string
  email: string
  website: string | null
}

export interface CoverBranding {
  logoUrl: string | null
  accentColor: string
}

/** Party details shown on the document cover. Optional — omit for pure branding previews. */
export interface CoverParties {
  lessorName: string
  lessorAddress: string | null
  /** null = managing agent not applicable (landlord self-manages) */
  agentName: string | null
  agentContact: string | null
  lesseeName: string
  lessee2Name: string | null
  lesseeAddress: string | null
  lesseeContact: string | null
}

export interface CoverTemplateProps {
  identity: CoverIdentity
  branding: CoverBranding
  leaseType?: string
  /** Omit for the Settings branding preview; provide for lease document covers */
  parties?: CoverParties | null
}
