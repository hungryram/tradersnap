import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { buildTrialEmail } from "@/lib/trial-email"

// Runs once a day (vercel.json). Emails each trial that ends within the next 48 hours, once, through Postmark.
// Vercel sends CRON_SECRET as a Bearer token; without it set, the job is off. Add ?dry=1 to see who it would email.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const WINDOW_HOURS = 48
const MAX_PER_RUN = 200

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const dry = request.nextUrl.searchParams.get("dry") === "1"

  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token && !dry) return NextResponse.json({ error: "POSTMARK_SERVER_TOKEN is not set" }, { status: 503 })

  const now = new Date()
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, plan, trial_ends_at, uninstalled_at")
    .is("trial_ending_email_sent_at", null)
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000).toISOString())
    .limit(MAX_PER_RUN)
  if (error) {
    // Before 20261027_trial_email.sql there's no sent-at column
    console.error("[Trial email] Lookup failed:", error.message)
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 })
  }

  // Still on the trial (not subscribed), and still using Pip (an uninstall means they've left)
  const due = (profiles ?? []).filter(p => (!p.plan || p.plan === "free") && p.email && !p.uninstalled_at)
  const results: { email: string; sent: boolean; reason?: string }[] = []

  for (const p of due) {
    const endsAt = new Date(p.trial_ends_at)
    const [{ count: checks }, { count: trades }] = await Promise.all([
      supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", p.id).gte("created_at", new Date(endsAt.getTime() - 7 * 86_400_000).toISOString()),
      supabase.from("trades").select("id", { count: "exact", head: true }).eq("user_id", p.id).neq("source", "manual").gte("closed_at", new Date(endsAt.getTime() - 7 * 86_400_000).toISOString())
    ])
    const email = buildTrialEmail({ firstName: p.first_name?.trim() || null, endsAt, checks: checks ?? 0, trades: trades ?? 0 }, now)

    if (dry) { results.push({ email: p.email, sent: false, reason: `dry run: "${email.subject}"` }); continue }

    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": token! },
      body: JSON.stringify({
        From: process.env.TRIAL_EMAIL_FROM || process.env.FEEDBACK_FROM_EMAIL || "forms@hungryramwebdesign.com",
        To: p.email,
        ReplyTo: process.env.FEEDBACK_TO_EMAIL || "ram@hungryram.com",
        Subject: email.subject,
        TextBody: email.text,
        HtmlBody: email.html,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound"
      })
    }).catch(() => null)

    if (!response?.ok) {
      console.error("[Trial email] Postmark error:", response?.status, await response?.text().catch(() => ""))
      results.push({ email: p.email, sent: false, reason: "postmark failed" })
      continue
    }
    // Once per account, even if the job runs again
    await supabase.from("profiles").update({ trial_ending_email_sent_at: now.toISOString() }).eq("id", p.id)
    results.push({ email: p.email, sent: true })
  }

  return NextResponse.json({ checked: profiles?.length ?? 0, due: due.length, sent: results.filter(r => r.sent).length, ...(dry ? { dry: true, results } : {}) })
}
