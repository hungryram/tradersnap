import { buildTrades } from "./tracker"
import type { TrackingStatus } from "./tracker"
import type { ClosedTrade, Fill } from "./types"

// Tradovate sends its trading data to the page over a WebSocket. contents/tradovate-bridge.ts passes the
// records here: today's fills (with the fee on each), which account each order belongs to, positions and
// contract names. The fills are turned into trades the same way as the TradingView reader (flat to flat).

type TvFill = { id: number; orderId: number; contractId: number; timestamp: string; action: string; qty: number; price: number }
type TvContract = { id: number; name: string; valuePerPoint?: number | null }

export function startTradovateTracking(options: {
  onTrades: (trades: ClosedTrade[]) => void
  onStatus: (status: TrackingStatus) => void
  onPositions?: (positions: Map<string, number>, largest?: Map<string, number>) => void
}): () => void {
  const accounts = new Map<number, string>()
  const contracts = new Map<number, TvContract>()
  const orderAccount = new Map<number, number>()
  const fills = new Map<number, TvFill>()
  const fees = new Map<number, number>()
  const netPos = new Map<string, number>() // `${accountId}|${contractId}` -> signed position
  const reported = new Set<string>()
  let synced = false
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  options.onStatus("loading")
  // The bridge only sees the sync if it loads after Pip does; if nothing arrives, the page needs a reload
  const noData = setTimeout(() => { if (!synced) options.onStatus("no-panel") }, 20000)

  const reportPositions = () => {
    if (!synced || !options.onPositions) return
    const bySymbol = new Map<string, number>()
    const largest = new Map<string, number>()
    for (const [key, qty] of netPos) {
      if (!qty) continue
      const name = contracts.get(Number(key.split("|")[1]))?.name
      if (!name) continue
      bySymbol.set(name, (bySymbol.get(name) ?? 0) + qty)
      largest.set(name, Math.max(largest.get(name) ?? 0, Math.abs(qty)))
    }
    options.onPositions(bySymbol, largest)
  }

  const flush = () => {
    const trades: ClosedTrade[] = []
    // Each account's fills are separate trades (a trader with several accounts copies the same trade to each)
    const byAccount = new Map<number, Fill[]>()
    for (const f of fills.values()) {
      const accountId = orderAccount.get(f.orderId)
      const contract = contracts.get(f.contractId)
      // Without an account or a contract name the trade can't be built yet; it is retried as more records arrive
      if (accountId === undefined || !contract || !Number.isFinite(Date.parse(f.timestamp))) continue
      if (!byAccount.has(accountId)) byAccount.set(accountId, [])
      byAccount.get(accountId)!.push({
        orderId: String(f.id),
        symbol: contract.name,
        qty: f.action === "Sell" ? -Math.abs(f.qty) : Math.abs(f.qty),
        price: f.price,
        time: Date.parse(f.timestamp),
        commission: fees.get(f.id) ?? null
      })
    }
    const valueOf = (symbol: string) => {
      for (const c of contracts.values()) if (c.name === symbol && c.valuePerPoint) return c.valuePerPoint
      return null
    }
    for (const [accountId, accountFills] of byAccount) {
      const open = new Map<string, number>()
      for (const [key, qty] of netPos) {
        const [a, c] = key.split("|").map(Number)
        const name = contracts.get(c)?.name
        if (a === accountId && name && qty) open.set(name, qty)
      }
      const name = accounts.get(accountId)
      trades.push(...buildTrades(accountFills, open, name ? `tradovate:${name}` : `tradovate:${accountId}`, "tradovate", valueOf))
    }
    const fresh = trades.filter(t => !reported.has(t.client_trade_id))
    if (fresh.length === 0) return
    fresh.forEach(t => reported.add(t.client_trade_id))
    options.onTrades(fresh)
  }
  const schedule = () => {
    // The fill, its fee and the position update arrive together; wait a moment so the trade has its fees
    clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, 1500)
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.data?.source !== "pip-tradovate") return
    const { kind, payload: p } = event.data
    switch (kind) {
      case "sync":
        for (const a of p.accounts ?? []) accounts.set(a.id, String(a.name))
        for (const c of p.contracts ?? []) contracts.set(c.id, c)
        for (const o of p.orders ?? []) orderAccount.set(o.id, o.accountId)
        for (const f of p.fills ?? []) fills.set(f.id, f)
        for (const f of p.fees ?? []) fees.set(f.id, f.fee)
        for (const pos of p.positions ?? []) netPos.set(`${pos.accountId}|${pos.contractId}`, pos.netPos)
        synced = true
        options.onStatus("tracking")
        reportPositions()
        schedule()
        break
      case "contracts":
        for (const c of p) contracts.set(c.id, { ...contracts.get(c.id), ...c })
        schedule()
        break
      case "order":
        orderAccount.set(p.id, p.accountId)
        break
      case "fill":
        fills.set(p.id, p)
        schedule()
        break
      case "fee":
        fees.set(p.id, p.fee)
        schedule()
        break
      case "position":
        // No sync seen (the page loaded before Pip): assume nothing was open, so this isn't mistaken for the baseline
        if (!synced) { synced = true; options.onStatus("tracking"); reportPositions() }
        netPos.set(`${p.accountId}|${p.contractId}`, p.netPos)
        reportPositions()
        schedule()
        break
    }
  }
  window.addEventListener("message", onMessage)

  return () => {
    window.removeEventListener("message", onMessage)
    clearTimeout(flushTimer)
    clearTimeout(noData)
  }
}
