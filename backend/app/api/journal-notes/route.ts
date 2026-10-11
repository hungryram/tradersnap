import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { features, loadPlan } from "@/lib/plans"

// Notes on journal days. Free to write; the Free plan keeps them for its history
// window (the same as the calendar), paid plans keep all of them.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.substring(7))
  return error ? null : user
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// Earliest day (YYYY-MM-DD) the plan can see, by the trader's local "today"; null = no limit
function earliestDay(historyDays: number | null, today: string) {
  if (!historyDays) return null
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (historyDays - 1))
  return d.toISOString().slice(0, 10)
}

// GET /api/journal-notes?from=YYYY-MM-DD&to=YYYY-MM-DD&today=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const params = request.nextUrl.searchParams
  const parsed = z.object({ from: day, to: day, today: day }).safeParse({ from: params.get("from"), to: params.get("to"), today: params.get("today") })
  if (!parsed.success) return NextResponse.json({ error: "Invalid range" }, { status: 400 })

  const { plan } = await loadPlan(supabase, user.id)
  const earliest = earliestDay(features(plan).historyDays, parsed.data.today)
  const from = earliest && earliest > parsed.data.from ? earliest : parsed.data.from

  const { data, error } = await supabase
    .from("journal_notes")
    .select("day, text, updated_at")
    .eq("user_id", user.id)
    .gte("day", from)
    .lte("day", parsed.data.to)
  if (error) return NextResponse.json({ notes: [], earliest, setupNeeded: true })
  return NextResponse.json({ notes: data ?? [], earliest })
}

// PUT /api/journal-notes { day, text, today } — save (or clear, with empty text) a day's note
export async function PUT(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = z.object({ day, today: day, text: z.string().max(4000) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Notes are up to 4,000 characters." }, { status: 400 })

  const { plan } = await loadPlan(supabase, user.id)
  const earliest = earliestDay(features(plan).historyDays, parsed.data.today)
  if ((earliest && parsed.data.day < earliest) || parsed.data.day > parsed.data.today) {
    return NextResponse.json({ error: "The Free plan keeps notes for your last 7 days. Pro keeps all of them." }, { status: 403 })
  }

  const text = parsed.data.text.trim()
  const { error } = text
    ? await supabase.from("journal_notes").upsert({ user_id: user.id, day: parsed.data.day, text, updated_at: new Date().toISOString() })
    : await supabase.from("journal_notes").delete().eq("user_id", user.id).eq("day", parsed.data.day)
  if (error) {
    console.error("[Journal notes] Save failed:", error)
    return NextResponse.json({ error: "Couldn't save the note." }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
