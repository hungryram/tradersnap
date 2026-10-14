import type { ClosedTrade } from "./types"
import type { TrackingStatus } from "./tracker"

// TopstepX shows closed trades itself (entry and exit price, size, fees, P&L), and the page already
// downloads them. contents/topstepx-bridge.ts passes those records here. TopstepX splits a trade
// into one record per entry fill, so records that overlap in time are merged back into the one
// trade the trader saw (flat to flat), the same as the TradingView reader does.

export type TopstepRecord = {
  id: number
  accountId: number
  contractId?: string
  contractDisplayName?: string
  createdAt: string // when the entry fill happened
  exitedAt: string | null
  entryPrice: number
  exitPrice: number
  fees: number // all fees for the record, commission included
  pnL: number // before fees
  positionSize: number // negative: long. positive: short
  voided?: boolean
}

export const isTopstepRecord = (x: any): x is TopstepRecord =>
  !!x && typeof x.id === "number" && typeof x.accountId === "number" && typeof x.entryPrice === "number" &&
  typeof x.exitPrice === "number" && typeof x.pnL === "number" && typeof x.positionSize === "number" &&
  typeof x.createdAt === "string"

const round = (value: number, digits: number) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function buildTopstepTrades(records: TopstepRecord[], accountNames: Map<number, string> = new Map()): ClosedTrade[] {
  // Closed, valid records only, grouped per account and contract
  const groupsByKey = new Map<string, TopstepRecord[]>()
  for (const r of records) {
    if (r.voided || !r.exitedAt || !Number.isFinite(Date.parse(r.createdAt)) || !Number.isFinite(Date.parse(r.exitedAt))) continue
    const key = `${r.accountId}|${r.contractId ?? r.contractDisplayName ?? ""}`
    if (!groupsByKey.has(key)) groupsByKey.set(key, [])
    groupsByKey.get(key)!.push(r)
  }

  const trades: ClosedTrade[] = []
  for (const list of groupsByKey.values()) {
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id)

    // A record joins the current trade while the position it belongs to is still open
    const groups: TopstepRecord[][] = []
    let latestExit = -Infinity
    for (const r of list) {
      if (groups.length === 0 || Date.parse(r.createdAt) >= latestExit) {
        groups.push([r])
        latestExit = Date.parse(r.exitedAt!)
      } else {
        groups[groups.length - 1].push(r)
        latestExit = Math.max(latestExit, Date.parse(r.exitedAt!))
      }
    }

    for (const group of groups) {
      const first = group[0]
      const size = (r: TopstepRecord) => Math.abs(r.positionSize) || 1
      const totalSize = group.reduce((sum, r) => sum + size(r), 0)
      const pnl = group.reduce((sum, r) => sum + r.pnL - (r.fees || 0), 0)
      const name = accountNames.get(first.accountId)
      trades.push({
        client_trade_id: ["topstepx", first.accountId, first.id].join("|"),
        platform: "topstepx",
        account: name ? `topstepx:${name}` : `topstepx:${first.accountId}`,
        symbol: first.contractDisplayName ?? first.contractId ?? "?",
        side: first.positionSize < 0 ? "long" : "short",
        qty: totalSize,
        entry_price: round(group.reduce((sum, r) => sum + r.entryPrice * size(r), 0) / totalSize, 6),
        exit_price: round(group.reduce((sum, r) => sum + r.exitPrice * size(r), 0) / totalSize, 6),
        fill_count: group.length,
        realized_pnl: round(pnl, 2),
        pnl_source: "realized",
        opened_at: new Date(Math.min(...group.map(r => Date.parse(r.createdAt)))).toISOString(),
        closed_at: new Date(Math.max(...group.map(r => Date.parse(r.exitedAt!)))).toISOString()
      })
    }
  }
  return trades.sort((a, b) => a.closed_at.localeCompare(b.closed_at))
}

// Collects the records the bridge posts and reports each finished trade once per page load
// (the server ignores trades it already has, so a reload re-sending is harmless).
export function startTopstepTracking(options: {
  onTrades: (trades: ClosedTrade[]) => void
  onStatus: (status: TrackingStatus) => void
  onPositions?: (positions: Map<string, number>, largest?: Map<string, number>) => void
}): () => void {
  const records = new Map<number, TopstepRecord>()
  const names = new Map<number, string>()
  const reported = new Set<string>()
  let loaded = false
  // Open positions by TopstepX position id; null until the page's open-positions list has loaded
  let open: Map<number, { symbol: string; qty: number }> | null = null
  const reportPositions = () => {
    if (!open || !options.onPositions) return
    const bySymbol = new Map<string, number>()
    const largest = new Map<string, number>()
    for (const { symbol, qty } of open.values()) {
      bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + qty)
      largest.set(symbol, Math.max(largest.get(symbol) ?? 0, Math.abs(qty)))
    }
    options.onPositions(bySymbol, largest)
  }
  const symbolOf = (p: any) => String(p.contractDisplayName ?? p.symbolName ?? p.contractId ?? "?")
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  options.onStatus("loading")
  // The bridge only sees data that loads after Pip does; if nothing arrives, the page needs a reload
  const noData = setTimeout(() => { if (!loaded) options.onStatus("no-panel") }, 20000)

  const flush = () => {
    const fresh = buildTopstepTrades([...records.values()], names).filter(t => !reported.has(t.client_trade_id))
    if (fresh.length === 0) return
    fresh.forEach(t => reported.add(t.client_trade_id))
    options.onTrades(fresh)
  }

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.data?.source !== "pip-topstepx") return
    const { kind, payload } = event.data
    if (kind === "accounts" && Array.isArray(payload)) {
      for (const a of payload) if (typeof a?.accountId === "number") names.set(a.accountId, String(a.nickname || a.accountName))
    }
    // The page's list of open positions (positive size: long, negative: short). The first report is the
    // baseline, so positions that were already open when the page loaded don't count as new.
    if (kind === "positions" && Array.isArray(payload)) {
      open = new Map()
      for (const p of payload) if (typeof p?.id === "number" && p.positionSize) open.set(p.id, { symbol: symbolOf(p), qty: p.positionSize })
      reportPositions()
    }
    // A live position update: action 0 created, 1 changed, 2 deleted (closed)
    if (kind === "position" && payload?.position && typeof payload.position.id === "number") {
      const { action, position } = payload
      // No open-positions list seen (the page loaded before Pip): assume nothing was open, so this isn't mistaken for the baseline
      if (!open) { open = new Map(); reportPositions() }
      if (action === 2 || !position.positionSize) open.delete(position.id)
      else open.set(position.id, { symbol: symbolOf(position), qty: position.positionSize })
      reportPositions()
    }
    if (kind === "trades" && Array.isArray(payload)) {
      loaded = true
      options.onStatus("tracking")
      for (const r of payload) if (isTopstepRecord(r)) records.set(r.id, r)
      // Records of one trade arrive together; wait a moment so they're merged before reporting
      clearTimeout(flushTimer)
      flushTimer = setTimeout(flush, 1500)
    }
  }
  window.addEventListener("message", onMessage)

  return () => {
    window.removeEventListener("message", onMessage)
    clearTimeout(flushTimer)
    clearTimeout(noData)
  }
}
