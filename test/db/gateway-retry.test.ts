/**
 * test/db/gateway-retry.test.ts — the DB tier's gateway retry retries the gateway's transient answers and nothing else
 *
 * Auth:   none
 * Data:   a scripted fake fetch — no network
 * Notes:  Both directions: a planted 502-then-200 must succeed, and a Postgres-shaped error (409, 400, 500)
 *         must come back on the FIRST call, because retrying a real defect would hide it.
 */
import { describe, expect, it } from "vitest"
import { gatewayRetryFetch } from "./gateway-retry"

function scripted(statuses: number[]) {
  const calls: string[] = []
  const inner = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]
    return new Response(null, { status })
  }) as typeof fetch
  return { inner, calls }
}

const noSleep = async () => {}
const URL_ = "http://127.0.0.1:54321/rest/v1/organisations?select=*"

describe("gatewayRetryFetch", () => {
  it("PLANTED: a gateway 502 followed by 201 succeeds, and the retry is logged", async () => {
    const { inner, calls } = scripted([502, 201])
    const logs: string[] = []
    const res = await gatewayRetryFetch(inner, [1, 1], noSleep, (m) => logs.push(m))(URL_, { method: "POST" })
    expect(res.status).toBe(201)
    expect(calls).toHaveLength(2)
    expect(logs).toEqual([expect.stringContaining("gateway 502 on POST /rest/v1/organisations")])
  })

  it.each([503, 504])("retries %i too", async (status) => {
    const { inner, calls } = scripted([status, 200])
    const res = await gatewayRetryFetch(inner, [1], noSleep, () => {})(URL_)
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it.each([400, 401, 403, 404, 409, 500])("KNOWN-GOOD: a %i is returned on the first call, never retried", async (status) => {
    const { inner, calls } = scripted([status, 200])
    const logs: string[] = []
    const res = await gatewayRetryFetch(inner, [1, 1], noSleep, (m) => logs.push(m))(URL_)
    expect(res.status).toBe(status)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([])
  })

  it("gives up after the last delay and returns the gateway answer, so a down stack still fails", async () => {
    const { inner, calls } = scripted([502])
    const res = await gatewayRetryFetch(inner, [1, 1], noSleep, () => {})(URL_)
    expect(res.status).toBe(502)
    expect(calls).toHaveLength(3)
  })
})
