/**
 * Yodlee API client for bank feed integration.
 * Handles cobrand auth, user token generation, account management, and transaction fetching.
 *
 * Env vars required:
 *   YODLEE_BASE_URL        — https://sandbox.api.yodlee.com/ysl (or production)
 *   YODLEE_CLIENT_ID       — from Yodlee developer dashboard
 *   YODLEE_CLIENT_SECRET   — from Yodlee developer dashboard
 *   YODLEE_FASTLINK_URL    — FastLink widget URL
 *   YODLEE_CONFIG_NAME     — FastLink configuration name
 *   YODLEE_API_VERSION     — typically "1.1"
 */

export interface YodleeAccount {
  id: number
  providerAccountId: number
  providerId: number
  providerName: string
  accountName: string
  accountNumber?: string   // masked last 4
  accountType: string
  balance?: { amount: number; currency: string }
  lastUpdated: string
  dataset: Array<{ name: string; lastUpdated: string; nextUpdateScheduled: string }>
}

export interface YodleeTransaction {
  id: number
  date: string                    // YYYY-MM-DD
  amount: { amount: number; currency: string }
  baseType: "CREDIT" | "DEBIT"
  description: { original: string; simple?: string }
  category?: string
  status: string
  accountId: number
  FITID?: string
}

interface YodleeTokenResponse {
  token: { accessToken: string; issuedAt: string; expiresIn: number }
  user?: { id: number; loginName: string }
}

interface YodleeAccountsResponse {
  account?: YodleeAccount[]
}

interface YodleeTransactionsResponse {
  transaction?: YodleeTransaction[]
}

export class YodleeClient {
  private baseUrl: string
  private clientId: string
  private secret: string
  private apiVersion: string

  constructor() {
    this.baseUrl = process.env.YODLEE_BASE_URL ?? ""
    this.clientId = process.env.YODLEE_CLIENT_ID ?? ""
    this.secret = process.env.YODLEE_CLIENT_SECRET ?? ""
    this.apiVersion = process.env.YODLEE_API_VERSION ?? "1.1"
  }

  private headers(accessToken?: string): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Api-Version": this.apiVersion,
    }
    if (accessToken) h["Authorization"] = `Bearer ${accessToken}`
    return h
  }

  /** Generate a cobrand access token (admin-level, used to create user tokens) */
  async getCobrandToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: this.headers(),
      body: new URLSearchParams({
        clientId: this.clientId,
        secret: this.secret,
      }),
    })
    if (!res.ok) throw new Error(`Yodlee cobrand auth failed: ${res.status}`)
    const data = (await res.json()) as YodleeTokenResponse
    return data.token.accessToken
  }

  /** Register a new Yodlee user for an org (one-time per org) */
  async registerUser(cobrandToken: string, loginName: string): Promise<{ loginName: string }> {
    const res = await fetch(`${this.baseUrl}/user/register`, {
      method: "POST",
      headers: { ...this.headers(cobrandToken), "Content-Type": "application/json" },
      body: JSON.stringify({ user: { loginName, email: `${loginName}@pleks.app` } }),
    })
    if (!res.ok) throw new Error(`Yodlee user register failed: ${res.status}`)
    const data = (await res.json()) as { user: { loginName: string } }
    return { loginName: data.user.loginName }
  }

  /** Get a user-scoped access token (used for FastLink + all data calls) */
  async getUserToken(cobrandToken: string, loginName: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/user/accessTokens?appIds=10003600`, {
      method: "POST",
      headers: { ...this.headers(cobrandToken), "loginName": loginName },
    })
    if (!res.ok) throw new Error(`Yodlee user token failed: ${res.status}`)
    const data = (await res.json()) as YodleeTokenResponse
    return data.token.accessToken
  }

  /** Get all linked accounts for the user */
  async getAccounts(userToken: string): Promise<YodleeAccount[]> {
    const res = await fetch(`${this.baseUrl}/accounts`, {
      headers: this.headers(userToken),
    })
    if (!res.ok) throw new Error(`Yodlee getAccounts failed: ${res.status}`)
    const data = (await res.json()) as YodleeAccountsResponse
    return data.account ?? []
  }

  /** Get transactions since fromDate */
  async getTransactions(
    userToken: string,
    accountId: string,
    fromDate: string,   // YYYY-MM-DD
    toDate: string,
  ): Promise<YodleeTransaction[]> {
    const params = new URLSearchParams({
      accountId,
      fromDate,
      toDate,
    })
    const res = await fetch(`${this.baseUrl}/transactions?${params}`, {
      headers: this.headers(userToken),
    })
    if (!res.ok) throw new Error(`Yodlee getTransactions failed: ${res.status}`)
    const data = (await res.json()) as YodleeTransactionsResponse
    return data.transaction ?? []
  }

  /** Force a re-scrape of an account */
  async refreshAccount(userToken: string, providerAccountId: string): Promise<void> {
    await fetch(`${this.baseUrl}/providerAccounts?providerAccountIds=${providerAccountId}`, {
      method: "PUT",
      headers: this.headers(userToken),
    })
  }

  /** Delete / unlink an account */
  async deleteAccount(userToken: string, providerAccountId: string): Promise<void> {
    await fetch(`${this.baseUrl}/providerAccounts/${providerAccountId}`, {
      method: "DELETE",
      headers: this.headers(userToken),
    })
  }

  /** Get FastLink config for the frontend widget */
  getFastLinkConfig(userToken: string, callbackUrl: string) {
    return {
      fastLinkURL: process.env.YODLEE_FASTLINK_URL ?? "",
      accessToken: userToken,
      params: {
        configName: process.env.YODLEE_CONFIG_NAME ?? "Aggregation",
        flow: "aggregation" as const,
        callback: callbackUrl,
      },
    }
  }
}

export const yodlee = new YodleeClient()
