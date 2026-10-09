import type { ClosedTrade, Position, Snapshot } from "./types"

// How long to wait for the platform's Realized PnL to update after a position
// disappears before falling back to the last unrealized PnL we saw
const REALIZED_WAIT_MS = 8000
// A Realized PnL change this close to a detected close belongs to it
const UNCLAIMED_WINDOW_MS = 5000

type Pending = {
  position: Position
  qty: number
  estimatedPnl: number | null
  realizedBefore: number | null
  openedAt: number | null
  detectedAt: number
}

// Turns a stream of page snapshots into closed trades. Pure logic, no DOM, so
// every platform reader shares it.
export class TradeTracker {
  private prev: Snapshot | null = null
  private openedAt = new Map<string, number | null>()
  private pending: Pending[] = []
  private unclaimed: { from: number; at: number } | null = null

  constructor(private platform: ClosedTrade["platform"]) {}

  tick(snapshot: Snapshot | null, now = Date.now()): ClosedTrade[] {
    const closed: ClosedTrade[] = []

    if (snapshot) {
      const prev = this.prev
      this.prev = snapshot

      if (!prev || prev.account !== snapshot.account) {
        // First look or a different account: positions already open have unknown open times
        this.openedAt = new Map(Array.from(snapshot.positions.keys(), symbol => [symbol, null]))
        this.pending = []
        this.unclaimed = null
        return closed
      }

      const realizedChanged = prev.realizedPnl !== null && snapshot.realizedPnl !== null && prev.realizedPnl !== snapshot.realizedPnl
      const newlyPending: Pending[] = []

      for (const [symbol, before] of prev.positions) {
        const after = snapshot.positions.get(symbol)
        let closedQty = 0
        if (!after || after.side !== before.side) closedQty = before.qty
        else if (after.qty < before.qty) closedQty = before.qty - after.qty
        if (closedQty === 0) continue

        newlyPending.push({
          position: before,
          qty: closedQty,
          estimatedPnl: before.unrealizedPnl === null ? null : before.unrealizedPnl * (closedQty / before.qty),
          realizedBefore: prev.realizedPnl,
          openedAt: this.openedAt.get(symbol) ?? null,
          detectedAt: now
        })
        if (!after) this.openedAt.delete(symbol)
        // A reversal (long -> short in one click) closes one trade and opens another
        if (after && after.side !== before.side) this.openedAt.set(symbol, now)
      }

      for (const symbol of snapshot.positions.keys()) {
        if (!prev.positions.has(symbol)) this.openedAt.set(symbol, now)
      }

      if (newlyPending.length > 0) {
        // Realized PnL sometimes updates a moment before the row disappears
        if (this.unclaimed && now - this.unclaimed.at <= UNCLAIMED_WINDOW_MS && !realizedChanged) {
          for (const pending of newlyPending) pending.realizedBefore = this.unclaimed.from
        }
        this.unclaimed = null
        this.pending.push(...newlyPending)
      } else if (realizedChanged && this.pending.length === 0) {
        this.unclaimed = { from: prev.realizedPnl!, at: now }
      }

      if (this.pending.length > 0 && snapshot.realizedPnl !== null) {
        const before = this.pending[0].realizedBefore
        if (before !== null && snapshot.realizedPnl !== before) {
          closed.push(...this.resolve(snapshot.realizedPnl - before, snapshot.realizedPnl, snapshot.account, now))
        }
      }
    }

    // Realized PnL never moved (or isn't shown): use the last unrealized PnL
    if (this.pending.length > 0 && now - this.pending[0].detectedAt > REALIZED_WAIT_MS) {
      closed.push(...this.pending.map(pending => this.toTrade(pending, pending.estimatedPnl, "estimated", null, this.prev?.account ?? null, now)))
      this.pending = []
    }

    return closed
  }

  // Splits one Realized PnL change across the trades that closed together
  private resolve(delta: number, realizedAfter: number, account: string | null, now: number): ClosedTrade[] {
    const pending = this.pending
    this.pending = []
    const estimates = pending.map(p => p.estimatedPnl ?? 0)
    const estimateTotal = estimates.reduce((sum, value) => sum + value, 0)

    return pending.map((p, i) => {
      const share = pending.length === 1 ? delta
        : estimateTotal !== 0 ? delta * (estimates[i] / estimateTotal)
        : delta / pending.length
      return this.toTrade(p, Math.round(share * 100) / 100, "realized", realizedAfter, account, now)
    })
  }

  private toTrade(
    pending: Pending,
    pnl: number | null,
    source: ClosedTrade["pnl_source"],
    realizedAfter: number | null,
    account: string | null,
    now: number
  ): ClosedTrade {
    const { position, qty } = pending
    // Same id from every tab watching this account: the account's realized total
    // after the close is shared state; estimates fall back to the minute
    const anchor = realizedAfter !== null ? `r${realizedAfter}` : `m${Math.floor(pending.detectedAt / 60000)}`
    return {
      client_trade_id: [this.platform, account, position.symbol, position.side, qty, position.avgPrice, anchor].join("|"),
      platform: this.platform,
      account,
      symbol: position.symbol,
      side: position.side,
      qty,
      entry_price: position.avgPrice,
      realized_pnl: pnl,
      pnl_source: source,
      opened_at: pending.openedAt ? new Date(pending.openedAt).toISOString() : null,
      closed_at: new Date(Math.min(pending.detectedAt, now)).toISOString()
    }
  }
}

// Polls the page once a second. Cheap (a few querySelectors) and survives the
// trading panel being re-rendered, which would orphan a MutationObserver.
export function startTradeTracking(options: {
  platform: ClosedTrade["platform"]
  read: () => Snapshot | null
  onTrade: (trade: ClosedTrade) => void
  intervalMs?: number
}): () => void {
  const tracker = new TradeTracker(options.platform)
  const timer = setInterval(() => {
    let snapshot: Snapshot | null = null
    try {
      snapshot = options.read()
    } catch (error) {
      console.warn("[Snapchart] Trade reader failed:", error)
    }
    for (const trade of tracker.tick(snapshot)) options.onTrade(trade)
  }, options.intervalMs ?? 1000)
  return () => clearInterval(timer)
}
