import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const updateProfileSchema = z.object({
  first_name: z.string().max(50).optional(),
  last_name: z.string().max(50).optional(),
  email: z.string().email().optional() // ignored: see below
})

// PATCH /api/profile - Update user profile
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await request.json()
    const validated = updateProfileSchema.parse(body)

    // Update profile fields (first_name, last_name)
    const profileUpdates: any = {}
    if (validated.first_name !== undefined) profileUpdates.first_name = validated.first_name
    if (validated.last_name !== undefined) profileUpdates.last_name = validated.last_name

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", user.id)

      if (profileError) {
        console.error("Profile update error:", profileError)
        return NextResponse.json(
          { error: "Failed to update profile" },
          { status: 500 }
        )
      }
    }

    // Email changes don't happen here: the dashboard asks Supabase directly, which only switches the address once
    // the link sent to the new one is clicked (changing it here, with admin rights, skipped that check)
    return NextResponse.json({ success: true, message: "Profile updated successfully" })

  } catch (error) {
    console.error("PATCH /api/profile error:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
