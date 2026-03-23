import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// POST /api/accounts/sign-in — Send magic link
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { email } = body

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const supabase = await createSupabaseServer()

  // Always return same response to prevent account enumeration (AC-ACCT-11 security)
  await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
    },
  })

  return NextResponse.json({
    message: 'If an account exists, we\'ve sent a sign-in link.',
  })
}
