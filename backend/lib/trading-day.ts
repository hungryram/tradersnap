// Which trading day a moment belongs to. Futures trade Sunday to Friday and a session starts at 6 PM New York time
// (3 PM Pacific), so a 7:51 PM Pacific trade on the 12th is part of the 13th. Prop firms reset their daily limits at
// the same kind of boundary. Traders can set when their day starts; the default depends on what they trade.
//
// A rule is "HH:MM" in New York time (so it follows daylight saving), or null for the trader's own midnight.
// backend/lib/trading-day.ts and extension/lib/trading-day.ts are copies of each other: keep them the same.

const NEW_YORK = "America/New_York"
export const FUTURES_DAY_START = "18:00"

export type DayRule = string | null | undefined

type Profile = { markets?: string[]; day_start?: string | null } | null | undefined

// What the trader chose ("midnight" or "HH:MM"), else the default for what they trade
export function dayRuleOf(profile: Profile): string | null {
  const chosen = profile?.day_start
  if (typeof chosen === "string") return /^\d{2}:\d{2}$/.test(chosen) ? chosen : null
  return profile?.markets?.includes("futures") ? FUTURES_DAY_START : null
}

const pad = (n: number) => String(n).padStart(2, "0")
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const startMinutes = (rule: DayRule) => (rule && /^\d{2}:\d{2}$/.test(rule) ? Number(rule.slice(0, 2)) * 60 + Number(rule.slice(3, 5)) : null)

// Calendar date and minutes into the day, in a time zone (the runtime's own when none is given)
function partsIn(date: Date, timeZone?: string) {
  if (!timeZone) return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate(), minutes: date.getHours() * 60 + date.getMinutes() }
  const found: Record<string, number> = {}
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date)) {
    if (p.type !== "literal") found[p.type] = Number(p.value)
  }
  return { y: found.year, m: found.month, d: found.day, minutes: found.hour * 60 + found.minute }
}

export function addDays(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return keyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

// The moment a wall-clock time happens on a calendar date in a time zone
function wallClockToInstant(key: string, minutes: number, timeZone?: string) {
  const [y, m, d] = key.split("-").map(Number)
  if (!timeZone) return new Date(y, m - 1, d, 0, minutes)
  const wanted = Date.UTC(y, m - 1, d, 0, minutes)
  let instant = wanted
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(instant), timeZone)
    instant += wanted - Date.UTC(p.y, p.m - 1, p.d, 0, p.minutes)
  }
  return new Date(instant)
}

// "2026-10-13" for a trade closed at 7:51 PM Pacific on the 12th (under a 6 PM New York rule)
export function tradingDayKey(when: Date | string, rule: DayRule, timeZone?: string) {
  const date = typeof when === "string" ? new Date(when) : when
  const start = startMinutes(rule)
  if (start === null) {
    const p = partsIn(date, timeZone)
    return keyOf(p.y, p.m, p.d)
  }
  const p = partsIn(date, NEW_YORK)
  const key = keyOf(p.y, p.m, p.d)
  return start > 0 && p.minutes >= start ? addDays(key, 1) : key
}

// When a trading day begins. Its end is the start of the next one.
export function tradingDayStart(key: string, rule: DayRule, timeZone?: string) {
  const start = startMinutes(rule)
  if (start === null) return wallClockToInstant(key, 0, timeZone)
  return start > 0 ? wallClockToInstant(addDays(key, -1), start, NEW_YORK) : wallClockToInstant(key, 0, NEW_YORK)
}

// The start of the trading day it is right now, or of the one `daysAgo` before
export function currentTradingDayStart(rule: DayRule, timeZone?: string, daysAgo = 0, now = new Date()) {
  return tradingDayStart(addDays(tradingDayKey(now, rule, timeZone), -daysAgo), rule, timeZone)
}

export const DAY_START_CHOICES = [
  { id: "midnight", label: "Midnight, my time" },
  { id: "18:00", label: "6:00 PM Eastern (futures open)" },
  { id: "17:00", label: "5:00 PM Eastern (many prop firms)" }
] as const
