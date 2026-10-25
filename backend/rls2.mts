import { createClient } from "@supabase/supabase-js"
const url = process.env.SUPABASE_URL!
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "ramdettmer751+test@gmail.com" })
const user = createClient(url, anonKey)
const { data: s } = await user.auth.verifyOtp({ token_hash: link!.properties.hashed_token, type: "magiclink" })
const me = s.user!.id
const before = (await admin.from("profiles").select("*").eq("id", me).single()).data!
console.log("test user plan before:", before.plan, "bonus:", before.bonus_credits, "credits_used:", before.credits_used)

// 1. Read: own rows only?
for (const t of ["profiles", "chat_messages", "trades", "rulesets", "pip_notes", "journal_notes", "llm_usage", "analyses", "feedback", "uninstall_feedback", "deleted_accounts", "credit_purchases", "usage_events", "day_reviews", "deleted_trades"]) {
  const { data, error } = await user.from(t).select("*").limit(50)
  const others = (data ?? []).filter((r: any) => (r.user_id ?? r.id) !== me).length
  console.log(`read ${t.padEnd(20)} rows=${data?.length ?? "-"} othersVisible=${others} ${error ? "err " + error.message.slice(0, 60) : ""}`)
}
// 2. Write own profile: plan / credits
const up = await user.from("profiles").update({ plan: "pro_plus" }).eq("id", me).select("plan")
console.log("UPDATE own plan -> pro_plus:", up.error ? "blocked: " + up.error.message.slice(0, 80) : JSON.stringify(up.data))
const up2 = await user.from("profiles").update({ trial_ends_at: "2099-01-01T00:00:00Z" }).eq("id", me).select("trial_ends_at")
console.log("UPDATE own trial_ends_at:", up2.error ? "blocked: " + up2.error.message.slice(0, 80) : JSON.stringify(up2.data))
const up3 = await user.from("profiles").update({ bonus_credits: 999999 }).eq("id", me).select("bonus_credits")
console.log("UPDATE own bonus_credits:", up3.error ? "blocked: " + up3.error.message.slice(0, 80) : JSON.stringify(up3.data))
// 3. RPCs
for (const [fn, args] of [["add_bonus_credits", { p_user_id: me, p_units: 1000, p_session_id: "test-" + Date.now() }], ["refund_usage", { p_user_id: me }], ["refund_credits", { p_user_id: me, p_units: 100 }], ["reset_daily_usage", {}], ["cleanup_old_messages", {}], ["consume_credits", { p_user_id: me, p_units: 1 }], ["increment_usage", { p_user_id: me }], ["get_usage_limits", { p_user_id: me }]] as const) {
  const r = await user.rpc(fn as string, args as any)
  console.log(`rpc ${fn.padEnd(22)}`, r.error ? "blocked/err: " + r.error.message.slice(0, 90) : "ALLOWED: " + JSON.stringify(r.data).slice(0, 80))
}
const after = (await admin.from("profiles").select("*").eq("id", me).single()).data!
console.log("after: plan", after.plan, "trial", after.trial_ends_at, "bonus", after.bonus_credits, "credits_used", after.credits_used)
// restore
const restore: any = {}
for (const k of ["plan", "trial_ends_at", "bonus_credits", "credits_used", "credits_used_date", "message_count", "screenshot_count", "usage_reset_date"]) if (k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k])) restore[k] = before[k]
if (Object.keys(restore).length) { await admin.from("profiles").update(restore).eq("id", me); console.log("restored", Object.keys(restore)) }
