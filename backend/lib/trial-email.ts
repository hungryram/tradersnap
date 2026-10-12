import { APP_URL } from "./urls"
import { PRICES } from "./plans"

// The email that goes out when a Pro trial is about to end. Plain, honest and short: what they used, what
// changes, what Pro costs. No countdown tricks. Sent through Postmark by /api/cron/trial-ending.

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export type TrialEmailInput = {
  firstName: string | null
  endsAt: Date
  checks: number // chart checks run during the trial
  trades: number // trades Pip tracked during the trial
}

export function buildTrialEmail({ firstName, endsAt, checks, trades }: TrialEmailInput, now = new Date()) {
  const days = Math.max(1, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000))
  const when = days === 1 ? "tomorrow" : `in ${days} days`
  const date = endsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })
  const greeting = firstName ? `Hi ${firstName},` : "Hi,"
  const link = `${APP_URL}/dashboard/account#plans`

  // Only say what actually happened
  const used: string[] = []
  if (checks > 0) used.push(`${checks} chart ${checks === 1 ? "check" : "checks"}`)
  if (trades > 0) used.push(`${trades} ${trades === 1 ? "trade" : "trades"} tracked`)
  const usedLine = used.length ? `So far you've had ${used.join(" and ")} with Pip.` : ""

  const after = "Your account, rules and everything you've logged stay. You move to the Free plan: about 5 chart checks and 15 messages a day, one strategy, and your journal for the last 7 days."
  const pro = `If you want to keep Pro, it's $${PRICES.pro.month} a month or $${PRICES.pro.year} a year: about 30 chart checks and 150 messages a day, up to 5 strategies, your full journal history, day reviews, and Pip reading your journal notes.`
  const nothing = "No card was needed to start, and nothing is charged unless you choose a plan."

  const subject = days === 1 ? "Your Pip trial ends tomorrow" : `Your Pip trial ends in ${days} days`

  const text = [
    greeting,
    "",
    `Your free week of Pro ends ${when} (${date}). ${usedLine}`.trim(),
    "",
    after,
    "",
    pro,
    "",
    `See the plans: ${link}`,
    "",
    nothing + " If you have a question, just reply to this email.",
    "",
    "Pip"
  ].join("\n")

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e5ecf6">
<div style="max-width:520px;margin:0 auto;background:#111a2e;border:1px solid #1f2d4a;border-radius:14px;padding:28px">
<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px">Your free week of Pro ends <strong>${when}</strong> (${escapeHtml(date)}). ${escapeHtml(usedLine)}</p>
<p style="margin:0 0 16px;color:#b6c4da">${escapeHtml(after)}</p>
<p style="margin:0 0 24px;color:#b6c4da">${escapeHtml(pro)}</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#2ab69c;color:#08111f;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:10px">See the plans</a></p>
<p style="margin:0 0 8px;color:#8ea0bb;font-size:14px">${escapeHtml(nothing)} If you have a question, just reply to this email.</p>
<p style="margin:16px 0 0">Pip</p>
</div></body></html>`

  return { subject, text, html }
}
