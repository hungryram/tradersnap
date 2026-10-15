// Traders with several accounts (prop firm evals) often copy one trade to all of them. Those copies are
// one decision, so they count once toward trade counts, win rates, loss streaks and the max-trades limit.
// Profit and loss still adds up across every account: nothing is dropped, only the counting changes.
//
// A copy is a trade on a different account, same instrument and direction, opened within 15 seconds.

const WINDOW_MS = 15_000

type CopyCandidate = {
  account?: string | null
  symbol?: string | null
  side?: string | null
  opened_at?: string | null
  closed_at: string
  realized_pnl: number | null
  kind?: string
}

// "CME_MINI:MNQZ2026", "MNQZ6" and "MNQ1!" are all the same instrument: MNQ
export function instrumentOf(symbol: string) {
  const ticker = symbol.split(":").pop() ?? symbol
  return (ticker.replace(/[FGHJKMNQUVXZ]\d{1,4}$/, "").replace(/\d+!$/, "") || ticker).toUpperCase()
}

export type CopyMark = {
  is_copy: boolean // not the first of its group: leave it out of counts
  copies: number // trades in the group (accounts it was copied to); 1 when alone
  group_pnl: number // profit and loss of the whole group (for win/loss decisions)
  group_of: string | null // the same for every trade in a copied group (the first trade's id), null when alone
}

export function markCopies<T extends CopyCandidate>(trades: T[]): (T & CopyMark)[] {
  const out = trades.map(t => ({ ...t, is_copy: false, copies: 1, group_pnl: Number(t.realized_pnl ?? 0), group_of: null })) as (T & CopyMark)[]
  const timeOf = (t: CopyCandidate) => Date.parse(t.opened_at ?? t.closed_at)

  type Group = { rep: number; accounts: Set<string>; time: number; members: number[] }
  const groupsByKey = new Map<string, Group[]>()
  const order = out.map((_, i) => i).sort((a, b) => timeOf(out[a]) - timeOf(out[b]))

  for (const i of order) {
    const t = out[i]
    // Trades the trader reported by hand, day totals and trades without an account are never copies
    if (t.kind === "day_total" || !t.account || !t.symbol || !t.side || !Number.isFinite(timeOf(t))) continue
    const key = `${instrumentOf(t.symbol)}|${t.side}`
    const groups = groupsByKey.get(key) ?? []
    const at = timeOf(t)
    // Only the latest few groups can still be within the window (trades are walked in time order)
    const group = groups.slice(-3).reverse().find(g => at - g.time <= WINDOW_MS && !g.accounts.has(t.account!))
    if (group) {
      group.accounts.add(t.account)
      group.members.push(i)
      t.is_copy = true
    } else {
      groups.push({ rep: i, accounts: new Set([t.account]), time: at, members: [i] })
      groupsByKey.set(key, groups)
    }
  }

  for (const groups of groupsByKey.values()) {
    for (const g of groups) {
      const pnl = g.members.reduce((sum, m) => sum + Number(out[m].realized_pnl ?? 0), 0)
      const groupOf = g.members.length > 1 ? String((out[g.rep] as { id?: unknown }).id ?? `group-${g.rep}`) : null
      for (const m of g.members) {
        out[m].copies = g.members.length
        out[m].group_of = groupOf
      }
      out[g.rep].group_pnl = Math.round(pnl * 100) / 100
    }
  }
  return out
}

// The trades that count: one per decision, no day-total entries
export const countable = <T extends { is_copy?: boolean; kind?: string }>(trades: T[]) =>
  trades.filter(t => t.kind !== "day_total" && !t.is_copy)

// ---- The same trade seen twice
// A trader can have one account open on two platforms at once (for example Tradovate through TradingView and
// the Tradovate site). Each platform records the trade under its own IDs, so it would be counted twice.
// Two trades are the same one when they are on different platforms, belong to the same account, and match on
// instrument, direction, size, both prices and both times.

type DuplicateCandidate = CopyCandidate & {
  platform?: string | null
  qty?: number | null
  entry_price?: number | null
  exit_price?: number | null
}

const accountKey = (account?: string | null) => (account ?? "").replace(/^[^:]*:/, "").toLowerCase()
function sameAccount(a?: string | null, b?: string | null) {
  const x = accountKey(a), y = accountKey(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}
const near = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-6

export function dropDuplicates<T extends DuplicateCandidate>(trades: T[]): T[] {
  const sameTrade = (a: T, b: T) =>
    !!a.platform && !!b.platform && a.platform !== b.platform &&
    !!a.symbol && !!b.symbol && instrumentOf(a.symbol) === instrumentOf(b.symbol) &&
    a.side === b.side && near(a.qty, b.qty) && near(a.entry_price, b.entry_price) && near(a.exit_price, b.exit_price) &&
    sameAccount(a.account, b.account) &&
    Math.abs(Date.parse(a.closed_at) - Date.parse(b.closed_at)) <= 3000 &&
    (!a.opened_at || !b.opened_at || Math.abs(Date.parse(a.opened_at) - Date.parse(b.opened_at)) <= 3000)

  const kept: T[] = []
  const byTime = [...trades].sort((a, b) => Date.parse(a.closed_at) - Date.parse(b.closed_at))
  for (const t of byTime) {
    const i = kept.findIndex(k => k.kind !== "day_total" && t.kind !== "day_total" && sameTrade(k, t))
    if (i === -1) kept.push(t)
    // Prefer the platform's own data over what was read from TradingView's panel
    else if (kept[i].platform === "tradingview" && t.platform !== "tradingview") kept[i] = t
  }
  // Same order as it came in
  const keptSet = new Set(kept)
  return trades.filter(t => keptSet.has(t))
}

// What every part of the app does with a list of trades before counting: drop duplicates, then mark copies
export const prepareTrades = <T extends DuplicateCandidate>(trades: T[]) => markCopies(dropDuplicates(trades))
