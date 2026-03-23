import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// POST /api/accounts — Create account (sign up with magic link)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email, displayName, guardianConfirmed } = body

  if (!email || !guardianConfirmed) {
    return NextResponse.json(
      { error: 'Email and guardian confirmation required' },
      { status: 400 }
    )
  }

  if (displayName && displayName.length > 30) {
    return NextResponse.json(
      { error: 'Display name must be 30 characters or less' },
      { status: 400 }
    )
  }

  const supabase = await createSupabaseServer()

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: {
        display_name: displayName || '',
        guardian_confirmed: guardianConfirmed,
      },
      emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
    },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(
    {
      accountId: (data as unknown as { user?: { id: string } }).user?.id ?? null,
      status: 'pending_verification',
    },
    { status: 201 }
  )
}

// DELETE /api/accounts — Delete account and all server data
export async function DELETE() {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Delete profile (cascades to synced_progress)
  const { error: deleteError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Sign out
  await supabase.auth.signOut()

  return NextResponse.json({ deleted: true })
}
