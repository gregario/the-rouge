import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// GET /api/progress — Get synced progress
export async function GET() {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('synced_progress')
    .select('*')
    .eq('account_id', user.id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json(data)
}

// PUT /api/progress — Sync progress to server
export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServer()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('synced_progress')
    .update({
      completed_items: body.completedItems || [],
      completed_at: body.completedAt || {},
      category_badges: body.categoryBadges || [],
      current_streak: body.currentStreak || 0,
      longest_streak: body.longestStreak || 0,
      last_played_date: body.lastPlayedDate || null,
      daily_stamps: body.dailyStamps || [],
      total_quiz_correct: body.totalQuizCorrect || 0,
      total_quiz_answered: body.totalQuizAnswered || 0,
    })
    .eq('account_id', user.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
