// Traders with several accounts (prop firm evals) often copy one trade to all of them. Those copies are
// one decision, so they count once toward trade counts, win rates, loss streaks and the max-trades limit.
// Profit and loss still adds up across every account: nothing is dropped, only the counting changes.
//
// A copy is a trade on a different account, same instrument and direction, opened within a few seconds.

const WINDOW_MS = 10_000

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
}

export function markCopies<T extends CopyCandidate>(trades: T[]): (T & CopyMark)[] {
  const out = trades.map(t => ({ ...t, is_copy: false, copies: 1, group_pnl: Number(t.realized_pnl ?? 0) })) as (T & CopyMark)[]
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
      for (const m of g.members) out[m].copies = g.members.length
      out[g.rep].group_pnl = Math.round(pnl * 100) / 100
    }
  }
  return out
}

// The trades that count: one per decision, no day-total entries
export const countable = <T extends { is_copy?: boolean; kind?: string }>(trades: T[]) =>
  trades.filter(t => t.kind !== "day_total" && !t.is_copy)
