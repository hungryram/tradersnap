import { NextRequest, NextResponse, after } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"
import { SITE_ORIGINS } from "@/lib/urls"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Only the marketing site's form posts here
function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin && (SITE_ORIGINS.includes(origin) || (process.env.NODE_ENV !== "production" && origin.startsWith("http://localhost")))) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type")
  }
  return response
}

export async function OPTIONS(request: NextRequest) {
  return addCorsHeaders(new NextResponse(null, { status: 200 }), request.headers.get("origin"))
}

// Emails each submission through Postmark. The message is already saved, so a failure here only loses the email.
// Needs POSTMARK_SERVER_TOKEN, and the From address must be a verified sender signature in Postmark.
async function emailFeedback(feedback: { kind: string; message: string; email: string | null; source: string | null; version: string | null }) {
  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token) return
  const label = { bug: "Bug report", idea: "Idea", other: "Feedback" }[feedback.kind] ?? "Feedback"
  const preview = feedback.message.replace(/\s+/g, " ").slice(0, 70)
  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: process.env.FEEDBACK_FROM_EMAIL || "forms@hungryramwebdesign.com",
      To: process.env.FEEDBACK_TO_EMAIL || "ram@hungryram.com",
      // Replying goes straight to the person, when they left an email
      ...(feedback.email ? { ReplyTo: feedback.email } : {}),
      Subject: `Pip ${label.toLowerCase()}: ${preview}`,
      TextBody: [
        feedback.message,
        "",
        "---",
        `Type: ${label}`,
        `From: ${feedback.email ?? "no email left"}`,
        feedback.source ? `Sent from: ${feedback.source}${feedback.version ? ` (v${feedback.version})` : ""}` : null
      ].filter(line => line !== null).join("\n"),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound"
    })
  })
  if (!response.ok) console.error("[Feedback form] Postmark error:", response.status, await response.text().catch(() => ""))
}

const bodySchema = z.object({
  kind: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(5).max(2000),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  source: z.string().max(40).optional(),
  version: z.string().max(20).optional(),
  // A hidden field real people leave empty
  website: z.string().max(200).optional()
})

// POST /api/feedback/submit — the feedback and bug-report form on tradewithpip.ai
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  const reply = (body: object, status = 200) => addCorsHeaders(NextResponse.json(body, { status }), origin)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return reply({ error: "Please add a few words about what happened." }, 400)
  // Bots fill in every field: pretend it worked
  if (parsed.data.website) return reply({ success: true })

  // A flood of submissions is almost certainly a script
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if ((count ?? 0) >= 200) return reply({ error: "We're getting a lot of messages right now. Please try again later." }, 429)

  const row = {
    kind: parsed.data.kind,
    message: parsed.data.message,
    email: parsed.data.email || null,
    source: parsed.data.source ?? null,
    extension_version: parsed.data.version ?? null
  }
  const { error } = await supabase.from("feedback").insert(row)
  // The email is the notification, so a message still reaches you if the table isn't set up yet
  if (error) console.error("[Feedback form] Insert error:", error)
  if (error && !process.env.POSTMARK_SERVER_TOKEN) return reply({ error: "Couldn't send that. Please try again, or email us." }, 500)

  after(() => emailFeedback({ ...row, version: row.extension_version }).catch(err => console.error("[Feedback form] Email failed:", err)))
  return reply({ success: true })
}
